// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as crypto from "crypto";
import * as pulumi from "pulumi";
import { Function } from "./function";

// StaticFile is a registered static file route, backed by an S3 bucket.
export interface StaticFile {
    path: string;
    filePath: string;
    contentType?: string;
}

// Route is a registered dynamic route, backed by a serverless Lambda.
export interface Route {
    method: string;
    path: string;
    handlers: cloud.RouteHandler[];
}

export class HttpEndpoint implements cloud.HttpEndpoint {
    private readonly name: string;
    private readonly staticFiles: StaticFile[];
    private readonly routes: Route[];
    private readonly customDomains: cloud.Domain[];

    // Outside API (constructor and methods)

    constructor(name: string) {
        this.name = name;
        this.staticFiles = [];
        this.routes = [];
        this.customDomains = [];
    }

    public staticFile(path: string, filePath: string, contentType?: string) {
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        this.staticFiles.push({ path: path, filePath: filePath, contentType: contentType });
    }

    public route(method: string, path: string, ...handlers: cloud.RouteHandler[]) {
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        this.routes.push({ method: method, path: path, handlers: handlers });
    }

    public get(path: string, ...handlers: cloud.RouteHandler[]) {
        this.route("GET", path, ...handlers);
    }

    public put(path: string, ...handlers: cloud.RouteHandler[]) {
        this.route("PUT", path, ...handlers);
    }

    public post(path: string, ...handlers: cloud.RouteHandler[]) {
        this.route("POST", path, ...handlers);
    }

    public delete(path: string, ...handlers: cloud.RouteHandler[]) {
        this.route("DELETE", path, ...handlers);
    }

    public options(path: string, ...handlers: cloud.RouteHandler[]) {
        this.route("OPTIONS", path, ...handlers);
    }

    public all(path: string, ...handlers: cloud.RouteHandler[]) {
        this.route("ANY", path, ...handlers);
    }

    public attachCustomDomain(domain: cloud.Domain): void {
        this.customDomains.push(domain);
    }

    public publish(): cloud.HttpDeployment {
        // Create a unique name prefix that includes the name plus all the registered routes.
        const name: string = `${this.name}_${this.createUniqueName()}`;
        return new HttpDeployment(name, this.staticFiles, this.routes, this.customDomains);
    }

    /**
     * createUniqueName will create a unique name for the given HttpEndpoint name, plus its routes, etc.
     */
    private createUniqueName(): string {
        return sha1hash(JSON.stringify({
            name: this.name,
            staticFiles: this.staticFiles,
            routes: this.routes,
            customDomains: this.customDomains,
        }));
    }
}

// HttpDeployment actually performs a deployment of a set of HTTP API Gateway resources.
export class HttpDeployment extends pulumi.ComponentResource implements cloud.HttpDeployment {
    public readonly staticFiles: StaticFile[];
    public readonly customDomains: cloud.Domain[];

    public /*out*/ readonly url: pulumi.Computed<string>; // the URL for this deployment.
    public /*out*/ readonly customDomainNames: pulumi.Computed<string>[]; // any custom domain names.

    private static registerStaticRoutes(apiName: string, routes: StaticFile[], swagger: SwaggerSpec) {
        const method: string = swaggerMethod("GET");
        let bucket: aws.s3.Bucket | undefined; // lazily allocated S3 bucket
        for (const route of routes) {
            const name = apiName + sha1hash(method + ":" + route.path);

            // Create a role and attach it so that this route can access the AWS bucket.
            const role = new aws.iam.Role(name, {
                assumeRolePolicy: JSON.stringify(apigatewayAssumeRolePolicyDocument),
            });
            const attachment = new aws.iam.RolePolicyAttachment(name, {
                role: role,
                policyArn: aws.iam.AmazonS3FullAccess,
            });

            // We will need a bucket for all static files that are part of this deployment.
            if (!bucket) {
                bucket = new aws.s3.Bucket(safeS3BucketName(apiName));
            }

            // Upload the static file as an S3 object.
            const obj = new aws.s3.BucketObject(name, {
                bucket: bucket,
                key: name,
                source: new pulumi.asset.FileAsset(route.filePath),
                contentType: route.contentType,
            });

            if (!swagger.paths[route.path]) {
                swagger.paths[route.path] = {};
            }
            swagger.paths[route.path][method] = createPathSpecObject(role, bucket, name);
        }
    }

    private static registerRoutes(apiName: string, routes: Route[], swagger: SwaggerSpec): {[key: string]: Function} {
        const lambdas: {[key: string]: Function} = {};
        for (const route of routes) {
            const method: string = swaggerMethod(route.method);
            const lambda = new Function(
                apiName + sha1hash(method + ":" + route.path),
                (ev: APIGatewayRequest, ctx, cb) => {
                    let body: any;
                    if (ev.body !== null) {
                        if (ev.isBase64Encoded) {
                            body = Buffer.from(ev.body, "base64");
                        } else {
                            body = Buffer.from(ev.body, "utf8");
                        }
                    }

                    ctx.callbackWaitsForEmptyEventLoop = false;

                    const reqres = apiGatewayToRequestResponse(ev, body, cb);
                    let i = 0;
                    const next = () => {
                        const nextHandler = route.handlers[i++];
                        if (nextHandler !== undefined) {
                            nextHandler(reqres.req, reqres.res, next);
                        }
                    };
                    next();
                },
            );
            lambdas[method + ":" + route.path] = lambda;

            if (!swagger.paths[route.path]) {
                swagger.paths[route.path] = {};
            }
            swagger.paths[route.path][method] = createPathSpecLambda(lambda.lambda);
        }
        return lambdas;
    }

    private static registerCustomDomains(apiName: string, api: aws.apigateway.RestApi,
                                         domains: cloud.Domain[]): pulumi.Computed<string>[] {
        const names: pulumi.Computed<string>[] = [];
        for (const domain of domains) {
            const awsDomain = new aws.apigateway.DomainName(apiName + "-" + domain.domainName, {
                domainName: domain.domainName,
                certificateName: domain.domainName,
                certificateBody: domain.certificateBody,
                certificatePrivateKey: domain.certificatePrivateKey,
                certificateChain: domain.certificateChain,
            });

            const basePathMapping = new aws.apigateway.BasePathMapping(apiName + "-" + domain.domainName, {
                restApi: api,
                stageName: stageName,
                domainName: awsDomain.domainName,
            });

            names.push(awsDomain.cloudfrontDomainName);
        }
        return names;
    }

    constructor(name: string, staticFiles: StaticFile[], routes: Route[], customDomains: cloud.Domain[]) {
        super(
            "cloud:http:HttpDeployment",
            name,
            {
                staticFiles: staticFiles,
                routes: routes,
                customDomains: customDomains,
            },
            () => {
                // Create a SwaggerSpec and then expand out all of the static files and routes.
                const swagger: SwaggerSpec = createBaseSpec(name);
                HttpDeployment.registerStaticRoutes(name, staticFiles, swagger);
                const lambdas: {[key: string]: Function} = HttpDeployment.registerRoutes(name, routes, swagger);

                // Now stringify the resulting swagger specification and create the various API Gateway objects.
                const api = new aws.apigateway.RestApi(name, {
                    body: createSwaggerString(swagger),
                });

                const deployment = new aws.apigateway.Deployment(name, {
                    restApi: api,
                    stageName: "",
                    description: "Deployment of version " + name,
                });

                const stage = new aws.apigateway.Stage(name, {
                    stageName: stageName,
                    description: "The current deployment of the API.",
                    restApi: api,
                    deployment: deployment,
                });

                // Ensure that the permissions allow the API Gateway to invoke the lambdas.
                for (const path of Object.keys(swagger.paths)) {
                    for (let method of Object.keys(swagger.paths[path])) {
                        const lambda = lambdas[method + ":" + path];
                        if (lambda !== undefined) {
                            if (method === "x-amazon-apigateway-any-method") {
                                method = "*";
                            }
                            else {
                                method = method.toUpperCase();
                            }
                            const permissionName = name + "_invoke_" + sha1hash(method + path);
                            const invokePermission = new aws.lambda.Permission(permissionName, {
                                action: "lambda:invokeFunction",
                                function: lambda.lambda,
                                principal: "apigateway.amazonaws.com",
                                sourceArn: deployment.executionArn.then((arn: aws.ARN | undefined) =>
                                    arn && (arn + stageName + "/" + method + path)),
                            });
                        }
                    }
                }

                // If there are any custom domains, attach them now.
                const customDomainNames: pulumi.Computed<string>[] =
                    HttpDeployment.registerCustomDomains(name, api, customDomains);

                // Finally, manufacture a URL and set it as an output property.
                return {
                    url: deployment.invokeUrl,
                    customDomainNames: customDomainNames,
                };
            },
        );
    }
}

// sha1hash returns a partial SHA1 hash of the input string.
function sha1hash(s: string): string {
    const shasum: crypto.Hash = crypto.createHash("sha1");
    shasum.update(s);
    // TODO[pulumi/pulumi#377] Workaround for issue with long names not generating per-deplioyment randomness, leading
    //     to collisions.  For now, limit the size of hashes to ensure we generate shorter/ resource names.
    return shasum.digest("hex").substring(0, 8);
}

interface SwaggerSpec {
    swagger: string;
    info: SwaggerInfo;
    paths: { [path: string]: { [method: string]: Promise<SwaggerOperation>; }; };
    "x-amazon-apigateway-binary-media-types"?: string[];
}

// createSwaggerString creates a JSON string out of a Swagger spec object.  This is required versus an
// ordinary JSON.stringify because the spec contains computed values.
async function createSwaggerString(spec: SwaggerSpec): Promise<string> {
    const paths: {[path: string]: {[method: string]: SwaggerOperation} } = {};
    for (const path of Object.keys(spec.paths)) {
        paths[path] = {};
        for (const method of Object.keys(spec.paths[path])) {
            paths[path][method] = await spec.paths[path][method];
        }
    }

    // After all values have settled, we can produce the resulting string.
    return JSON.stringify({
        swagger: spec.swagger,
        info: spec.info,
        paths: paths,
        "x-amazon-apigateway-binary-media-types": spec["x-amazon-apigateway-binary-media-types"],
    });
}

interface SwaggerInfo {
    title: string;
    version: string;
}

interface SwaggerOperation {
    responses?: { [code: string]: SwaggerResponse };
    "x-amazon-apigateway-integration": {
        uri: string;
        passthroughBehavior?: string;
        httpMethod: string;
        type: string;
        credentials?: string;
        responses?: { [pattern: string]: SwaggerAPIGatewayIntegrationResponse };
    };
}

interface SwaggerResponse {
    description: string;
    schema?: SwaggerSchema;
    headers?: { [header: string]: SwaggerHeader };
}

interface SwaggerSchema {
    type: string;
}

interface SwaggerHeader {
    type: "string" | "number" | "integer" | "boolean" | "array";
    items?: SwaggerItems;
}

interface SwaggerItems {
    type: "string" | "number" | "integer" | "boolean" | "array";
    items?: SwaggerItems;
}

interface SwaggerAPIGatewayIntegrationResponse {
    statusCode: string;
    responseParameters?: { [key: string]: string };
}

function createBaseSpec(apiName: string): SwaggerSpec {
    return {
        swagger: "2.0",
        info: { title: apiName, version: "1.0" },
        paths: {},
        "x-amazon-apigateway-binary-media-types": [ "*/*" ],
    };
}

async function createPathSpecLambda(lambda: aws.lambda.Function): Promise<SwaggerOperation> {
    const region = aws.config.requireRegion();
    const lambdaARN: aws.ARN = await lambda.arn || "computed(lambda.arn)";
    return {
        "x-amazon-apigateway-integration": {
            uri: "arn:aws:apigateway:" + region + ":lambda:path/2015-03-31/functions/" + lambdaARN + "/invocations",
            passthroughBehavior: "when_no_match",
            httpMethod: "POST",
            type: "aws_proxy",
        },
    };
}

async function createPathSpecObject(role: aws.iam.Role,
                                    bucket: aws.s3.Bucket, key: string): Promise<SwaggerOperation> {
    const region = aws.config.requireRegion();
    const roleARN: aws.ARN = await role.arn || "computed(role.arn)";
    const bucketName: string = await bucket.bucket || "computed(bucket.name)";
    return {
        responses: {
            "200": {
                description: "200 response",
                schema: { type: "object" },
                headers: {
                    "Content-Type": { type: "string" },
                    "content-type": { type: "string" },
                },
            },
            "400": {
                description: "400 response",
            },
            "500": {
                description: "500 response",
            },
        },
        "x-amazon-apigateway-integration": {
            credentials: roleARN,
            uri: "arn:aws:apigateway:" + region + ":s3:path/" + bucketName + "/" + key,
            passthroughBehavior: "when_no_match",
            httpMethod: "GET",
            type: "aws",
            responses: {
                "4\\d{2}": {
                    statusCode: "400",
                },
                "default": {
                    statusCode: "200",
                    responseParameters: {
                        "method.response.header.Content-Type": "integration.response.header.Content-Type",
                        "method.response.header.content-type": "integration.response.header.content-type",
                    },
                },
                "5\\d{2}": {
                    statusCode: "500",
                },
            },
        },
    };
}

function swaggerMethod(method: string): string {
    switch (method.toLowerCase()) {
        case "get":
        case "put":
        case "post":
        case "delete":
        case "options":
        case "head":
        case "patch":
            return method.toLowerCase();
        case "any":
            return "x-amazon-apigateway-any-method";
        default:
            throw new Error("Method not supported: " + method);
    }
}

const apigatewayAssumeRolePolicyDocument = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "",
            "Effect": "Allow",
            "Principal": {
                "Service": "apigateway.amazonaws.com",
            },
            "Action": "sts:AssumeRole",
        },
    ],
};

interface APIGatewayRequest {
    resource: string;
    path: string;
    httpMethod: string;
    // Note: cloud.Request.headers is typed as { [header: string]: string | string[]; }.  However,
    // currently AWS does not support duplicated headers.  See:
    //
    // https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-known-issues.html
    // > Duplicated headers are not supported."
    headers: { [header: string]: string; };
    queryStringParameters: { [param: string]: string; };
    pathParameters: { [param: string]: string; };
    stageVariables: { [name: string]: string; };
    requestContext: APIGatewayRequestContext;
    body: string;
    isBase64Encoded: boolean;
}

interface APIGatewayRequestContext {
    accountId: string;
    resourceId: string;
    stage: string;
    requestId: string;
    identity: APIGatewayIdentity;
    resourcePath: string;
    httpMethod: string;
    apiId: string;
}

interface APIGatewayIdentity {
    cognitoIdentityPoolId?: string;
    accountId?: string;
    cognitoIdentityId?: string;
    caller?: string;
    apiKey?: string;
    sourceIp?: string;
    cognitoAuthenticationType?: string;
    cognitoAuthenticationProvider?: string;
    userArn?: string;
    userAgent?: string;
    user?: string;
}

interface APIGatewayResponse {
    isBase64Encoded?: boolean;
    statusCode: number;
    headers?: { [header: string]: string; };
    body: string;
}

interface RequestResponse {
    req: cloud.Request;
    res: cloud.Response;
}

const stageName = "stage";
function apiGatewayToRequestResponse(ev: APIGatewayRequest, body: any,
                                     cb: (err: any, result: APIGatewayResponse) => void): RequestResponse {
    const response = {
        statusCode: 200,
        headers: <{[header: string]: string}>{},
        body: Buffer.from([]),
    };
    const req: cloud.Request = {
        headers: ev.headers,
        body: body,
        method: ev.httpMethod,
        params: ev.pathParameters,
        query: ev.queryStringParameters,
        path: ev.path,
        baseUrl: "/" + stageName,
        hostname: ev.headers["Host"],
        protocol: ev.headers["X-Forwarded-Proto"],
    };
    const res: cloud.Response = {
        status: (code: number) => {
            response.statusCode = code;
            return res;
        },
        setHeader: (name: string, value: string) => {
            response.headers![name] = value;
            return res;
        },
        write: (data: string | Buffer, encoding?: string) => {
            if (encoding === undefined) {
                encoding = "utf8";
            }
            if (typeof data === "string") {
                data = Buffer.from(data, encoding);
            }
            response.body = Buffer.concat([response.body, data]);
            return res;
        },
        end: (data?: string | Buffer, encoding?: string) => {
            if (data !== undefined) {
                res.write(data, encoding);
            }
            cb(null, {
                statusCode: response.statusCode,
                headers: response.headers,
                isBase64Encoded: true,
                body: response.body.toString("base64"),
            });
        },
        json: (obj: any) => {
            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify(obj));
        },
    };
    return { req, res };
}

function safeS3BucketName(apiName: string): string {
    return apiName.toLowerCase().replace(/[^a-z0-9\-]/g, "");
}



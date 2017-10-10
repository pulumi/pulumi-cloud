// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as crypto from "crypto";
import * as pulumi from "pulumi";
import { LoggedFunction } from "./function";

declare let JSON: any;
declare let Buffer: any;

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

interface SwaggerSpec {
    swagger: string;
    info: SwaggerInfo;
    paths: { [path: string]: { [method: string]: pulumi.Computed<SwaggerOperation>; }; };
    "x-amazon-apigateway-binary-media-types"?: string[];
}

// jsonStringifySwaggerSpec creates a JSON string out of a Swagger spec object.  This is required versus an
// ordinary JSON.stringify because the spec contains computed values.
function jsonStringifySwaggerSpec(spec: SwaggerSpec): { hash: string, json: pulumi.Computed<string> } {
    let last: pulumi.Computed<void> | undefined;
    const pathValues: {[path: string]: {[method: string]: SwaggerOperation} } = {};
    for (const path of Object.keys(spec.paths)) {
        pathValues[path] = {};
        for (const method of Object.keys(spec.paths[path])) {
            // Set up a callback to remember the final value, and chain it on the previous one.
            const resolvePathValue: pulumi.Computed<void> =
                spec.paths[path][method].then((op: SwaggerOperation) => { pathValues[path][method] = op; });
            last = last ? last.then(() => resolvePathValue) : resolvePathValue;
        }
    }

    // Produce a hash of all the promptly available values.
    const promptSpec = {
        swagger: spec.swagger,
        info: spec.info,
        paths: pathValues,
        "x-amazon-apigateway-binary-media-types": spec["x-amazon-apigateway-binary-media-types"],
    };

    // BUGBUG[pulumi/pulumi#331]: we are skipping hashing of the actual operation objects, because they
    //     are possibly computed, and we need the hash promptly for resource URN creation.  This isn't correct,
    //     and will lead to hash collisions; we need to fix this as part of fixing pulumi/pulumi#331
    const promptHash: string = sha1hash(JSON.stringify(promptSpec));

    // After all values have settled, we can produce the resulting string.
    return {
        hash: promptHash,
        json: last ?
            last.then(() => JSON.stringify(Object.assign({}, promptSpec, { paths: pathValues }))) :
            JSON.stringify(promptSpec),
    };
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

function createPathSpecLambda(lambdaARN: string): SwaggerOperation {
    const region = aws.config.requireRegion();
    return {
        "x-amazon-apigateway-integration": {
            uri: "arn:aws:apigateway:" + region + ":lambda:path/2015-03-31/functions/" + lambdaARN + "/invocations",
            passthroughBehavior: "when_no_match",
            httpMethod: "POST",
            type: "aws_proxy",
        },
    };
}

function createPathSpecObject(roleARN: string, bucket: string, key: string): SwaggerOperation {
    const region = aws.config.requireRegion();
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
            uri: "arn:aws:apigateway:" + region + ":s3:path/" + bucket + "/" + key,
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

interface ReqRes {
    req: cloud.Request;
    res: cloud.Response;
}

type Callback = (err: any, result: APIGatewayResponse) => void;

const apiGatewayToReqRes = (ev: APIGatewayRequest, body: any, cb: Callback): ReqRes => {
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
};

const stageName = "stage";

export class HttpEndpoint implements cloud.HttpEndpoint {
    public url?: pulumi.Computed<string>;

    private api: aws.apigateway.RestApi;
    private deployment: aws.apigateway.Deployment;
    private swaggerSpec: SwaggerSpec;
    private apiName: string;
    private lambdas: { [key: string]: LoggedFunction };
    private bucket: aws.s3.Bucket;

    // Outside API (constructor and methods)

    constructor(apiName: string) {
        this.apiName = apiName;
        this.swaggerSpec = createBaseSpec(apiName);
        this.lambdas = {};
    }

    public staticFile(path: string, filePath: string, contentType?: string) {
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        const method = "GET";
        const swaggerMethod = this.routePrepare(method, path);
        const name = this.apiName + sha1hash(method + ":" + path);
        const rolePolicyJSON = JSON.stringify(apigatewayAssumeRolePolicyDocument);
        const role = new aws.iam.Role(name, {
            assumeRolePolicy: rolePolicyJSON,
        });
        const attachment = new aws.iam.RolePolicyAttachment(name, {
            role: role,
            policyArn: aws.iam.AmazonS3FullAccess,
        });
        if (this.bucket === undefined) {
            this.bucket = new aws.s3.Bucket(this.apiName, {});
        }
        const obj = new aws.s3.BucketObject(name, {
            bucket: this.bucket,
            key: name,
            source: new pulumi.asset.FileAsset(filePath),
            contentType: contentType,
        });
        this.swaggerSpec.paths[path][swaggerMethod] =
            role.arn.then((arn: aws.ARN | undefined) =>
                arn ? this.bucket.bucket.then((bucketName: string | undefined) =>
                    bucketName ? createPathSpecObject(arn, bucketName, name) : undefined) : undefined);
    }

    private routeLambda(method: string, path: string, func: LoggedFunction) {
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        const swaggerMethod = this.routePrepare(method, path);
        this.swaggerSpec.paths[path][swaggerMethod] =
            func.lambda.arn.then((arn: aws.ARN | undefined) => arn ? createPathSpecLambda(arn) : undefined);
        this.lambdas[swaggerMethod + ":" + path] = func;
    }

    private routePrepare(method: string, path: string): string {
        if (this.swaggerSpec.paths[path] === undefined) {
            this.swaggerSpec.paths[path] = {};
        }
        let swaggerMethod: string;
        switch (method.toLowerCase()) {
            case "get":
            case "put":
            case "post":
            case "delete":
            case "options":
            case "head":
            case "patch":
                swaggerMethod = method.toLowerCase();
                break;
            case "any":
                swaggerMethod = "x-amazon-apigateway-any-method";
                break;
            default:
                throw new Error("Method not supported: " + method);
        }
        return swaggerMethod;
    }

    public route(method: string, path: string, ...handlers: cloud.RouteHandler[]) {
        const lambda = new LoggedFunction(
            this.apiName + sha1hash(method + ":" + path),
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
                const reqres = apiGatewayToReqRes(ev, body, cb);
                let i = 0;
                const next = () => {
                    const nextHandler = handlers[i++];
                    if (nextHandler !== undefined) {
                        nextHandler(reqres.req, reqres.res, next);
                    }
                };
                next();
            },
        );
        this.routeLambda(method, path, lambda);
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

    public publish(): pulumi.Computed<string> {
        const { hash, json } = jsonStringifySwaggerSpec(this.swaggerSpec);
        this.api = new aws.apigateway.RestApi(this.apiName, {
            body: json,
        });
        this.deployment = new aws.apigateway.Deployment(this.apiName + "_" + hash, {
            restApi: this.api,
            stageName: "",
            description: "Deployment of version " + hash,
        });
        const stage = new aws.apigateway.Stage(this.apiName + "_stage", {
            stageName: stageName,
            description: "The current deployment of the API.",
            restApi: this.api,
            deployment: this.deployment,
        });

        for (const path of Object.keys(this.swaggerSpec.paths)) {
            for (let method of Object.keys(this.swaggerSpec.paths[path])) {
                const lambda = this.lambdas[method + ":" + path];
                if (lambda !== undefined) {
                    if (method === "x-amazon-apigateway-any-method") {
                        method = "*";
                    }
                    else {
                        method = method.toUpperCase();
                    }
                    const permissionName = this.apiName + "_invoke_" + sha1hash(method + path);
                    const invokePermission = new aws.lambda.Permission(permissionName, {
                        action: "lambda:invokeFunction",
                        function: lambda.lambda,
                        principal: "apigateway.amazonaws.com",
                        sourceArn: this.deployment.executionArn.then((arn: aws.ARN | undefined) =>
                            arn && (arn + stageName + "/" + method + path)),
                    });
                }
            }
        }

        this.url = this.deployment.invokeUrl.then((url: string | undefined) => url && (url + stageName + "/"));
        return this.url;
    }

    public attachCustomDomain(domain: cloud.Domain): pulumi.Computed<string> {
        const awsDomain = new aws.apigateway.DomainName(this.apiName + "-" + domain.domainName, {
            domainName: domain.domainName,
            certificateName: domain.domainName,
            certificateBody: domain.certificateBody,
            certificatePrivateKey: domain.certificatePrivateKey,
            certificateChain: domain.certificateChain,
        });
        const basePathMapping = new aws.apigateway.BasePathMapping(this.apiName + "-" + domain.domainName, {
            restApi: this.api,
            stageName: stageName,
            domainName: awsDomain.domainName,
        });
        return awsDomain.cloudfrontDomainName;
    }
}

// sha1hash returns the SHA1 hash of the input string.
function sha1hash(s: string): string {
    const shasum: crypto.Hash = crypto.createHash("sha1");
    shasum.update(s);
    return shasum.digest("hex");
}

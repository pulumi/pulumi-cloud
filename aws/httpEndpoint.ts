// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as crypto from "crypto";
import * as fs from "fs";
import * as mime from "mime";
import * as fspath from "path";
import * as pulumi from "pulumi";
import * as utils from "./utils";

import { Function } from "./function";
import { Endpoint } from "./service";
import { sha1hash } from "./utils";

// StaticRoute is a registered static file route, backed by an S3 bucket.
export interface StaticRoute {
    path: string;
    localPath: string;
    options: cloud.ServeStaticOptions;
}

// ProxyRoute is a registered proxy route, proxying to either a URL or cloud.Endpoint.
export interface ProxyRoute {
    path: string;
    target: string | pulumi.Output<cloud.Endpoint>;
}

// Route is a registered dynamic route, backed by a serverless Lambda.
export interface Route {
    method: string;
    path: string;
    handlers: cloud.RouteHandler[];
}

// AWSDomain represents a domain with an SSL/TLS certificate available in AWS.
export interface AWSDomain {
    domainName: string;
    certificateArn: pulumi.Input<string>;
}

// Domain represents a hosted domain and associated SSL/TLS certificates.
export type Domain = cloud.Domain | AWSDomain;

// Helper to test whether the Domain is a cloud.Domain or an AWS-specific Domain.
function isCloudDomain(domain: Domain): domain is cloud.Domain {
    return (domain as cloud.Domain).certificateBody !== undefined;
}

export class HttpEndpoint implements cloud.HttpEndpoint {
    private readonly name: string;
    private readonly staticRoutes: StaticRoute[];
    private readonly proxyRoutes: ProxyRoute[];
    private readonly routes: Route[];
    private readonly customDomains: Domain[];
    public deployment?: HttpDeployment;

    constructor(name: string) {
        this.name = name;
        this.staticRoutes = [];
        this.proxyRoutes = [];
        this.routes = [];
        this.customDomains = [];
    }

    public static(path: string, localPath: string, options?: cloud.ServeStaticOptions) {
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        this.staticRoutes.push({ path, localPath, options: options || {} });
    }

    public proxy(path: string, target: string | pulumi.Output<cloud.Endpoint>) {
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        this.proxyRoutes.push({ path, target });
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

    public attachCustomDomain(domain: Domain): void {
        this.customDomains.push(domain);
    }

    public publish(): HttpDeployment {
        if (this.deployment) {
            throw new Error("This endpoint is already published and cannot be re-published.");
        }
        // Create a unique name prefix that includes the name plus all the registered routes.
        this.deployment = new HttpDeployment(
            this.name, this.staticRoutes, this.proxyRoutes, this.routes, this.customDomains);
        return this.deployment;
    }
}

// HttpDeployment actually performs a deployment of a set of HTTP API Gateway resources.
export class HttpDeployment extends pulumi.ComponentResource implements cloud.HttpDeployment {
    public routes: Route[];
    public staticRoutes: StaticRoute[];
    public /*out*/ readonly url: pulumi.Output<string>; // the URL for this deployment.
    public /*out*/ readonly customDomainNames: pulumi.Output<string>[]; // any custom domain names.
    public /*out*/ readonly customDomains: aws.apigateway.DomainName[]; // AWS DomainName objects for custom domains.

    private static registerStaticRoutes(parent: pulumi.Resource, apiName: string,
                                        staticRoutes: StaticRoute[], swagger: SwaggerSpec) {
        // If there are no static files or directories, then we can bail out early.
        if (staticRoutes.length === 0) {
            return;
        }

        const method: string = swaggerMethod("GET");

        // Create a bucket to place all the static data under.
        const bucket = new aws.s3.Bucket(safeS3BucketName(apiName), undefined, {parent});

        function createRole(key: string) {
            // Create a role and attach it so that this route can access the AWS bucket.
            const role = new aws.iam.Role(key, {
                assumeRolePolicy: JSON.stringify(apigatewayAssumeRolePolicyDocument),
            }, {parent});
            const attachment = new aws.iam.RolePolicyAttachment(key, {
                role: role,
                policyArn: aws.iam.AmazonS3FullAccess,
            }, {parent});

            return role;
        }

        // For each static file, just make a simple bucket object to hold it, and create a swagger
        // path that routes from the file path to the arn for the bucket object.
        //
        // For static directories, use greedy api-gateway path matching so that we can map a single
        // api gateway route to all the s3 bucket objects we create for the files in these
        // directories.
        for (const route of staticRoutes) {
            const stat = fs.statSync(route.localPath);
            if (stat.isFile()) {
                processFile(route);
            }
            else if (stat.isDirectory()) {
                processDirectory(route);
            }
        }

        function createBucketObject(key: string, localPath: string, contentType?: string) {
            const obj = new aws.s3.BucketObject(key, {
                bucket: bucket,
                key: key,
                source: new pulumi.asset.FileAsset(localPath),
                contentType: contentType || mime.getType(localPath) || undefined,
            }, {parent});
        }

        function processFile(route: StaticRoute) {
            const key = apiName + sha1hash(method + ":" + route.path);
            const role = createRole(key);

            createBucketObject(key, route.localPath, route.options.contentType);

            const pathSpec = createPathSpecObject(bucket, key, role);
            swagger.paths[route.path] = { [method]: pathSpec };
        }

        function processDirectory(directory: StaticRoute) {
            const directoryServerPath = directory.path.endsWith("/")
                ? directory.path
                : directory.path + "/";

            const directoryKey = apiName + sha1hash(method + ":" + directoryServerPath);
            const role = createRole(directoryKey);

            let startDir = directory.localPath.startsWith("/")
                ? directory.localPath
                : fspath.join(process.cwd(), directory.localPath);

            if (!startDir.endsWith(fspath.sep)) {
                startDir = fspath.join(startDir, fspath.sep);
            }

            const options = directory.options;

            // If the user has supplied 'false' for options.index, then no speciam index file served
            // at the root. Otherwise if they've supplied an actual filename to serve as the index
            // file then use what they've provided.  Otherwise attempt to serve "index.html" at the
            // root (if it exists).
            const indexFile = options && options.index === false
                ? undefined
                : options !== undefined && typeof options.index === "string"
                    ? options.index
                    : "index.html";

            const indexPath = indexFile === undefined ? undefined : fspath.join(startDir, indexFile);

            // Recursively walk the directory provided, creating bucket objects for all the files we
            // encounter.
            function walk(dir: string) {
                const children = fs.readdirSync(dir);

                for (const childName of children) {
                    const childPath = fspath.join(dir, childName);
                    const stats = fs.statSync(childPath);

                    if (stats.isDirectory()) {
                        walk(childPath);
                    }
                    else if (stats.isFile()) {
                        const childRelativePath = childPath.substr(startDir.length);
                        const childUrn = directoryKey + "/" + childRelativePath;

                        createBucketObject(childUrn, childPath);

                        if (childPath === indexPath) {
                            // We hit the file that we also want to serve as the index file. Create
                            // a specific swagger path from the server root path to it.
                            const indexPathSpec = createPathSpecObject(bucket, childUrn, role);
                            swagger.paths[directoryServerPath] = { [method]: indexPathSpec };
                        }
                    }
                }
            }

            walk(startDir);

            // Take whatever path the client wants to host this folder at, and add the
            // greedy matching predicate to the end.

            const swaggerPath = directoryServerPath + "{proxy+}";
            const pathSpec = createPathSpecObject(bucket, directoryKey, role, "proxy");
            swagger.paths[swaggerPath] = { [swaggerMethod("any")]: pathSpec };
        }
    }

    private static registerProxyRoutes(parent: pulumi.Resource, apiName: string,
                                       proxyRoutes: ProxyRoute[], swagger: SwaggerSpec) {
        const method = "x-amazon-apigateway-any-method";
        for (const route of proxyRoutes) {
            const swaggerPath = route.path.endsWith("/")
                ? route.path
                : route.path + "/";
            const swaggerPathProxy = swaggerPath + "{proxy+}";

            // If this is an Endpoint proxy, create a VpcLink to the load balancer in the VPC
            let vpcLink: aws.apigateway.VpcLink | undefined = undefined;
            if (typeof route.target !== "string") {
                const targetArn = route.target.apply(t => {
                    const endpoint = t as Endpoint;
                    if (!endpoint.loadBalancer) {
                        throw new Error("AWS endpoint proxy requires an AWS Endpoint");
                    }
                    return endpoint.loadBalancer.loadBalancerType.apply(loadBalancerType => {
                        if (loadBalancerType === "application") {
                            // We can only support proxying to an Endpoint if it is backed by an
                            // NLB, which will only be the case for cloud.Service ports exposed as
                            // type "tcp".
                            throw new Error("AWS endpoint proxy requires an Endpoint on a service port of type 'tcp'");
                        }
                        return endpoint.loadBalancer.arn;
                    });
                });
                const name = apiName + sha1hash(route.path);
                vpcLink = new aws.apigateway.VpcLink(name, {
                    targetArn: targetArn,
                });
            }

            // Register two paths in the Swagger spec, for the root and for a catch all under the root
            swagger.paths[swaggerPath] = {
                [method]:  createPathSpecProxy(route.target, vpcLink, false),
            };
            swagger.paths[swaggerPathProxy] = {
                [method]: createPathSpecProxy(route.target, vpcLink, true),
            };
        }
    }

    private static registerRoutes(parent: pulumi.Resource, apiName: string,
                                  routes: Route[], swagger: SwaggerSpec): {[key: string]: Function} {
        const lambdas: {[key: string]: Function} = {};
        for (const route of routes) {
            const method: string = swaggerMethod(route.method);
            const lambda = new Function(
                apiName + sha1hash(method + ":" + route.path),
                (ev: APIGatewayRequest, ctx, cb) => {
                    let body: Buffer;
                    if (ev.body !== null) {
                        if (ev.isBase64Encoded) {
                            body = Buffer.from(ev.body, "base64");
                        } else {
                            body = Buffer.from(ev.body, "utf8");
                        }
                    } else {
                        body = Buffer.from([]);
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
                { parent: parent },
            );
            lambdas[method + ":" + route.path] = lambda;

            if (!swagger.paths[route.path]) {
                swagger.paths[route.path] = {};
            }
            swagger.paths[route.path][method] = createPathSpecLambda(lambda.lambda);
        }
        return lambdas;
    }

    private static registerCustomDomains(parent: pulumi.Resource, apiName: string, api: aws.apigateway.RestApi,
                                         domains: Domain[]): aws.apigateway.DomainName[] {
        const awsDomains: aws.apigateway.DomainName[] = [];
        for (const domain of domains) {
            // Ensure this pair of api-domain name doesn't conflict with anything else.  i.e. there
            // may be another http endpoint that registers a custom domain with a different data.
            // We don't want to collide with that. hash the name to ensure this urn doesn't get too
            // long.
            const domainNameHash = sha1hash(domain.domainName);
            const apiNameAndHash = `${apiName}-${domainNameHash}`;

            let domainArgs: aws.apigateway.DomainNameArgs;
            if (isCloudDomain(domain)) {
                domainArgs = {
                    domainName: domain.domainName,
                    certificateName: domain.domainName,
                    certificateBody: domain.certificateBody,
                    certificatePrivateKey: domain.certificatePrivateKey,
                    certificateChain: domain.certificateChain,
                };
            } else {
                domainArgs = {
                    domainName: domain.domainName,
                    certificateArn: domain.certificateArn,
                };
            }

            const awsDomain = new aws.apigateway.DomainName(apiNameAndHash, domainArgs, {parent});

            const basePathMapping = new aws.apigateway.BasePathMapping(apiNameAndHash, {
                restApi: api,
                stageName: stageName,
                domainName: awsDomain.domainName,
            }, {parent});

            awsDomains.push(awsDomain);
        }

        return awsDomains;
    }

    constructor(name: string, staticRoutes: StaticRoute[], proxyRoutes: ProxyRoute[],
                routes: Route[], customDomains: Domain[], opts?: pulumi.ResourceOptions) {

        super("cloud:http:HttpEndpoint", name, {
            staticRoutes: staticRoutes,
            proxyRoutes: proxyRoutes,
            routes: routes,
            customDomains: customDomains,
        }, opts);

        this.routes = routes;
        this.staticRoutes = staticRoutes;

        // Create a SwaggerSpec and then expand out all of the static files and routes.
        const swagger: SwaggerSpec = createBaseSpec(name);
        HttpDeployment.registerStaticRoutes(this, name, staticRoutes, swagger);
        HttpDeployment.registerProxyRoutes(this, name, proxyRoutes, swagger);
        const lambdas: {[key: string]: Function} = HttpDeployment.registerRoutes(this, name, routes, swagger);

        // Now stringify the resulting swagger specification and create the various API Gateway objects.
        const swaggerStr = createSwaggerString(swagger);
        const api = new aws.apigateway.RestApi(name, {
            body: swaggerStr,
        }, { parent: this });

        // bodyHash produces a hash that let's us know when any paths change in the swagger spec.
        const bodyHash = swaggerStr.apply(s => sha1hash(s));

        // we need to ensure a fresh deployment any time our body changes. So include the hash as
        // part of the deployment urn.
        const deployment = new aws.apigateway.Deployment(name, {
            restApi: api,
            stageName: "",
            // Note: We set `variables` here because it forces recreation of the Deployment object
            // whenever the body hash changes.  Because we use a blank stage name above, there will
            // not actually be any stage created in AWS, and thus these variables will not actually
            // end up anywhere.  But this will still cause the right replacement of the Deployment
            // when needed.  The Stage allocated below will be the stable stage that always points
            // to the latest deployment of the API.
            variables: {
                version: bodyHash,
            },
            description: bodyHash.apply(hash => `Deployment of version ${hash}`),
        }, { parent: this });

        const stage = new aws.apigateway.Stage(name, {
            stageName: stageName,
            description: "The current deployment of the API.",
            restApi: api,
            deployment: deployment,
        }, { parent: this });

        // Ensure that the permissions allow the API Gateway to invoke the lambdas.
        for (const path of Object.keys(swagger.paths)) {
            for (let method of Object.keys(swagger.paths[path])) {
                const methodAndPath = method + ":" + path;
                const lambda = lambdas[methodAndPath];
                if (lambda !== undefined) {
                    if (method === "x-amazon-apigateway-any-method") {
                        method = "*";
                    }
                    else {
                        method = method.toUpperCase();
                    }
                    const permissionName = name + "-" + sha1hash(methodAndPath);
                    const invokePermission = new aws.lambda.Permission(permissionName, {
                        action: "lambda:invokeFunction",
                        function: lambda.lambda,
                        principal: "apigateway.amazonaws.com",
                        sourceArn: deployment.executionArn.apply(arn => arn + stageName + "/" + method + path),
                    }, { parent: this });
                }
            }
        }

        // If there are any custom domains, attach them now.
        const awsDomains: aws.apigateway.DomainName[] =
            HttpDeployment.registerCustomDomains(this, name, api, customDomains);

        // Finally, manufacture a URL and set it as an output property.
        this.url = deployment.invokeUrl.apply(url => url + stageName + "/");
        this.customDomainNames = awsDomains.map(awsDomain => awsDomain.cloudfrontDomainName);
        this.customDomains = awsDomains;
        super.registerOutputs({
            url: this.url,
            customDomainNames: this.customDomainNames,
        });
    }
}

interface SwaggerSpec {
    swagger: string;
    info: SwaggerInfo;
    paths: { [path: string]: { [method: string]: SwaggerOperationAsync; }; };
    "x-amazon-apigateway-binary-media-types"?: string[];
}

// createSwaggerString creates a JSON string out of a Swagger spec object.  This is required versus
// an ordinary JSON.stringify because the spec contains computed values.
function createSwaggerString(spec: SwaggerSpec): pulumi.Output<string> {
    const pathsDeps = pulumi.all(utils.apply(spec.paths, p => {
        const temp: pulumi.Output<Record<string, SwaggerOperation>> =
            pulumi.all(utils.apply(p, x => resolveOperationDependencies(x)));
        return temp;
    }));

    // After all values have settled, we can produce the resulting string.
    return pathsDeps.apply(paths =>
        JSON.stringify({
            swagger: spec.swagger,
            info: spec.info,
            paths: paths,
            "x-amazon-apigateway-binary-media-types": spec["x-amazon-apigateway-binary-media-types"],
            // Map paths the user doesn't have access to as 404.
            // http://docs.aws.amazon.com/apigateway/latest/developerguide/supported-gateway-response-types.html
            "x-amazon-apigateway-gateway-responses": {
                "MISSING_AUTHENTICATION_TOKEN": {
                    "statusCode": 404,
                    "responseTemplates": {
                        "application/json": "{\"message\": \"404 Not found\" }",
                    },
                },
                "ACCESS_DENIED": {
                    "statusCode": 404,
                    "responseTemplates": {
                        "application/json": "{\"message\": \"404 Not found\" }",
                    },
                },
            },
        }));

    // local functions
    function resolveOperationDependencies(op: SwaggerOperationAsync): pulumi.Output<SwaggerOperation> {
        return resolveIntegrationDependencies(op["x-amazon-apigateway-integration"]).apply(
            integration => ({
                    parameters: op.parameters,
                    responses: op.responses,
                    "x-amazon-apigateway-integration": integration,
                }));
    }

    function resolveIntegrationDependencies(op: ApigatewayIntegrationAsync): pulumi.Output<ApigatewayIntegration> {
        return pulumi.all([op.uri, op.credentials, op.connectionId])
                     .apply(([uri, credentials, connectionId]) => ({
                requestParameters: op.requestParameters,
                passthroughBehavior: op.passthroughBehavior,
                httpMethod: op.httpMethod,
                type: op.type,
                responses: op.responses,
                connectionType: op.connectionType,
                uri: uri,
                credentials: credentials,
                connectionId: connectionId,
            }));
    }
}

interface SwaggerInfo {
    title: string;
    version: string;
}

interface ApigatewayIntegrationBase {
    requestParameters?: any;
    passthroughBehavior?: string;
    httpMethod: string;
    type: string;
    responses?: { [pattern: string]: SwaggerAPIGatewayIntegrationResponse };
    connectionType?: string;
}

interface ApigatewayIntegration extends ApigatewayIntegrationBase {
    uri: string;
    credentials?: string;
    connectionId?: string;
}

interface ApigatewayIntegrationAsync extends ApigatewayIntegrationBase {
    uri: pulumi.Output<string>;
    credentials?: pulumi.Output<string>;
    connectionId?: pulumi.Output<string>;
}

interface SwaggerOperationAsync {
    parameters?: any[];
    responses?: { [code: string]: SwaggerResponse };
    "x-amazon-apigateway-integration": ApigatewayIntegrationAsync;
}

interface SwaggerOperation {
    parameters?: any[];
    responses?: { [code: string]: SwaggerResponse };
    "x-amazon-apigateway-integration": ApigatewayIntegration;
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

function createPathSpecLambda(lambda: aws.lambda.Function): SwaggerOperationAsync {
    const region = aws.config.requireRegion();
    const uri = lambda.arn.apply(lambdaARN =>
        "arn:aws:apigateway:" + region + ":lambda:path/2015-03-31/functions/" + lambdaARN + "/invocations");

    return {
        "x-amazon-apigateway-integration": {
            uri: uri,
            passthroughBehavior: "when_no_match",
            httpMethod: "POST",
            type: "aws_proxy",
        },
    };
}

function createPathSpecProxy(
    target: string | pulumi.Output<cloud.Endpoint>,
    vpcLink: aws.apigateway.VpcLink | undefined,
    useProxyPathParameter: boolean): SwaggerOperationAsync {

    const uri =
        pulumi.all([<string>target, <pulumi.Output<cloud.Endpoint>>target])
              .apply(([targetStr, targetEndpoint]) => {
                  let url = "";
                  if (typeof targetStr === "string") {
                      // For URL target, ensure there is a trailing `/`
                      url = targetStr;
                      if (!url.endsWith("/")) {
                          url = url + "/";
                      }
                  } else {
                      // For Endpoint target, construct an HTTP URL from the hostname and port
                      url = `http://${targetEndpoint.hostname}:${targetEndpoint.port}/`;
                  }

                  if (useProxyPathParameter) {
                      return `${url}{proxy}`;
                  } else {
                      return url;
                  }
              });

    const result: SwaggerOperationAsync = {
        "x-amazon-apigateway-integration": {
            responses: {
                default: {
                    statusCode: "200",
                },
            },
            uri: uri,
            passthroughBehavior: "when_no_match",
            httpMethod: "ANY",
            connectionType: vpcLink ? "VPC_LINK" : undefined,
            connectionId: vpcLink ? vpcLink.id : undefined,
            type: "http_proxy",
        },
    };
    if (useProxyPathParameter) {
        result.parameters = [{
            name: "proxy",
            in: "path",
            required: true,
            type: "string",
        }];
        result["x-amazon-apigateway-integration"].requestParameters = {
            "integration.request.path.proxy": "method.request.path.proxy",
        };
    }
    return result;
}

function createPathSpecObject(
        bucket: aws.s3.Bucket,
        key: string,
        role: aws.iam.Role,
        pathParameter?: string): SwaggerOperationAsync {

    const region = aws.config.requireRegion();

    const uri = bucket.bucket.apply(bucketName =>
        `arn:aws:apigateway:${region}:s3:path/${bucketName}/${key}${(pathParameter ? `/{${pathParameter}}` : ``)}`);

    const result: SwaggerOperationAsync = {
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
            credentials: role.arn,
            uri: uri,
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

    if (pathParameter) {
        result.parameters = [{
            name: pathParameter,
            in: "path",
            required: true,
            type: "string",
        }];

        result["x-amazon-apigateway-integration"].requestParameters = {
            [`integration.request.path.${pathParameter}`]: `method.request.path.${pathParameter}`,
        };
    }

    return result;
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
function apiGatewayToRequestResponse(ev: APIGatewayRequest, body: Buffer,
                                     cb: (err: any, result: APIGatewayResponse) => void): RequestResponse {
    const response = {
        statusCode: 200,
        headers: <{[header: string]: string}>{},
        body: Buffer.from([]),
    };
    const headers: { [name: string]: string; } = {};
    const rawHeaders: string[] = [];
    // Lowercase all header names to align with Node.js HTTP request behaviour,
    // and create the `rawHeaders` array to maintain access to raw header data.
    for (const name of Object.keys(ev.headers)) {
        headers[name.toLowerCase()] = ev.headers[name];
        rawHeaders.push(name);
        rawHeaders.push(ev.headers[name]);
    }
    // Always add `content-length` header, as this is stripped by API Gateway
    headers["content-length"] = body.length.toString();
    const req: cloud.Request = {
        headers: headers,
        rawHeaders: rawHeaders,
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
        getHeader: (name: string) => {
            return response.headers![name];
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



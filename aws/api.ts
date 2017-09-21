// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as types from "@pulumi/pulumi";
import * as fabric from "@pulumi/pulumi-fabric";
import * as crypto from "crypto";
import { LoggedFunction } from "./function";

declare let JSON: any;
declare let Buffer: any;

interface APIGatewayRequest {
    resource: string;
    path: string;
    httpMethod: string;
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
    paths: { [path: string]: { [method: string]: fabric.Computed<SwaggerOperation>; }; };
    "x-amazon-apigateway-binary-media-types"?: string[];
}

// jsonStringifySwaggerSpec creates a JSON string out of a Swagger spec object.  This is required versus an
// ordinary JSON.stringify because the spec contains computed values.
function jsonStringifySwaggerSpec(spec: SwaggerSpec): { hash: string, json: fabric.Computed<string> } {
    let last: fabric.Computed<void> | undefined;
    let pathValues: {[path: string]: {[method: string]: SwaggerOperation} } = {};
    for (let path of Object.keys(spec.paths)) {
        pathValues[path] = {};
        for (let method of Object.keys(spec.paths[path])) {
            // Set up a callback to remember the final value, and chain it on the previous one.
            let resolvePathValue: fabric.Computed<void> =
                spec.paths[path][method].then((op: SwaggerOperation) => { pathValues[path][method] = op; });
            last = last ? last.then(() => resolvePathValue) : resolvePathValue;
        }
    }

    // Produce a hash of all the promptly available values.
    let promptSpec = {
        swagger: spec.swagger,
        info: spec.info,
        paths: pathValues,
        "x-amazon-apigateway-binary-media-types": spec["x-amazon-apigateway-binary-media-types"],
    };

    // BUGBUG[pulumi/pulumi-fabric#331]: we are skipping hashing of the actual operation objects, because they
    //     are possibly computed, and we need the hash promptly for resource URN creation.  This isn't correct,
    //     and will lead to hash collisions; we need to fix this as part of fixing pulumi/pulumi-fabric#331
    let promptHash: string = sha1hash(JSON.stringify(promptSpec));

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
    let region = aws.config.requireRegion();
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
    let region = aws.config.requireRegion();
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

let apigatewayAssumeRolePolicyDocument = {
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

/**
 * Request represents an HttpAPI request.
 */
export interface Request {
    /**
     * The body of the HTTP request.
     */
    body: Buffer;
    /**
     * The method of the HTTP request.
     */
    method: string;
    /**
     * The path parameters of the HTTP request. Each `{param}` in the matched route is available as a
     * property of this oject.
     */
    params: { [param: string]: string; };
    /**
     * The headers of the HTTP request.
     */
    headers: { [header: string]: string; };
    /**
     * The query parameters parsed from the query string of the request URL.
     */
    query: { [query: string]: string; };
    /**
     * The raw path from the HTTP request.
     */
    path: string;
}

/**
 * Response represents the response to an HttpAPI request.
 */
export interface Response {
    /**
     * Sets the HTTP response status code and returns a `Response` for chaining operations.
     */
    status(code: number): Response;
    /**
     * Sets a header on the HTTP response and returns the `Response` for chaining operations.
     */
    setHeader(name: string, value: string): Response;
    /**
     * Writes a string to the HTTP response body and returns the `Response` for chaining operations.
     */
    write(data: string): Response;
    /**
     * Sends the HTTP response, optionally including data to write to the HTTP response body.
     */
    end(data?: string): void;
    /**
     * JSON serializes an object, writes it to the HTTP response body, and sends the HTTP response.
     */
    json(obj: any): void;
}

/**
 * RouteHandler represents a handler for a route on an HttpAPI.
 *
 * Implementations should invoke methods on `res` to respond to the request, or invoke `next`
 * to pass control to the next available handler on the route for further processing.
 */
export type RouteHandler = (req: Request, res: Response, next: () => void) => void;

interface ReqRes {
    req: types.Request;
    res: types.Response;
}

type Callback = (err: any, result: APIGatewayResponse) => void;

let apiGatewayToReqRes = (ev: APIGatewayRequest, body: any, cb: Callback): ReqRes => {
    let response = {
        statusCode: 200,
        headers: <{[header: string]: string}>{},
        body: Buffer.from([]),
    };
    let req = {
        headers: ev.headers,
        body: body,
        method: ev.httpMethod,
        params: ev.pathParameters,
        query: ev.queryStringParameters,
        path: ev.path,
    };
    let res = {
        status: (code: number) => {
            response.statusCode = code;
            return res;
        },
        setHeader: (name: string, value: string) => {
            response.headers![name] = value;
            return res;
        },
        write: (data: string | any, encoding?: string) => {
            if (encoding === undefined) {
                encoding = "utf8";
            }
            if (typeof data === "string") {
                data = Buffer.from(data, encoding);
            }
            response.body = Buffer.concat([response.body, data]);
            return res;
        },
        end: (data?: string | any, encoding?: string) => {
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

let stageName = "stage";

/**
 * HttpAPI publishes an internet-facing HTTP API, for serving web applications or REST APIs.
 *
 * ```javascript
 * let api = new HttpAPI("myapi")
 * api.get("/", (req, res) => res.json({hello: "world"}));
 * api.publish();
 * api.url.mapValue(url =>
 *   console.log(`Serving myapi at ${url}`)
 * );
 * ```
 *
 * Paths are `/` seperated.  A path can use `{param}` to capture zero-or-more non-`/` characters
 * and make the captured path segment available in `req.params.param`, or `{param+}` to greedily
 * capture all remaining characters in the url path into `req.params.param`.
 *
 * Paths and routing are defined statically, and cannot overlap. Code inside a route handler
 * can be used to provide dynamic decisions about sub-routing within a static path.
 */
export class HttpAPI {
    /**
     * The url that the HttpAPI is being served at. Set only after a succesful call to `publish`.
     */
    public url?: fabric.Computed<string>;

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

    /**
     * staticFile serves a static file from within the source folder at the requested path.
     *
     * @param path The route path at which to serve the file.
     * @param filePath The local file path relative to the Pulumi program folder.
     * @param contentType The `content-type` to serve the file as.
     */
    public staticFile(path: string, filePath: string, contentType?: string) {
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        let method = "GET";
        let swaggerMethod = this.routePrepare(method, path);
        let name = this.apiName + sha1hash(method + ":" + path);
        let rolePolicyJSON = JSON.stringify(apigatewayAssumeRolePolicyDocument);
        let role = new aws.iam.Role(name, {
            assumeRolePolicy: rolePolicyJSON,
        });
        let attachment = new aws.iam.RolePolicyAttachment(name, {
            role: role,
            policyArn: aws.iam.AmazonS3FullAccess,
        });
        if (this.bucket === undefined) {
            this.bucket = new aws.s3.Bucket(this.apiName, {});
        }
        let obj = new aws.s3.BucketObject(name, {
            bucket: this.bucket,
            key: name,
            source: new fabric.asset.FileAsset(filePath),
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
        let swaggerMethod = this.routePrepare(method, path);
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

    /**
     * Routes any requests with given HTTP method on the given path to the provided handler(s).
     * @param method The HTTP method to handle.
     * @param path The path to handle requests on.
     * @param handlers One or more handlers to apply to requests.
     */
    public route(method: string, path: string, ...handlers: types.RouteHandler[]) {
        let lambda = new LoggedFunction(
            this.apiName + sha1hash(method + ":" + path),
            [ aws.iam.AWSLambdaFullAccess ],
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
                let reqres = apiGatewayToReqRes(ev, body, cb);
                let i = 0;
                let next = () => {
                    let nextHandler = handlers[i++];
                    if (nextHandler !== undefined) {
                        nextHandler(reqres.req, reqres.res, next);
                    }
                };
                next();
            },
        );
        this.routeLambda(method, path, lambda);
    }

    /**
     * Routes GET requests on the given path to the provided handler(s).
     * @param path The path to handle requests on.
     * @param handlers One or more handlers to apply to requests.
     */
    public get(path: string, ...handlers: types.RouteHandler[]) {
        this.route("GET", path, ...handlers);
    }

    /**
     * Routes PUT requests on the given path to the provided handler(s).
     * @param path The path to handle requests on.
     * @param handlers One or more handlers to apply to requests.
     */
    public put(path: string, ...handlers: types.RouteHandler[]) {
        this.route("PUT", path, ...handlers);
    }

    /**
     * Routes POST requests on the given path to the provided handler(s).
     * @param path The path to handle requests on.
     * @param handlers One or more handlers to apply to requests.
     */
    public post(path: string, ...handlers: types.RouteHandler[]) {
        this.route("POST", path, ...handlers);
    }

    /**
     * Routes DELETE requests on the given path to the provided handler(s).
     * @param path The path to handle requests on.
     * @param handlers One or more handlers to apply to requests.
     */
    public delete(path: string, ...handlers: types.RouteHandler[]) {
        this.route("DELETE", path, ...handlers);
    }

    /**
     * Routes OPTIONS requests on the given path to the provided handler(s).
     * @param path The path to handle requests on.
     * @param handlers One or more handlers to apply to requests.
     */
    public options(path: string, ...handlers: types.RouteHandler[]) {
        this.route("OPTIONS", path, ...handlers);
    }

    /**
     * Routes all HTTP methods on the given path to the provided handler(s).
     * @param path The path to handle requests on.
     * @param handlers One or more handlers to apply to requests.
     */
    public all(path: string, ...handlers: types.RouteHandler[]) {
        this.route("ANY", path, ...handlers);
    }

    /**
     * Publishes an HttpAPI to be internet accessible.
     *
     * This should be called after describing desired routes.
     *
     * @returns A computed string representing the URL at which the HttpAPI is available to the internet.
     */
    public publish(): fabric.Computed<string> {
        let { hash, json } = jsonStringifySwaggerSpec(this.swaggerSpec);
        this.api = new aws.apigateway.RestApi(this.apiName, {
            body: json,
        });
        this.deployment = new aws.apigateway.Deployment(this.apiName + "_" + hash, {
            restApi: this.api,
            stageName: "",
            description: "Deployment of version " + hash,
        });
        let stage = new aws.apigateway.Stage(this.apiName + "_stage", {
            stageName: stageName,
            description: "The current deployment of the API.",
            restApi: this.api,
            deployment: this.deployment,
        });

        for (let path of Object.keys(this.swaggerSpec.paths)) {
            for (let method of Object.keys(this.swaggerSpec.paths[path])) {
                let lambda = this.lambdas[method + ":" + path];
                if (lambda !== undefined) {
                    if (method === "x-amazon-apigateway-any-method") {
                        method = "*";
                    }
                    else {
                        method = method.toUpperCase();
                    }
                    let permissionName = this.apiName + "_invoke_" + sha1hash(method + path);
                    let invokePermission = new aws.lambda.Permission(permissionName, {
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

    /**
     * Attach a custom domain to this HttpAPI.
     *
     * Provide a domain name you own, along with SSL certificates from a certificate authority (e.g. LetsEncrypt).
     * The return value is a domain name that you must map your custom domain to using a DNS A record.
     *
     * _Note_: It is strongly encouraged to store certificates in config variables and not in source code.
     *
     * @returns The domain name that you must map your custom domain to using a DNS A record.
     */
    public attachCustomDomain(domain: types.Domain): fabric.Computed<string> {
        let awsDomain = new aws.apigateway.DomainName(this.apiName + "-" + domain.domainName, {
            domainName: domain.domainName,
            certificateName: domain.domainName,
            certificateBody: domain.certificateBody,
            certificatePrivateKey: domain.certificatePrivateKey,
            certificateChain: domain.certificateChain,
        });
        let basePathMapping = new aws.apigateway.BasePathMapping(this.apiName + "-" + domain.domainName, {
            restApi: this.api,
            stageName: stageName,
            domainName: awsDomain.domainName,
        });
        return awsDomain.cloudfrontDomainName;
    }
}

// sha1hash returns the SHA1 hash of the input string.
function sha1hash(s: string): string {
    let shasum: crypto.Hash = crypto.createHash("sha1");
    shasum.update(s);
    return shasum.digest("hex");
}


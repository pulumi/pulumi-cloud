// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@lumi/aws";
import * as lumi from "@lumi/lumi";
import * as lumirt from "@lumi/lumirt";
import { Context as LambdaContext, LoggedFunction as Function } from "./function";

interface Route {
    method: string;
    path: string;
    lambda: Function;
}

export interface Request {
    resource: string;
    path: string;
    httpMethod: string;
    headers: { [header: string]: string; };
    queryStringParameters: { [param: string]: string; };
    pathParameters: { [param: string]: string; };
    stageVariables: { [name: string]: string; };
    requestContext: RequestContext;
    body: string;
    isBase64Encoded: boolean;
}

export interface RequestContext {
    accountId: string;
    resourceId: string;
    stage: string;
    requestId: string;
    identity: Identity;
    resourcePath: string;
    httpMethod: string;
    apiId: string;
}

export interface Identity {
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

export interface Response {
    isBase64Encoded?: boolean;
    statusCode: number;
    headers?: { [header: string]: string; };
    body: string;
}

export type RouteCallback = (err: any, resp: Response) => void;
export type RouteHandler = (req: Request, callback: RouteCallback) => void;

export interface RouteOptions {
    policies?: string[];
}

interface SwaggerSpec {
    swagger: string;
    info: SwaggerInfo;
    paths: { [path: string]: { [method: string]: SwaggerOperation; }; };
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
        responses?: {[pattern: string]: APIGatewayIntegrationResponse};
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

interface APIGatewayIntegrationResponse {
    statusCode: string;
    responseParameters?: { [key: string]: string };
}

function createBaseSpec(apiName: string): SwaggerSpec {
    return {
        swagger: "2.0",
        info: { title: apiName, version: "1.0" },
        paths: {},
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

// API is a higher level abstraction for working with AWS APIGateway reources.
export class API {
    public api: aws.apigateway.RestAPI;
    public deployment: aws.apigateway.Deployment;
    private swaggerSpec: SwaggerSpec;
    private apiName: string;
    private lambdas: { [key: string]: Function };
    private bucket: aws.s3.Bucket;

    constructor(apiName: string) {
        this.apiName = apiName;
        this.swaggerSpec = createBaseSpec(apiName);
        this.lambdas = {};
    }

    public routeStatic(method: string, path: string, filePath: string, contentType?: string) {
        let swaggerMethod = this.routePrepare(method, path);
        let name = this.apiName + lumirt.sha1hash(method + ":" + path);
        let role = new aws.iam.Role(name, {
            assumeRolePolicyDocument: apigatewayAssumeRolePolicyDocument,
            managedPolicyARNs: [aws.iam.AmazonS3FullAccess],
        });
        if (this.bucket === undefined) {
            this.bucket = new aws.s3.Bucket(this.apiName, {});
        }
        let obj = new aws.s3.Object({
            bucket: this.bucket,
            key: name,
            source: new lumi.asset.File(filePath),
            contentType: contentType,
        });
        this.swaggerSpec.paths[path][swaggerMethod] = createPathSpecObject(role.arn, obj.bucket.bucketName!, obj.key);
    }

    private routeLambda(method: string, path: string, lambda: Function) {
        let swaggerMethod = this.routePrepare(method, path);
        this.swaggerSpec.paths[path][swaggerMethod] = createPathSpecLambda(lambda.lambda.arn);
        this.lambdas[swaggerMethod + ":" + path] = lambda;
    }

    public routePrepare(method: string, path: string): string {
        if (this.swaggerSpec.paths[path] === undefined) {
            this.swaggerSpec.paths[path] = {};
        }
        let swaggerMethod: string;
        switch ((<any>method).toLowerCase()) {
            case "get":
            case "put":
            case "post":
            case "delete":
            case "options":
            case "head":
            case "patch":
                swaggerMethod = (<any>method).toLowerCase();
                break;
            case "any":
                swaggerMethod = "x-amazon-apigateway-any-method";
                break;
            default:
                throw new Error("Method not supported: " + method);
        }
        return swaggerMethod;
    }

    public route(method: string, path: string, options: RouteOptions, handler: RouteHandler) {
        let functionName = this.apiName + lumirt.sha1hash(method + ":" + path);
        let policies = [aws.iam.AWSLambdaFullAccess];
        if (options !== undefined && options.policies !== undefined) {
            policies = options.policies;
        }
        let lambda = new Function(functionName, policies, (ev, ctx, cb) => {
            handler(ev, cb);
        });
        this.routeLambda(method, path, lambda);
    }

    public publish(): string {
        this.api = new aws.apigateway.RestAPI(this.apiName, {
            body: this.swaggerSpec,
        });
        let deploymentId = lumirt.sha1hash(lumirt.jsonStringify(this.swaggerSpec));
        this.deployment = new aws.apigateway.Deployment(this.apiName + "_" + deploymentId, {
            restAPI: this.api,
            description: "Deployment of version " + deploymentId,
        });
        let stage = new aws.apigateway.Stage(this.apiName + "_stage", {
            stageName: "stage",
            description: "The current deployment of the API.",
            restAPI: this.api,
            deployment: this.deployment,
        });

        let pathKeys = lumirt.objectKeys(this.swaggerSpec.paths);
        for (let i = 0; i < (<any>pathKeys).length; i++) {
            let path = pathKeys[i];
            let methodKeys = lumirt.objectKeys(this.swaggerSpec.paths[path]);
            for (let j = 0; j < (<any>methodKeys).length; j++) {
                let method = methodKeys[j];
                let lambda = this.lambdas[method + ":" + path];
                if (lambda !== undefined) {
                    if (method === "x-amazon-apigateway-any-method") {
                        method = "*";
                    } else {
                        method = (<any>method).toUpperCase();
                    }
                    let permissionName = this.apiName + "_invoke_" + lumirt.sha1hash(method + path);
                    let invokePermission = new aws.lambda.Permission(permissionName, {
                        action: "lambda:invokeFunction",
                        function: lambda.lambda,
                        principal: "apigateway.amazonaws.com",
                        sourceARN: stage.executionARN + "/" + method + path,
                    });
                }
            }
        }
        return stage.url;
    }
}


// Copyright 2016-2018, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";

interface ApigatewayIntegration {
    requestParameters?: any;
    passthroughBehavior?: string;
    httpMethod: string;
    type: string;
    responses?: { [pattern: string]: SwaggerAPIGatewayIntegrationResponse };
    connectionType?: string;
    uri: pulumi.Output<string>;
    credentials?: pulumi.Output<string>;
    connectionId?: pulumi.Output<string>;
}

export interface SwaggerSpec {
    swagger: string;
    info: SwaggerInfo;
    paths: { [path: string]: { [method: string]: SwaggerOperation; }; };
    "x-amazon-apigateway-binary-media-types"?: string[];
}

interface SwaggerInfo {
    title: string;
    version: string;
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

export interface APIGatewayRequest {
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

export interface APIGatewayResponse {
    isBase64Encoded?: boolean;
    statusCode: number;
    headers?: { [header: string]: string; };
    body: string;
}

// createSwaggerString creates a JSON string out of a Swagger spec object.  This is required versus
// an ordinary JSON.stringify because the spec contains computed values.
export function createSwaggerString(spec: SwaggerSpec): pulumi.Output<string> {
    return pulumi.output(spec).apply(s => {
        return JSON.stringify({
            swagger: s.swagger,
            info: s.info,
            paths: s.paths,
            "x-amazon-apigateway-binary-media-types": s["x-amazon-apigateway-binary-media-types"],
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
        });
    });
}

export function createBaseSpec(apiName: string): SwaggerSpec {
    return {
        swagger: "2.0",
        info: { title: apiName, version: "1.0" },
        paths: {},
        "x-amazon-apigateway-binary-media-types": [ "*/*" ],
    };
}

export function createPathSpecLambda(lambda: aws.lambda.Function): SwaggerOperation {
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

export function createPathSpecProxy(
    target: string | pulumi.Output<cloud.Endpoint>,
    vpcLink: aws.apigateway.VpcLink | undefined,
    useProxyPathParameter: boolean): SwaggerOperation {

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

    const result: SwaggerOperation = {
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

export function createPathSpecObject(
        bucket: aws.s3.Bucket,
        key: string,
        role: aws.iam.Role,
        pathParameter?: string): SwaggerOperation {

    const region = aws.config.requireRegion();

    const uri = bucket.bucket.apply(bucketName =>
        `arn:aws:apigateway:${region}:s3:path/${bucketName}/${key}${(pathParameter ? `/{${pathParameter}}` : ``)}`);

    const result: SwaggerOperation = {
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

export function swaggerMethod(method: string): string {
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
            throw new RunError("Method not supported: " + method);
    }
}

export const assumeRolePolicyDocument = {
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

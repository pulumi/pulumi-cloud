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
import * as http from "http";

import { Function } from "./function";
import * as utils from "./utils";
import { sha1hash } from "./utils";

export class HttpServer extends pulumi.ComponentResource implements cloud.HttpServer {
    public /*out*/ readonly url: pulumi.Output<string>; // the URL for this deployment.

    public constructor(
        name: string,
        createRequestListener: () => (req: http.IncomingMessage, res: http.ServerResponse) => void,
        opts: pulumi.ComponentResourceOptions) {

        super("cloud:express:Express", name, {}, opts);

        // Create the main aws lambda entrypoint.  It will create an instance of express, configure
        // it (however the caller wants) and then will forward the actual lambda request on to it.
        function entryPoint(event: APIGatewayRequest, context: aws.serverless.Context) {
            const serverlessExpress = require("aws-serverless-express");
            const requestListener = createRequestListener();
            const server = serverlessExpress.createServer(requestListener);

            serverlessExpress.proxy(server, event, <any>context);
        }

        // Have to register two paths (that will point to the same lambda).  One for the root
        // itself, and one for any path off of the root.
        const swaggerPath = "/";
        const swaggerPathProxy = "/{proxy+}";

        const func = new Function(name, entryPoint, { parent: this });

        // Register two paths in the Swagger spec, for the root and for a catch all under the root
        const swagger = createBaseSpec(name);
        swagger.paths[swaggerPath] = { "x-amazon-apigateway-any-method": createPathSpecLambda(func.lambda) };
        swagger.paths[swaggerPathProxy] = { "x-amazon-apigateway-any-method": createPathSpecLambda(func.lambda) };

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

        const stageName = "stage";
        const stage = new aws.apigateway.Stage(name, {
            stageName: stageName,
            description: "The current deployment of the API.",
            restApi: api,
            deployment: deployment,
        }, { parent: this });

        // Ensure that the permissions allow the API Gateway to invoke the func.
        for (const path of Object.keys(swagger.paths)) {
            const methodAndPath = "*:" + path;

            const permissionName = name + "-" + sha1hash(methodAndPath);
            const invokePermission = new aws.lambda.Permission(permissionName, {
                action: "lambda:invokeFunction",
                function: func.lambda,
                principal: "apigateway.amazonaws.com",
                sourceArn: deployment.executionArn.apply(arn => arn + stageName + "/*" + path),
            }, { parent: this });
        }

        this.url = deployment.invokeUrl.apply(url => url + stageName + "/");
        super.registerOutputs({
            url: this.url,
        });
    }
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

function createBaseSpec(apiName: string): SwaggerSpec {
    return {
        swagger: "2.0",
        info: { title: apiName, version: "1.0" },
        paths: {},
        "x-amazon-apigateway-binary-media-types": [ "*/*" ],
    };
}

interface SwaggerSpec {
    swagger: string;
    info: SwaggerInfo;
    paths: { [path: string]: { [method: string]: SwaggerOperationAsync; }; };
    "x-amazon-apigateway-binary-media-types"?: string[];
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

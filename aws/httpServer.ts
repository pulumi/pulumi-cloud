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

// tslint:disable:max-line-length

import * as aws from "@pulumi/aws";
import { x } from "@pulumi/aws/apigateway";
import * as lambda from "@pulumi/aws/lambda";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";

import { createFactoryFunction } from "./function";
import { sha1hash } from "./utils";

import * as serverlessExpress from "aws-serverless-express";

export class HttpServer extends pulumi.ComponentResource implements cloud.HttpServer {
    public /*out*/ readonly url: pulumi.Output<string>; // the URL for this deployment.

    public constructor(
        name: string,
        createRequestListener: cloud.RequestListenerFactory,
        opts: pulumi.ComponentResourceOptions) {

        super("cloud:httpserver:HttpServer", name, {}, opts);

        // Create the actual lambda
        const func =  createFactoryFunction(name,
            () => createLambdaEntryPoint(createRequestListener),
            { parent: this });

        const lambdaOperation = createLambdaOperation(func.lambda);

        const swagger = {
            swagger: "2.0",
            info: { title: name, version: "1.0" },
            "x-amazon-apigateway-binary-media-types": [ "*/*" ],
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
            paths: {
                // Register two paths in the Swagger spec, for the root and for a catch all under the root
                "/": { "x-amazon-apigateway-any-method": lambdaOperation },
                "/{proxy+}": { "x-amazon-apigateway-any-method": lambdaOperation },
            },
        };

        // Now stringify the resulting swagger specification and create the various API Gateway objects.
        const swaggerStr = pulumi.output(swagger).apply(JSON.stringify);
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
                // We use */* here to indicate permission to any stage and any method type.
                sourceArn: deployment.executionArn.apply(arn => arn + "*/*" + path),
            }, { parent: this });
        }

        this.url = deployment.invokeUrl.apply(url => url + stageName + "/");
        super.registerOutputs({
            url: this.url,
        });
    }
}

// Create the main aws lambda entrypoint factory function.  Note that this is a factory
// function so that we can just run this code once and hook up to
function createLambdaEntryPoint(createRequestListener: cloud.RequestListenerFactory): lambda.Callback<x.Request, x.Response> {
    const requestListener = createRequestListener();

    // Pass */* as the binary mime types.  This tells aws-serverless-express to effectively
    // treat all messages as binary and not reinterpret them.
    const server = serverlessExpress.createServer(
        requestListener, /*serverListenCallback*/ undefined, /*binaryMimeTypes*/ ["*/*"]);

    return (event, context) => {
        serverlessExpress.proxy(server, event, <any>context);
    };
}

interface ApigatewayIntegration {
    passthroughBehavior: "when_no_match";
    httpMethod: "POST";
    type: "aws_proxy";
    uri: pulumi.Output<string>;
}

interface SwaggerOperation {
    "x-amazon-apigateway-integration": ApigatewayIntegration;
}

function createLambdaOperation(lambda: aws.lambda.Function): SwaggerOperation {
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
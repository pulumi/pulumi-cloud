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

        const api = new aws.apigateway.x.API(name, {
            // Register two paths in the Swagger spec, for the root and for a catch all under the root
            routes: [
                {
                    path: "/",
                    method: "ANY",
                    handler: func.lambda,
                },
                {
                    path: "/{proxy+}",
                    method: "ANY",
                    handler: func.lambda,
                },
            ],
        }, { parent: this });

        this.url = api.url;
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

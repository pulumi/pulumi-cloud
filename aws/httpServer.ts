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
import { Server } from "http";

export class HttpServer extends pulumi.ComponentResource implements cloud.HttpServer {
    public /*out*/ readonly url: pulumi.Output<string>; // the URL for this deployment.

    public constructor(
        name: string,
        createRequestListener: cloud.RequestListenerFactory | Promise<cloud.RequestListenerFactory>,
        opts: pulumi.ComponentResourceOptions = {}) {

        super("cloud:httpserver:HttpServer", name, {}, opts);

        // Create the main aws lambda entrypoint factory function.  Note that this is a factory
        // function so that we can create the underlying server once, and then call into it with
        // each request we get.
        const entryPointFactory: lambda.CallbackFactory<x.Request, x.Response> = () => {
            const serverPromiseFactory: () => Promise<Server> = async () => {
                // This allows us to safely treat the value as a Promise regardless of whether
                // or not is was passed in as an actual Promise or a synchronous factory
                const requestListener = await Promise.resolve(createRequestListener);

                // Pass */* as the binary mime types.  This tells aws-serverless-express to effectively
                // treat all messages as binary and not reinterpret them.
                const server = serverlessExpress.createServer(
                    requestListener(), /*serverListenCallback*/ undefined, /*binaryMimeTypes*/ ["*/*"]);

                return server;
            };

            const serverPromise = serverPromiseFactory();

            // All the entrypoint function for the Lambda has to do is pass the events along to the
            // server we created above.  That server will then forward the messages along to the
            // request listener provided by the caller.
            return (event, context) => {
                // This only incurs the cost of running the async server init once and then on
                // all subsequent calls returns the already initialized instance to handle the call
                serverPromise.then(server => serverlessExpress.proxy(server, event, <any>context));
            };
        };

        // Now, create the actual AWS lambda from that factory function.
        const func = createFactoryFunction(name, entryPointFactory, { parent: this });

        const api = new aws.apigateway.x.API(name, {
            // Register two paths in the Swagger spec, for the root and for a catch all under the
            // root.  Both paths will map to the single AWS lambda created above.
            routes: [
                {
                    path: "/",
                    method: "ANY",
                    eventHandler: func.lambda,
                },
                {
                    path: "/{proxy+}",
                    method: "ANY",
                    eventHandler: func.lambda,
                },
            ],
        }, { parent: this });

        this.url = api.url;
        super.registerOutputs({
            url: this.url,
        });
    }
}

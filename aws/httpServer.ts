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

import * as apigateway from "./apigateway";
import { createFactoryFunction } from "./function";
import * as utils from "./utils";
import { sha1hash } from "./utils";

export class HttpServer extends pulumi.ComponentResource implements cloud.HttpServer {
    public /*out*/ readonly url: pulumi.Output<string>; // the URL for this deployment.

    public constructor(
        name: string,
        createRequestListener: () => (req: http.IncomingMessage, res: http.ServerResponse) => void,
        opts: pulumi.ComponentResourceOptions) {

        super("cloud:httpserver:HttpServer", name, {}, opts);

        // Create the main aws lambda entrypoint factory function.  Note that this is a factory
        // funcion so that we can just run this code once and hook up to
        function entryPoint() {
            const serverlessExpress = require("aws-serverless-express");
            const requestListener = createRequestListener();
            const server = serverlessExpress.createServer(requestListener);

            return (event: apigateway.APIGatewayRequest, context: aws.serverless.Context) => {
                serverlessExpress.proxy(server, event, <any>context);
            };
        }

        // Have to register two paths (that will point to the same lambda).  One for the root
        // itself, and one for any path off of the root.
        const swaggerPath = "/";
        const swaggerPathProxy = "/{proxy+}";

        const func =  createFactoryFunction(name, entryPoint, { parent: this });

        // Register two paths in the Swagger spec, for the root and for a catch all under the root
        const swagger = apigateway.createBaseSpec(name);
        swagger.paths[swaggerPath] = { "x-amazon-apigateway-any-method": apigateway.createPathSpecLambda(func.lambda) };
        swagger.paths[swaggerPathProxy] = { "x-amazon-apigateway-any-method": apigateway.createPathSpecLambda(func.lambda) };

        // Now stringify the resulting swagger specification and create the various API Gateway objects.
        const swaggerStr = apigateway.createSwaggerString(swagger);
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

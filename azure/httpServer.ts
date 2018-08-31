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

import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import * as serverless from "@pulumi/azure-serverless";
import * as subscription from "@pulumi/azure-serverless/subscription";
import * as http from "http";

const azureExpression = require("azure-function-express");

export class HttpServer extends pulumi.ComponentResource implements cloud.HttpServer {
    public /*out*/ readonly url: pulumi.Output<string>; // the URL for this deployment.

    public constructor(
        name: string,
        createRequestListener: () => (req: http.IncomingMessage, res: http.ServerResponse) => void,
        opts: pulumi.ComponentResourceOptions) {

        super("cloud:httpserver:HttpServer", name, {}, opts);

        /*
        {
            "bindings": [{
              "authLevel" : "anonymous",
              "type"      : "httpTrigger",
              "direction" : "in",
              "name"      : "req",
              "route"     : "{*segments}"
            }, {
              "type"      : "http",
              "direction" : "out",
              "name"      : "res"
            }]
          }
          */

        const bindings: subscription.Binding[] = [
            // Input binding that captures all incoming http requests.
            <subscription.Binding>{
                "authLevel" : "anonymous",
                "type"      : "httpTrigger",
                "direction" : "in",
                "name"      : "req",
                "route"     : "{*segments}",
            },
            // Output binding necessary to return http responses.
            {
                "type"      : "http",
                "direction" : "out",
                "name"      : "res",
            }];

        const eventSubscription = new subscription.EventSubscription<subscription.Context, any> (
            "cloud:httpserver:EventSubscription", name,
            context => {

            }, bindings, {}, { parent: this });
    }
}

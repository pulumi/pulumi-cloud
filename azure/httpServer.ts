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

import * as subscription from "@pulumi/azure-serverless/subscription";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import * as express from "express";
import * as http from "http";
import * as azureFunctionExpress from "./azure-function-express";
import * as shared from "./shared";

export class HttpServer extends pulumi.ComponentResource implements cloud.HttpServer {
    public /*out*/ readonly url: pulumi.Output<string>; // the URL for this deployment.

    public constructor(
        name: string,
        createRequestListener: () => (req: http.IncomingMessage, res: http.ServerResponse) => void,
        opts: pulumi.ComponentResourceOptions) {

        super("cloud:httpserver:HttpServer", name, {}, opts);

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

        const createHandler = azureFunctionExpress.createHandler;
        const factoryFunc: subscription.CallbackFactory<subscription.Context, any> = () => {
            let handler: any;
            try {
                // Ensure that node's current working dir (CWD) is the same as the where we're launching
                // this module from.  We need this as Azure launches node from D:\windows\system32,
                // causing any node modules that expect CWD to be where the original module is to break.
                //
                // For example, this impacts express.static which resolves files relative to CWD.
                const dir = __dirname;
                process.chdir(dir);

                const requestListener = createRequestListener();

                // We're hosted at https://${n}.azurewebsites.net/api/ but we want to ensure any hits to
                // that URL map to / not /api/.  To get that, we set up a simple route here that maps
                // from /api to the request listener the client actually provides.
                const app = express();
                app.use("/api", requestListener);

                app.use(function (err: any, req: any, res: any, next: any) {
                    res.json({ finaltophandler: "triggered" });
                });

                handler = createHandler(app);
            }
            catch (err) {
                return context => {
                    context.log("Error occurred setting up factory function.");
                    context.done();
                };
            }

            return context => {
                try {
                    handler(context);
                    // context.log("Calling done synchronously.");
                    // context.done();
                } catch (err) {
                    context.log("Error executing handler.");
                    context.done();
                }
            };
        };

        const eventSubscription = new subscription.EventSubscription<subscription.Context, any>(
            "cloud:httpserver:EventSubscription", name, bindings, {
                ...shared.defaultSubscriptionArgs,
                factoryFunc,
                resourceGroup: shared.globalResourceGroup,
            }, { parent: this });

        this.url = eventSubscription.functionApp.name.apply(n => `https://${n}.azurewebsites.net/api/`);
        super.registerOutputs({
            url: this.url,
        });
    }
}

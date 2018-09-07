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
            const requestListener = createRequestListener();

            const app = express();
            app.use("/api", requestListener);

            const handler = createHandler(app);

            return (context: subscription.Context) => {
                return handler(context);
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

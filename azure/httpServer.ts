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
import * as awsServerlessExpress from "aws-serverless-express";
import * as express from "express";
import * as http from "http";
import * as url from "url";
// import * as azureFunctionExpress from "./azure-function-express";
import * as shared from "./shared";

interface AWSEvent {
    path: string;
    httpMethod: string;
    headers: { [header: string]: string; };
    queryStringParameters: { [param: string]: string; };
    body: string;
    isBase64Encoded: boolean;
}

interface AWSContext {
    succeed: (val: any) => void;
}

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

        // const azureFunctionExpress = require("azure-function-express");
        const factoryFunc: subscription.CallbackFactory<subscription.Context, any> = () => {
            let server: http.Server;
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

                server = awsServerlessExpress.createServer(app);

                // handler = azureFunctionExpress.createHandler(
                //     (req: express.Request, res: express.Response, next: express.NextFunction) => {
                //         (<any>res)._header = "";

                //         return app(req, res, next);
                //     });
            }
            catch (err) {
                // If we failed to execute the function the caller provided, set up a simple handler
                // that just indicates the problem.
                return context => {
                    context.log("Error occurred setting up factory function.");
                    context.done();
                };
            }

            return azureContext => {
                try {
                    if (!azureContext.req) {
                        throw new Error("Azure context missing [req] property.");
                    }

                    const azureRequest = azureContext.req;
                    if (azureRequest.originalUrl === undefined) {
                        throw new Error("Azure context.req missing [originalUrl] property.");
                    }

                    const parsedURL = url.parse(azureRequest.originalUrl);
                    const path = parsedURL.pathname;
                    if (path === undefined) {
                        throw new Error("Could not determine pathname in: " + azureRequest.originalUrl);
                    }

                    // const headers = JSON.parse(JSON.stringify(azureRequest.headers || {}));
                    // delete headers["authorization"];
                    // delete headers["connection"];
                    // delete headers["if-none-match"];
                    // delete headers["max-forwards"];
                    // delete headers["origin"];
                    // delete headers["x-waws-unencoded-url"];
                    // delete headers["client-ip"];
                    // delete headers["is-service-tunneled"];
                    // delete headers["x-arr-log-id"];
                    // delete headers["disguised-host"];
                    // delete headers["x-site-deployment-id"];
                    // delete headers["was-default-hostname"];
                    // delete headers["x-original-url"];
                    // delete headers["x-arr-ssl"];

                    // if (!azureRequest.body) {
                    //     delete headers["content-length"];
                    // }

                    const headers = {
                        "Accept": "*/*",
                        "Accept-Encoding": "gzip, deflate, br",
                        "Accept-Language": "en-GB,en;q=0.5",
                        "CloudFront-Forwarded-Proto": "https",
                        "CloudFront-Is-Desktop-Viewer": "true",
                        "CloudFront-Is-Mobile-Viewer": "false",
                        "CloudFront-Is-SmartTV-Viewer": "false",
                        "CloudFront-Is-Tablet-Viewer": "false",
                        "CloudFront-Viewer-Country": "US",
                        "Host": "wb7zafnsfi.execute-api.us-east-2.amazonaws.com",
                        "Referer": "https://wb7zafnsfi.execute-api.us-east-2.amazonaws.com/stage/index.html",
                        "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:61.0) Gecko/20100101 Firefox/61.0",
                        "Via": "2.0 8cf3b0c0dbbd56e2b65caa29e0eea872.cloudfront.net (CloudFront)",
                        "X-Amz-Cf-Id": "4dIIMhOis_NLh_uF6fTNdNiPsHEC99vXqG3VgIeF83da_619dWoexw==",
                        "X-Amzn-Trace-Id": "Root=1-5b94159e-ec6f493470df04dc2db611b0",
                        "X-Forwarded-For": "67.162.215.65, 52.46.21.76",
                        "X-Forwarded-Port": "443",
                        "X-Forwarded-Proto": "https",
                    };

                    const awsEvent: AWSEvent = {
                        path: path,
                        httpMethod: azureRequest.method,
                        headers: headers,
                        queryStringParameters: azureRequest.query || {},
                        body: azureRequest.body,
                        isBase64Encoded: false,
                    };

                    azureContext.log("Azure context: " + JSON.stringify(azureContext));
                    azureContext.log("Aws event: " + JSON.stringify(awsEvent));

                    const awsContext: AWSContext = {
                        succeed: val => {
                            azureContext.log("Proxy success: " + JSON.stringify(val));
                            azureContext.done();
                        },
                    };
                    awsServerlessExpress.proxy(server, awsEvent, <any>awsContext);
                    // console.log(JSON.stringify(context));
                    // handler(context);
                } catch (err) {
                    azureContext.log("Error executing handler. " + err.message + "\m" + err.stack);
                    azureContext.done();
                }
            };
        };

        const eventSubscription = new subscription.EventSubscription<subscription.Context, any>(
            "cloud:httpserver:EventSubscription", name, bindings, {
                ...shared.defaultSubscriptionArgs,
                factoryFunc,
                resourceGroup: shared.globalResourceGroup,
                appSettings: pulumi.output({ "WEBSITE_NODE_DEFAULT_VERSION": "10.6.0" }),
            }, { parent: this });

        this.url = eventSubscription.functionApp.name.apply(n => `https://${n}.azurewebsites.net/api/`);
        super.registerOutputs({
            url: this.url,
        });
    }
}

// headers

    // "headers": {
    //     "Accept": "*/*",
    //     "Accept-Encoding": "gzip, deflate, br",
    //     "Accept-Language": "en-GB,en;q=0.5",
    //     "CloudFront-Forwarded-Proto": "https",
    //     "CloudFront-Is-Desktop-Viewer": "true",
    //     "CloudFront-Is-Mobile-Viewer": "false",
    //     "CloudFront-Is-SmartTV-Viewer": "false",
    //     "CloudFront-Is-Tablet-Viewer": "false",
    //     "CloudFront-Viewer-Country": "US",
    //     "Host": "wb7zafnsfi.execute-api.us-east-2.amazonaws.com",
    //     "Referer": "https://wb7zafnsfi.execute-api.us-east-2.amazonaws.com/stage/index.html",
    //     "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:61.0) Gecko/20100101 Firefox/61.0",
    //     "Via": "2.0 8cf3b0c0dbbd56e2b65caa29e0eea872.cloudfront.net (CloudFront)",
    //     "X-Amz-Cf-Id": "4dIIMhOis_NLh_uF6fTNdNiPsHEC99vXqG3VgIeF83da_619dWoexw==",
    //     "X-Amzn-Trace-Id": "Root=1-5b94159e-ec6f493470df04dc2db611b0",
    //     "X-Forwarded-For": "67.162.215.65, 52.46.21.76",
    //     "X-Forwarded-Port": "443",
    //     "X-Forwarded-Proto": "https",
    //     "x-requested-with": "XMLHttpRequest"
    // },


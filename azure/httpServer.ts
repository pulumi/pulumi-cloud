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
import { interpolate } from "@pulumi/pulumi";
import * as awsServerlessExpress from "aws-serverless-express";
import * as express from "express";
import * as http from "http";
import * as url from "url";
import * as shared from "./shared";

// Our implementation of httpServer is interesting in that we defer to the same shared helper lib we
// use in @pulumi/cloud-aws for actually handling incoming requests in a highly node-compatible
// manner.  Specifically, we use the "aws-serverless-express" library.  This library works by
// actually launching a real node http server (using http.createServer) and then calling in through
// normal node http requests. All the library then needs to do is map the incoming AWS request types
// to the a node http request, and then convert the http response back to a form that AWS expects.
// This works very well and saves us from having to do any of the same.
//
// So all we have to do now is map *Azure's* incoming request over to the AWS form that this library
// expects.  And we then map the result AWS type it produces over to the form Azure expects. The
// code for both of these translation is very simple and easy to maintain.


// The shape of an APIGateway incoming http request.  This is the incoming form that
// "aws-serverless-express" expects.  We call it 'event' (as opposed to request) because that's the
// name that library uses internally.  This helps keep it clear what maps to what.
//
// The library will convert this to a normal http request and then call the local http server that
// it launched.
interface AWSEvent {
    path: string;
    httpMethod: string;
    headers: Record<string, string>;
    queryStringParameters: Record<string, string>;
    body: string;
    isBase64Encoded: boolean;
}

// The response that the library produces once the http request it made completes.  This is the
// response form that APIGateway expects.
interface AWSResponse {
    statusCode: number;
    body: string;
    headers: Record<string, string>;
    isBase64Encoded: boolean;
}

// This is the shape of the 'context' object that "aws-serverless-express" expects.  It does nothing
// with it except call "succeed" with an appropriate result once it completes. When we get that
// response we'll translate it to an Azure specific result type and return that to our caller.
interface AWSContext {
    succeed: (awsResponse: AWSResponse) => void;
}

export class HttpServer extends pulumi.ComponentResource implements cloud.HttpServer {
    public /*out*/ readonly url: pulumi.Output<string>; // the URL for this deployment.

    public constructor(
        name: string, createRequestListener: cloud.RequestListenerFactory,
        opts: pulumi.ComponentResourceOptions = {}) {

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

        // Setup the top level factory function for the FunctionApp we're creating. That factory
        // function will end up launching a real node http server locally.  Once that's done it will
        // return the incoming message handler.  This handler will translate incoming azure message
        // to normal node http requests that it will send to that server.  When it gets a normal
        // http response back, it will translate that back to a form azure expects as an http
        // response.
        const factoryFunc = createFactoryFunction(createRequestListener);

        const eventSubscription = new subscription.EventSubscription<subscription.Context, any>(
            "cloud:httpserver:EventSubscription", name, bindings, {
                ...shared.defaultSubscriptionArgs,
                factoryFunc,
            }, { parent: this });

        this.url = interpolate `https://${eventSubscription.functionApp.name}.azurewebsites.net/api/`;
        super.registerOutputs({
            url: this.url,
        });
    }
}

function createFactoryFunction(
    createRequestListener: cloud.RequestListenerFactory): subscription.CallbackFactory<subscription.Context, any> {

    return () => {
        // First, setup the server.  This will only happen once when the module loads.
        let server: http.Server;
        try {
            server = createServer(createRequestListener);
        }
        catch (err) {
            // If we failed to create the server, set up a simple handler that just indicates
            // the problem.
            return context => {
                context.log("Error occurred creating server: " + err.message + "\n" + err.stack);
                context.done();
            };
        }

        // Now, create the function that will handle all incoming requests.
        return azureContext => handleIncomingMessage(server, azureContext);
    };
}

function createServer(createRequestListener: cloud.RequestListenerFactory) {
    // Ensure that node's current working dir (CWD) is the same as the where we're launching
    // this module from.  We need this as Azure launches node from D:\windows\system32,
    // causing any node modules that expect CWD to be where the original module is to break.
    //
    // For example, this impacts express.static which resolves files relative to CWD.

    const dir = __dirname;
    process.chdir(dir);

    // Create the request listener component that our caller actually wants to process
    // all incoming http requests with.
    const requestListener = createRequestListener();

    // We're hosted at https://${n}.azurewebsites.net/api/ but we want to ensure any hits to
    // that URL map to / not /api/.  To get that, we set up a simple route here that maps
    // from /api to the request listener the client actually provides.
    const app = express();
    app.use("/api", requestListener);

    // Now, use the helper library to actually create the server, and give it our express app as the
    // handler for all incoming messages.  When an incoming message (like /api/foo/bar) comes in, it
    // will first go to our /api handler.  This will then update the request to be /foo/bar and will
    // forward into the callers request handler.

    // Pass */* as the binary mime types.  This tells aws-serverless-express to effectively
    // treat all messages as binary and not reinterpret them.
    const server = awsServerlessExpress.createServer(
        app, /*serverListenCallback*/ undefined, /*binaryMimeTypes*/ ["*/*"]);
    return server;
}

function handleIncomingMessage(server: http.Server, azureContext: subscription.Context) {
    try {
        // First, ensure the azure http request/response is one we understand.
        if (!azureContext.req) {
            throw new Error("Azure context missing [req] property.");
        }

        if (!azureContext.res) {
            throw new Error("Azure context missing [res] property.");
        }

        const azureRequest = azureContext.req;
        if (azureRequest.originalUrl === undefined) {
            throw new Error("Azure context.req missing [originalUrl] property.");
        }

        // Convert the azure incoming request to the form that aws-serverless-express expects.
        // It's nearly the same, just with some names slightly changed.  One small difference
        // is that azure keeps paths in their full form like `/api/foo/bar?name=baz`.  However,
        // AWS wants to have the `/api/foo/bar` and {'name':'baz'} parts separated.

        const parsedURL = url.parse(azureRequest.originalUrl);
        const path = parsedURL.pathname;
        if (path === null) {
            throw new Error("Could not determine pathname in: " + azureRequest.originalUrl);
        }

        const awsEvent: AWSEvent = {
            path: path,
            httpMethod: azureRequest.method,
            headers: azureRequest.headers || {},
            queryStringParameters: azureRequest.query || {},
            body: azureRequest.body,
            isBase64Encoded: false,
        };

        // Now create the context object to pass to the library.  The context is object is very
        // simple.  We just listen for the 'succeed' call, and we then map the AWS response object
        // back to the form Azure wants.  As above, this is very simple and is effectively only name
        // changes.
        const awsContext: AWSContext = {
            succeed(awsResponse) {
                // Copy values over.
                const azureResponse = azureContext.res!;
                azureResponse.status = awsResponse.statusCode;
                azureResponse.body = Buffer.from(
                    awsResponse.body,
                    awsResponse.isBase64Encoded ? "base64" : "utf8");
                azureResponse.isRaw = true;

                // Merge any headers produced by the lib.
                const headers = azureResponse.headers || {};
                Object.assign(headers, awsResponse.headers);
                azureResponse.headers = headers;

                // Signal that we're done.
                azureContext.done();
            },
        };

        // Now, call into the library to actually handle the translated Azure-to-AWS request.
        awsServerlessExpress.proxy(server, awsEvent, <any>awsContext);
    }
    catch (err) {
        azureContext.log("Error executing handler: " + err.message + "\n" + err.stack);
        azureContext.done();
    }
}

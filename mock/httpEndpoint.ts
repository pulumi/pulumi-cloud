// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as bodyParser from "body-parser";
import * as express from "express";
import * as core from "express-serve-static-core";
import * as http from "http";
import * as pulumi from "pulumi";

export class HttpEndpoint implements cloud.HttpEndpoint {
    public url?: pulumi.Computed<string>;

    public staticFile: (path: string, filePath: string, contentType?: string) => void;
    public route: (method: string, path: string, ...handlers: cloud.RouteHandler[]) => void;
    public get: (path: string, ...handlers: cloud.RouteHandler[]) => void;
    public put: (path: string, ...handlers: cloud.RouteHandler[]) => void;
    public post: (path: string, ...handlers: cloud.RouteHandler[]) => void;
    public delete: (path: string, ...handlers: cloud.RouteHandler[]) => void;
    public options: (path: string, ...handlers: cloud.RouteHandler[]) => void;
    public all: (path: string, ...handlers: cloud.RouteHandler[]) => void;
    public publish: () => pulumi.Computed<string>;

    constructor(unused: string) {
        let app = express();

        // use 'raw' body parsing to convert populate any request body properly with a buffer.
        app.use(bodyParser.raw());
        let server: http.Server | undefined = undefined;

        this.staticFile = (path, filePath) => {
            app.use(path, express.static(filePath));
        };

        this.route = (method, path, ...handlers) => {
            method = method.toLowerCase();

            // Limit to the set of route methods we support on AWS.
            switch (method) {
                case "get":
                case "put":
                case "post":
                case "delete":
                case "options":
                case "head":
                case "patch":
                case "any":
                    break;
                default:
                    throw new Error("Method not supported: " + method);
            }

            let routerMatcher = <{ (path: string, ...handlers: express.RequestHandler[]): void }>(<any>app)[method];

            function handler(req: express.Request, res: express.Response, next: express.NextFunction) {
                // Convert express' request/response forms to our own.
                const convertedRequest = convertRequest(req);
                const convertedResponse = convertResponse(res);

                let index = 0;
                function callNextHandler() {
                    if (index < handlers.length) {
                        const nextHandler = handlers[index];
                        index++;
                        nextHandler(convertedRequest, convertedResponse, callNextHandler);
                    }
                    else {
                        // Reached the end of our own handler chain.  Call into the next handler
                        // that express passed us.
                        next();
                    }
                }

                // Delegate to the first handler in the chain.  Allowing it to process the
                // request/response pair. This handlers can choose to call "next()" which will
                // delegate to the next handler in the chain. Once the end of the chain is reached
                // any calls in the handler to next() will call into express' next handler that
                // they have passed to us.
                callNextHandler();
            }

            routerMatcher(path, handler);
        };

        this.get = (path, ...handlers) => this.route("get", path, ...handlers);
        this.put = (path, ...handlers) => this.route("put", path, ...handlers);
        this.post = (path, ...handlers) => this.route("post", path, ...handlers);
        this.delete = (path, ...handlers) => this.route("delete", path, ...handlers);
        this.options = (path, ...handlers) => this.route("options", path, ...handlers);
        this.all = (path, ...handlers) => this.route("all", path, ...handlers);

        this.publish = () =>  {
            if (app === undefined) {
                throw new Error("HttpAPI has already been published");
            }

            server = app.listen(0);
            this.url = Promise.resolve(server.address().address);
            return this.url;
        };

        function convertRequestHandler(handler: cloud.RouteHandler): express.RequestHandler {
            return (expressRequest: core.Request, expressResponse: core.Response, expressNext: core.NextFunction) => {
                return handler(convertRequest(expressRequest), convertResponse(expressResponse), expressNext);
            };
        }

        function convertRequest(expressRequest: core.Request): cloud.Request {
            return {
                // Safe to directly convert the body to a buffer because we are using raw body
                // parsing above.
                body: <Buffer>expressRequest.body,
                method: expressRequest.method,
                params: expressRequest.params,
                headers: expressRequest.headers,
                query: expressRequest.query,
                path: expressRequest.path,
                protocol: expressRequest.protocol,
                baseUrl: expressRequest.baseUrl,
                hostname: expressRequest.hostname,
            };
        }

        function convertResponse(expressResponse: core.Response): cloud.Response {
            return {
                status: (code: number) => convertResponse(expressResponse.status(code)),
                setHeader: (name: string, value: string) => { expressResponse.setHeader(name, value); return this; },
                write: (data: string, encoding?: string) => { expressResponse.write(data, encoding); return this; },
                end: (data?: string, encoding?: string) => expressResponse.end(data, encoding),
                json: (obj: any) => expressResponse.json(obj),
            };
        }
    }

    public attachCustomDomain(domain: cloud.Domain): Promise<string | undefined> {
        throw new Error("Method not implemented.");
    }
}

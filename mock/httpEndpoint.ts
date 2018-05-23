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
import * as bodyParser from "body-parser";
import * as express from "express";
import * as http from "http";
import * as httpProxy from "http-proxy-middleware";
import * as serveStatic from "serve-static";
import * as utils from "./utils";

const usedNames: { [name: string]: string } = Object.create(null);

export class HttpEndpoint implements cloud.HttpEndpoint {
    public static: (path: string, localPath: string, options?: cloud.ServeStaticOptions) => void;
    public proxy: (path: string, target: string | pulumi.Output<cloud.Endpoint>) => void;
    public route: (method: string, path: string, ...handlers: cloud.RouteHandler[]) => void;
    public get: (path: string, ...handlers: cloud.RouteHandler[]) => void;
    public put: (path: string, ...handlers: cloud.RouteHandler[]) => void;
    public post: (path: string, ...handlers: cloud.RouteHandler[]) => void;
    public delete: (path: string, ...handlers: cloud.RouteHandler[]) => void;
    public options: (path: string, ...handlers: cloud.RouteHandler[]) => void;
    public all: (path: string, ...handlers: cloud.RouteHandler[]) => void;
    public publish: () => cloud.HttpDeployment;

    constructor(name: string) {
        utils.ensureUnique(usedNames, name, "HttpEndpoint");

        const app = express();

        // Use 'raw' body parsing to convert populate any request body properly with a buffer. Pass
        // an always-true function as our options so that always convert the request body into a
        // buffer no matter what the content type.
        app.use(bodyParser.raw({ type: () => true }));

        this.static = (path, localPath, options) => {
            const expressOptions: serveStatic.ServeStaticOptions | undefined = options
                ? { index: options.index }
                : undefined;
            app.use(path, express.static(localPath, expressOptions));
        };

        this.proxy = async (path, target) => {
            let url: string;
            if (typeof target === "string") {
                url = target;
            } else {
                // We're in tests, so the endpoint won't be closure serialized.  Just grab out its
                // value here directly.
                const targetEndpoint = await utils.serialize(target);
                url = `http://${targetEndpoint.get().hostname}:${targetEndpoint.get().port}`;
            }
            app.use(path, httpProxy({target: url}));
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

            const routerMatcher: Function = (<any>app)[method];
            routerMatcher.apply(app, [path, [handler]]);
        };

        this.get = (path, ...handlers) => this.route("get", path, ...handlers);
        this.put = (path, ...handlers) => this.route("put", path, ...handlers);
        this.post = (path, ...handlers) => this.route("post", path, ...handlers);
        this.delete = (path, ...handlers) => this.route("delete", path, ...handlers);
        this.options = (path, ...handlers) => this.route("options", path, ...handlers);
        this.all = (path, ...handlers) => this.route("all", path, ...handlers);

        this.publish = (port?: number) =>  {
            if (app === undefined) {
                throw new Error("HttpAPI has already been published");
            }
            return new HttpDeployment(app, port);
        };

        function convertRequestHandler(handler: cloud.RouteHandler): express.RequestHandler {
            return (expressRequest: express.Request,
                    expressResponse: express.Response,
                    expressNext: express.NextFunction) => {
                return handler(convertRequest(expressRequest), convertResponse(expressResponse), expressNext);
            };
        }

        function convertRequest(expressRequest: express.Request): cloud.Request {
            return {
                // Safe to directly convert the body to a buffer because we are using raw body
                // parsing above.
                body: <Buffer>expressRequest.body,
                method: expressRequest.method,
                params: expressRequest.params,
                headers: <any>expressRequest.headers,
                rawHeaders: expressRequest.rawHeaders,
                query: expressRequest.query,
                path:   expressRequest.path,
                protocol: expressRequest.protocol,
                baseUrl: expressRequest.baseUrl,
                hostname: expressRequest.hostname,
            };
        }

        function convertResponse(expressResponse: express.Response): cloud.Response {
            return {
                locals: expressResponse.locals,
                status: (code: number) => convertResponse(expressResponse.status(code)),
                end: (data?: string, encoding?: string) => expressResponse.end(data, encoding),
                json: (obj: any) => expressResponse.json(obj),
                getHeader: (field: string) => {
                    return expressResponse.get(field);
                },
                setHeader(headerName: string, value: string) {
                    expressResponse.setHeader(headerName, value);
                    return this;
                },
                write(data: string, encoding?: string) {
                    expressResponse.write(data, encoding);
                    return this;
                },
                redirect: (arg1: number | string, arg2?: string) => {
                    if (typeof arg1 === "string") {
                        expressResponse.redirect(302, arg1);
                    } else {
                        expressResponse.redirect(arg1, arg2!);
                    }
                },
            };
        }
    }

    public attachCustomDomain(domain: cloud.Domain): void {
        throw new Error("Custom domain names not available for local emulation");
    }
}

class HttpDeployment implements cloud.HttpDeployment {
    public readonly url: pulumi.Output<string>;
    public readonly customDomainNames: pulumi.Output<string>[];

    constructor(app: express.Application, port?: number) {
        const server: http.Server = app.listen(port || 0);
        this.url = pulumi.output(`http://localhost:${server.address().port}`);
        this.customDomainNames = [];
    }
}


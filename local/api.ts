// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as fabric from "@pulumi/pulumi-fabric";
import * as express from "express";
import * as core from "express-serve-static-core";
import * as http from "http";
import * as types from "./../api/types";

export class HttpAPI implements types.HttpAPI {
    public url?: fabric.Computed<string>;

    public staticFile: (path: string, filePath: string, contentType?: string) => void;
    public route: (method: string, path: string, ...handlers: types.RouteHandler[]) => void;
    public get: (path: string, ...handlers: types.RouteHandler[]) => void;
    public put: (path: string, ...handlers: types.RouteHandler[]) => void;
    public post: (path: string, ...handlers: types.RouteHandler[]) => void;
    public delete: (path: string, ...handlers: types.RouteHandler[]) => void;
    public options: (path: string, ...handlers: types.RouteHandler[]) => void;
    public all: (path: string, ...handlers: types.RouteHandler[]) => void;
    public publish: () => fabric.Computed<string>;

    constructor(unused: string) {
        let app = express();
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
            routerMatcher(path, ...handlers.map(rh => convertRequestHandler(rh)));
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

        function convertRequestHandler(handler: types.RouteHandler): express.RequestHandler {
            return (expressRequest: core.Request, expressResponse: core.Response, expressNext: core.NextFunction) => {
                return handler(convertRequest(expressRequest), convertResponse(expressResponse), expressNext);
            };
        }

        function convertRequest(expressRequest: core.Request): types.Request {
            throw new Error("Method not implemented.");
        }

        function convertResponse(expressResponse: core.Response): types.Response {
            return {
                status: (code: number) => convertResponse(expressResponse.status(code)),
                setHeader: (name: string, value: string) => { expressResponse.setHeader(name, value); return this; },
                write: (data: string) => { expressResponse.write(data); return this; },
                end: (data?: string) => expressResponse.end(),
                json: (obj: any) => expressResponse.json(obj)
            };
        }
    }

    public attachCustomDomain(domain: types.Domain): Promise<string | undefined> {
        throw new Error("Method not implemented.");
    }
}

// /**
//  * Request represents an HttpAPI request.
//  */
// export interface Request {
//     /**
//      * The body of the HTTP request.
//      */
//     body: Buffer;
//     /**
//      * The method of the HTTP request.
//      */
//     method: string;
//     /**
//      * The path parameters of the HTTP request. Each `{param}` in the matched route is available as a
//      * property of this oject.
//      */
//     params: { [param: string]: string; };
//     /**
//      * The headers of the HTTP request.
//      */
//     headers: { [header: string]: string; };
//     /**
//      * The query parameters parsed from the query string of the request URL.
//      */
//     query: { [query: string]: string; };
//     /**
//      * The raw path from the HTTP request.
//      */
//     path: string;
// }

// /**
//  * Response represents the response to an HttpAPI request.
//  */
// export interface Response {
//     /**
//      * Sets the HTTP response status code and returns a `Response` for chaining operations.
//      */
//     status(code: number): Response;
//     /**
//      * Sets a header on the HTTP response and returns the `Response` for chaining operations.
//      */
//     setHeader(name: string, value: string): Response;
//     /**
//      * Writes a string to the HTTP response body and returns the `Response` for chaining operations.
//      */
//     write(data: string): Response;
//     /**
//      * Sends the HTTP response, optionally including data to write to the HTTP response body.
//      */
//     end(data?: string): void;
//     /**
//      * JSON serializes an object, writes it to the HTTP response body, and sends the HTTP response.
//      */
//     json(obj: any): void;
// }

// /**
//  * RouteHandler represents a handler for a route on an HttpAPI.
//  *
//  * Implementations should invoke methods on `res` to respond to the request, or invoke `next`
//  * to pass control to the next available handler on the route for further processing.
//  */
// export type RouteHandler = (req: Request, res: Response, next: () => void) => void;


// /**
//  * HttpAPI publishes an internet-facing HTTP API, for serving web applications or REST APIs.
//  *
//  * ```javascript
//  * let api = new HttpAPI("myapi")
//  * api.get("/", (req, res) => res.json({hello: "world"}));
//  * api.publish();
//  * api.url.mapValue(url =>
//  *   console.log(`Serving myapi at ${url}`)
//  * );
//  * ```
//  *
//  * Paths are `/` seperated.  A path can use `{param}` to capture zero-or-more non-`/` characters
//  * and make the captured path segment available in `req.params.param`, or `{param+}` to greedily
//  * capture all remaining characters in the url path into `req.params.param`.
//  *
//  * Paths and routing are defined statically, and cannot overlap. Code inside a route handler
//  * can be used to provide dynamic decisions about sub-routing within a static path.
//  */
// export interface HttpAPI1 {
//     /**
//      * The url that the HttpAPI is being served at. Set only after a succesful call to `publish`.
//      */
//     url?: fabric.Computed<string>;

//     /**
//      * staticFile serves a static file from within the source folder at the requested path.
//      *
//      * @param path The route path at which to serve the file.
//      * @param filePath The local file path relative to the Pulumi program folder.
//      * @param contentType The `content-type` to serve the file as.
//      */
//     staticFile(path: string, filePath: string, contentType?: string): void;

//     /**
//      * Routes any requests with given HTTP method on the given path to the provided handler(s).
//      * @param method The HTTP method to handle.
//      * @param path The path to handle requests on.
//      * @param handlers One or more handlers to apply to requests.
//      */
//     route(method: string, path: string, ...handlers: RouteHandler[]): void;

//     /**
//      * Routes GET requests on the given path to the provided handler(s).
//      * @param path The path to handle requests on.
//      * @param handlers One or more handlers to apply to requests.
//      */
//     get(path: string, ...handlers: RouteHandler[]): void;

//     /**
//      * Routes PUT requests on the given path to the provided handler(s).
//      * @param path The path to handle requests on.
//      * @param handlers One or more handlers to apply to requests.
//      */
//     put(path: string, ...handlers: RouteHandler[]): void;

//     /**
//      * Routes POST requests on the given path to the provided handler(s).
//      * @param path The path to handle requests on.
//      * @param handlers One or more handlers to apply to requests.
//      */
//     post(path: string, ...handlers: RouteHandler[]): void;

//     /**
//      * Routes DELETE requests on the given path to the provided handler(s).
//      * @param path The path to handle requests on.
//      * @param handlers One or more handlers to apply to requests.
//      */
//     delete(path: string, ...handlers: RouteHandler[]): void;

//     /**
//      * Routes OPTIONS requests on the given path to the provided handler(s).
//      * @param path The path to handle requests on.
//      * @param handlers One or more handlers to apply to requests.
//      */
//     options(path: string, ...handlers: RouteHandler[]): void;

//     /**
//      * Routes all HTTP methods on the given path to the provided handler(s).
//      * @param path The path to handle requests on.
//      * @param handlers One or more handlers to apply to requests.
//      */
//     all(path: string, ...handlers: RouteHandler[]): void;

//     /**
//      * Publishes an HttpAPI to be internet accessible.
//      *
//      * This should be called after describing desired routes.
//      *
//      * @returns A computed string representing the URL at which the HttpAPI is available to the internet.
//      */
//     publish(): fabric.Computed<string>;

//     /**
//      * Attach a custom domain to this HttpAPI.
//      *
//      * Provide a domain name you own, along with SSL certificates from a certificate authority (e.g. LetsEncrypt).
//      * The return value is a domain name that you must map your custom domain to using a DNS A record.
//      *
//      * _Note_: It is strongly encouraged to store certificates in config variables and not in source code.
//      *
//      * @returns The domain name that you must map your custom domain to using a DNS A record.
//      */
//     attachCustomDomain(domain: Domain): fabric.Computed<string>;
// }

// /**
//  * Domain includes the domain name and certificate data to enable hosting an HttpAPI on a custom domain.
//  */
// export interface Domain {
//     /**
//      * The domain name to associate with the HttpAPI.
//      */
//     domainName: string;
//     /**
//      * An SSL/TLS certficicate issued for this domain (`cert.pem`).
//      */
//     certificateBody: string;
//     /**
//      * An SSL/TLS private key issued for thie domain (`privkey.pem`).
//      */
//     certificatePrivateKey: string;
//     /**
//      * The certificate chain for the SSL/TLS certificate provided for this domain (`chain.pem`).
//      */
//     certificateChain: string;
// }

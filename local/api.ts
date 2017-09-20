// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as fabric from "@pulumi/pulumi-fabric";
import * as express from "express";

/**
 * Request represents an HttpAPI request.
 */
export interface Request {
    /**
     * The body of the HTTP request.
     */
    body: Buffer;
    /**
     * The method of the HTTP request.
     */
    method: string;
    /**
     * The path parameters of the HTTP request. Each `{param}` in the matched route is available as a
     * property of this oject.
     */
    params: { [param: string]: string; };
    /**
     * The headers of the HTTP request.
     */
    headers: { [header: string]: string; };
    /**
     * The query parameters parsed from the query string of the request URL.
     */
    query: { [query: string]: string; };
    /**
     * The raw path from the HTTP request.
     */
    path: string;
}

/**
 * Response represents the response to an HttpAPI request.
 */
export interface Response {
    /**
     * Sets the HTTP response status code and returns a `Response` for chaining operations.
     */
    status(code: number): Response;
    /**
     * Sets a header on the HTTP response and returns the `Response` for chaining operations.
     */
    setHeader(name: string, value: string): Response;
    /**
     * Writes a string to the HTTP response body and returns the `Response` for chaining operations.
     */
    write(data: string): Response;
    /**
     * Sends the HTTP response, optionally including data to write to the HTTP response body.
     */
    end(data?: string): void;
    /**
     * JSON serializes an object, writes it to the HTTP response body, and sends the HTTP response.
     */
    json(obj: any): void;
}

/**
 * RouteHandler represents a handler for a route on an HttpAPI.
 *
 * Implementations should invoke methods on `res` to respond to the request, or invoke `next`
 * to pass control to the next available handler on the route for further processing.
 */
export type RouteHandler = (req: Request, res: Response, next: () => void) => void;

export interface HttpAPIConstructor {
    new (apiName: string): HttpAPI;
}

export let HttpAPI: HttpAPIConstructor; // tslint:disable-line

/**
 * HttpAPI publishes an internet-facing HTTP API, for serving web applications or REST APIs.
 *
 * ```javascript
 * let api = new HttpAPI("myapi")
 * api.get("/", (req, res) => res.json({hello: "world"}));
 * api.publish();
 * api.url.mapValue(url =>
 *   console.log(`Serving myapi at ${url}`)
 * );
 * ```
 *
 * Paths are `/` seperated.  A path can use `{param}` to capture zero-or-more non-`/` characters
 * and make the captured path segment available in `req.params.param`, or `{param+}` to greedily
 * capture all remaining characters in the url path into `req.params.param`.
 *
 * Paths and routing are defined statically, and cannot overlap. Code inside a route handler
 * can be used to provide dynamic decisions about sub-routing within a static path.
 */
export interface HttpAPI {
    /**
     * The url that the HttpAPI is being served at. Set only after a succesful call to `publish`.
     */
    url?: fabric.Computed<string>;

    /**
     * staticFile serves a static file from within the source folder at the requested path.
     *
     * @param path The route path at which to serve the file.
     * @param filePath The local file path relative to the Pulumi program folder.
     * @param contentType The `content-type` to serve the file as.
     */
    staticFile(path: string, filePath: string, contentType?: string): void;

    /**
     * Routes any requests with given HTTP method on the given path to the provided handler(s).
     * @param method The HTTP method to handle.
     * @param path The path to handle requests on.
     * @param handlers One or more handlers to apply to requests.
     */
    route(method: string, path: string, ...handlers: RouteHandler[]): void;

    /**
     * Routes GET requests on the given path to the provided handler(s).
     * @param path The path to handle requests on.
     * @param handlers One or more handlers to apply to requests.
     */
    get(path: string, ...handlers: RouteHandler[]): void;

    /**
     * Routes PUT requests on the given path to the provided handler(s).
     * @param path The path to handle requests on.
     * @param handlers One or more handlers to apply to requests.
     */
    put(path: string, ...handlers: RouteHandler[]): void;

    /**
     * Routes POST requests on the given path to the provided handler(s).
     * @param path The path to handle requests on.
     * @param handlers One or more handlers to apply to requests.
     */
    post(path: string, ...handlers: RouteHandler[]): void;

    /**
     * Routes DELETE requests on the given path to the provided handler(s).
     * @param path The path to handle requests on.
     * @param handlers One or more handlers to apply to requests.
     */
    delete(path: string, ...handlers: RouteHandler[]): void;

    /**
     * Routes OPTIONS requests on the given path to the provided handler(s).
     * @param path The path to handle requests on.
     * @param handlers One or more handlers to apply to requests.
     */
    options(path: string, ...handlers: RouteHandler[]): void;

    /**
     * Routes all HTTP methods on the given path to the provided handler(s).
     * @param path The path to handle requests on.
     * @param handlers One or more handlers to apply to requests.
     */
    all(path: string, ...handlers: RouteHandler[]): void;

    /**
     * Publishes an HttpAPI to be internet accessible.
     *
     * This should be called after describing desired routes.
     *
     * @returns A computed string representing the URL at which the HttpAPI is available to the internet.
     */
    publish(): fabric.Computed<string>;

    /**
     * Attach a custom domain to this HttpAPI.
     *
     * Provide a domain name you own, along with SSL certificates from a certificate authority (e.g. LetsEncrypt).
     * The return value is a domain name that you must map your custom domain to using a DNS A record.
     *
     * _Note_: It is strongly encouraged to store certificates in config variables and not in source code.
     *
     * @returns The domain name that you must map your custom domain to using a DNS A record.
     */
    attachCustomDomain(domain: Domain): fabric.Computed<string>;
}

/**
 * Domain includes the domain name and certificate data to enable hosting an HttpAPI on a custom domain.
 */
export interface Domain {
    /**
     * The domain name to associate with the HttpAPI.
     */
    domainName: string;
    /**
     * An SSL/TLS certficicate issued for this domain (`cert.pem`).
     */
    certificateBody: string;
    /**
     * An SSL/TLS private key issued for thie domain (`privkey.pem`).
     */
    certificatePrivateKey: string;
    /**
     * The certificate chain for the SSL/TLS certificate provided for this domain (`chain.pem`).
     */
    certificateChain: string;
}

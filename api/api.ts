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

import * as pulumi from "@pulumi/pulumi";
import { Endpoint } from "./service";

/**
 * Request represents an API request.
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
     * The path parameters of the HTTP request. Each `{param}` in the matched
     * route is available as a property of this oject.
     */
    params: { [param: string]: string; };
    /**
     * The headers of the HTTP request.
     */
    headers: { [header: string]: string | string[]; };
    /**
     * The headers of the HTTP request.
     */
    rawHeaders: string[];
    /**
     * The query parameters parsed from the query string of the request URL.
     */
    query: { [query: string]: string | string[]; };
    /**
     * The raw path from the HTTP request.
     */
    path: string;
    /**
     * The protocol of the request (e.g. HTTP/HTTPS).
     */
    protocol: string;
    /**
     * The base url on which this http request was served.
     */
    baseUrl: string;
    /**
     * The hostname of the request.
     */
    hostname: string;
}

/**
 * Response represents the response to an API request.
 */
export interface Response {
    /**
     * Object containing local variables scoped to a single request. Useful for
     * exposing request-level information such as user settings.
     */
    locals: any;
    /**
     * Sets the HTTP response status code and returns a `Response` for chaining
     * operations.
     */
    status(code: number): Response;
    /**
     * Gets the Headers for the Response
     */
    getHeader(name: string): string;
    /**
     * Sets a header on the HTTP response and returns the `Response` for
     * chaining operations.
     */
    setHeader(name: string, value: string): Response;
    /**
     * Writes a string to the HTTP response body and returns the `Response` for
     * chaining operations.
     */
    write(data: string | Buffer, encoding?: string): Response;
    /**
     * Sends the HTTP response, optionally including data to write to the HTTP
     * response body.
     */
    end(data?: string | Buffer, encoding?: string): void;
    /**
     * JSON serializes an object, writes it to the HTTP response body, and sends
     * the HTTP response.
     */
    json(obj: any): void;
    /**
     * Mark the response to redirect the client to the provided URL with
     * the optional status code, defaulting to 302.
     */
    redirect(url: string): void;
    redirect(status: number, url: string): void;
}

/**
 * RouteHandler represents a handler for a route on an API.
 *
 * Implementations should invoke methods on `res` to respond to the request, or
 * invoke `next` to pass control to the next available handler on the route for
 * further processing.
 */
export type RouteHandler = (req: Request, res: Response, next: () => void) => void;

export interface APIConstructor {
    new (apiName: string): API;
}

export let API: APIConstructor; // tslint:disable-line

export interface ServeStaticOptions {
    /**
     * The `content-type` to serve the file as.  Only valid when localPath points to a file.  If
     * localPath points to a directory, the content types for all files will be inferred.
     */
    contentType?: string;
    /**
     * By default API.static will also serve 'index.html' in response to a request on a
     * directory. To disable this set false or to supply a new index pass a string.
     */
    index?: boolean | string;
}

/**
 * API publishes an internet-facing HTTP API, for serving web
 * applications or REST APIs.
 *
 * ```javascript
 * let api = new API("myapi")
 * api.get("/", (req, res) => res.json({hello: "world"}));
 * api.publish().url.then(url =>
 *   console.log(`Serving myapi at ${url}`)
 * );
 * ```
 *
 * Paths are `/` seperated.  A path can use `{param}` to capture zero-or-more
 * non-`/` characters and make the captured path segment available in
 * `req.params.param`, or `{param+}` to greedily capture all remaining
 * characters in the url path into `req.params.param`.
 *
 * Paths and routing are defined statically, and cannot overlap. Code inside a
 * route handler can be used to provide dynamic decisions about sub-routing
 * within a static path.
 */
export interface API {
    /**
     * static serves a file or directory from within the source folder at the requested path.
     *
     * @param path The route path at which to serve the file.
     * @param localPath The local path.  If not absolute, it is considered relative to the Pulumi
     *                  program folder.
     * @param options Optional options that can be provided to customize the serving behavior.
     */
    static(path: string, localPath: string, options?: ServeStaticOptions): void;

    /**
     * proxy forwards an HTTP request to a target URL or Endpoint.
     *
     * @param path The route path at which to serve the file.
     * @param target The target URL or Endpoint to proxy to. If a string is provided, it must be an Internet reachable
     *               URL.  If an Endpoint is provided, it can be any endpoint exposed by the stack, including endpoints
     *               which are not exposed directly to the Internet.
     */
    proxy(path: string, target: string | pulumi.Output<Endpoint>): void;

    /**
     * Routes any requests with given HTTP method on the given path to the
     * provided handler(s).
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
     * Attach a custom domain to this API.
     *
     * Provide a domain name you own, along with SSL certificates from a
     * certificate authority (e.g. LetsEncrypt).
     *
     * Must be called prior to [publish]ing the API.
     *
     * _Note_: It is strongly encouraged to store certificates in config
     * variables and not in source code.
     */
    attachCustomDomain(domain: Domain): void;

    /**
     * Publishes an API to be internet accessible.
     *
     * This should be called after describing desired routes and domains.
     * Throws an error if called multiple times on the same endpoint.
     *
     * @returns An HttpDeployment object representing the live API.
     */
    publish(): HttpDeployment;
}

/**
 * HttpDeployment represents an API that has been deployed and is
 * available at a URL.
 */
export interface HttpDeployment {
    /**
     * The URL at which the HttpDeployment is available to the Internet.
     */
    url: pulumi.Output<string>;
    /**
     * An optional list of custom domain names, each corresponding to a
     * previous call to attachCustomDomain on the API.  Each name
     * should be mapped using a DNS A record.
     */
    customDomainNames: pulumi.Output<string>[];
}

/**
 * Domain includes the domain name and certificate data to enable hosting an
 * API on a custom domain.
 */
export interface Domain {
    /**
     * The domain name to associate with the API.
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
     * The certificate chain for the SSL/TLS certificate provided for this
     * domain (`chain.pem`).
     */
    certificateChain: string;
}

/**
 * @deprecated HttpEndpoint has been renamed to API
 */
export type HttpEndpoint = API;
/**
 * @deprecated HttpEndpoint has been renamed to API
 */
export let HttpEndpoint: APIConstructor; // tslint:disable-line

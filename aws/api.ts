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

import * as aws from "@pulumi/aws";
import * as lambda from "@pulumi/aws/lambda";
import * as awsx from "@pulumi/awsx";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";

import { createCallbackFunction } from "./function";
import { Endpoint } from "./service";
import { sha1hash } from "./utils";

// StaticRoute is a registered static file route, backed by an S3 bucket.
export interface StaticRoute {
    path: string;
    localPath: string;
    options: cloud.ServeStaticOptions;
}

// ProxyRoute is a registered proxy route, proxying to either a URL or cloud.Endpoint.
export interface ProxyRoute {
    path: string;
    target: string | pulumi.Output<cloud.Endpoint>;
}

// Route is a registered dynamic route, backed by a serverless Lambda.
export interface Route {
    method: string;
    path: string;
    handlers: cloud.RouteHandler[];
}

// AWSDomain represents a domain with an SSL/TLS certificate available in AWS.
// The certificate must be in the us-east-1 region.
export interface AWSDomain {
    domainName: string;
    certificateArn: pulumi.Input<string>;
}

// Domain represents a hosted domain and associated SSL/TLS certificates.
export type Domain = cloud.Domain | AWSDomain;

// Helper to test whether the Domain is a cloud.Domain or an AWS-specific Domain.
function isCloudDomain(domain: Domain): domain is cloud.Domain {
    return (domain as cloud.Domain).certificateBody !== undefined;
}

export class API implements cloud.API {
    private readonly name: string;
    private readonly staticRoutes: StaticRoute[];
    private readonly proxyRoutes: ProxyRoute[];
    private readonly routes: Route[];
    private readonly customDomains: Domain[];
    public deployment?: HttpDeployment;

    constructor(name: string) {
        this.name = name;
        this.staticRoutes = [];
        this.proxyRoutes = [];
        this.routes = [];
        this.customDomains = [];
    }

    private cleanPath(path: string): string {
        if (path.endsWith("/")) {
            path = path.slice(0, -1);
        }
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        return path;
    }

    public static(path: string, localPath: string, options?: cloud.ServeStaticOptions) {
        path = this.cleanPath(path);
        this.staticRoutes.push({ path, localPath, options: options || {} });
    }

    public proxy(path: string, target: string | pulumi.Output<cloud.Endpoint>) {
        path = this.cleanPath(path);
        this.proxyRoutes.push({ path, target });
    }

    public route(method: string, path: string, ...handlers: cloud.RouteHandler[]) {
        path = this.cleanPath(path);
        this.routes.push({ method: method, path: path, handlers: handlers });
    }

    public get(path: string, ...handlers: cloud.RouteHandler[]) {
        this.route("GET", path, ...handlers);
    }

    public put(path: string, ...handlers: cloud.RouteHandler[]) {
        this.route("PUT", path, ...handlers);
    }

    public post(path: string, ...handlers: cloud.RouteHandler[]) {
        this.route("POST", path, ...handlers);
    }

    public delete(path: string, ...handlers: cloud.RouteHandler[]) {
        this.route("DELETE", path, ...handlers);
    }

    public options(path: string, ...handlers: cloud.RouteHandler[]) {
        this.route("OPTIONS", path, ...handlers);
    }

    public all(path: string, ...handlers: cloud.RouteHandler[]) {
        this.route("ANY", path, ...handlers);
    }

    public attachCustomDomain(domain: Domain): void {
        this.customDomains.push(domain);
    }

    public publish(): HttpDeployment {
        if (this.deployment) {
            throw new RunError("This endpoint is already published and cannot be re-published.");
        }
        // Create a unique name prefix that includes the name plus all the registered routes.
        this.deployment = new HttpDeployment(
            this.name, this.staticRoutes, this.proxyRoutes, this.routes, this.customDomains);
        return this.deployment;
    }
}

// HttpDeployment actually performs a deployment of a set of HTTP API Gateway resources.
export class HttpDeployment extends pulumi.ComponentResource implements cloud.HttpDeployment {
    public readonly staticRoutes: StaticRoute[];
    public readonly proxyRoutes: ProxyRoute[];
    public readonly routes: Route[];

    public /*out*/ readonly api: awsx.apigateway.API;
    public /*out*/ readonly url: pulumi.Output<string>; // the URL for this deployment.
    public /*out*/ readonly customDomainNames: pulumi.Output<string>[]; // any custom domain names.
    public /*out*/ readonly customDomains: aws.apigateway.DomainName[]; // AWS DomainName objects for custom domains.

    private static registerCustomDomains(parent: pulumi.Resource, apiName: string, api: aws.apigateway.RestApi,
                                         domains: Domain[]): aws.apigateway.DomainName[] {

        const awsDomains: aws.apigateway.DomainName[] = [];
        for (const domain of domains) {
            // Ensure this pair of api-domain name doesn't conflict with anything else.  i.e. there
            // may be another http endpoint that registers a custom domain with a different data.
            // We don't want to collide with that. hash the name to ensure this urn doesn't get too
            // long.
            const domainNameHash = sha1hash(domain.domainName);
            const apiNameAndHash = `${apiName}-${domainNameHash}`;

            let domainArgs: aws.apigateway.DomainNameArgs;
            if (isCloudDomain(domain)) {
                domainArgs = {
                    domainName: domain.domainName,
                    certificateName: domain.domainName,
                    certificateBody: domain.certificateBody,
                    certificatePrivateKey: domain.certificatePrivateKey,
                    certificateChain: domain.certificateChain,
                };
            }
            else {
                domainArgs = {
                    domainName: domain.domainName,
                    certificateArn: domain.certificateArn,
                };
            }

            const awsDomain = new aws.apigateway.DomainName(apiNameAndHash, domainArgs, { parent });

            const basePathMapping = new aws.apigateway.BasePathMapping(apiNameAndHash, {
                restApi: api,
                stageName: stageName,
                domainName: awsDomain.domainName,
            }, { parent });

            awsDomains.push(awsDomain);
        }

        return awsDomains;
    }

    constructor(name: string, staticRoutes: StaticRoute[], proxyRoutes: ProxyRoute[],
                routes: Route[], customDomains: Domain[], opts?: pulumi.ResourceOptions) {

        super("cloud:http:API", name, {}, opts);

        this.staticRoutes = staticRoutes;
        this.proxyRoutes = proxyRoutes;
        this.routes = routes;

        this.api = new awsx.apigateway.API(name, {
            routes: [
                ...staticRoutes.map(convertStaticRoute),
                ...proxyRoutes.map(r => convertProxyRoute(name, this, r)),
                ...routes.map(r => convertRoute(name, r, { parent: this })),
            ],
        }, { parent: this });

        // If there are any custom domains, attach them now.
        const awsDomains: aws.apigateway.DomainName[] =
            HttpDeployment.registerCustomDomains(this, name, this.api.restAPI, customDomains);

        // Finally, manufacture a URL and set it as an output property.
        this.url = this.api.url;
        this.customDomainNames = awsDomains.map(awsDomain => awsDomain.cloudfrontDomainName);
        this.customDomains = awsDomains;

        this.registerOutputs({
            api: this.api,
            url: this.url,
            staticRoutes: staticRoutes,
            proxyRoutes: proxyRoutes,
            routes: routes,
            customDomainNames: this.customDomainNames,
            customDomains: this.customDomainNames,
        });
    }
}

function convertStaticRoute(route: StaticRoute): awsx.apigateway.StaticRoute {
    const options = route.options || {};
    return {
        path: route.path,
        localPath: route.localPath,
        contentType: options.contentType,
        index: options.index,
    };
}

function convertProxyRoute(name: string, api: HttpDeployment, route: ProxyRoute): awsx.apigateway.IntegrationRoute {
    return {
        path: route.path,
        target: convertProxyRouteTarget(name, api, route),
    };
}

function convertProxyRouteTarget(name: string, api: HttpDeployment, route: ProxyRoute): pulumi.Input<awsx.apigateway.IntegrationTarget> {
    const target = route.target;
    if (typeof target === "string") {
        let result = target;
        // ensure there is a trailing `/`
        if (!result.endsWith("/")) {
            result += "/";
        }

        return { uri: result, type: "http_proxy", connectionId: undefined, connectionType: undefined };
    }

    const targetArn = target.apply(ep => {
        const endpoint = ep as Endpoint;

        if (!endpoint.loadBalancer) {
            throw new pulumi.ResourceError("AWS endpoint proxy requires an AWS Endpoint", api);
        }
        return endpoint.loadBalancer.loadBalancerType.apply(loadBalancerType => {
            if (loadBalancerType === "application") {
                // We can only support proxying to an Endpoint if it is backed by an
                // NLB, which will only be the case for cloud.Service ports exposed as
                // type "tcp".
                throw new pulumi.ResourceError(
                    "AWS endpoint proxy requires an Endpoint on a service port of type 'tcp'", api);
            }
            return endpoint.loadBalancer.arn;
        });
    });

    const vpcLink = new aws.apigateway.VpcLink(name + sha1hash(route.path), {
        targetArn: targetArn,
    }, { parent: api });

    return {
        uri: pulumi.interpolate`http://${target.hostname}:${target.port}/`,
        type: "http_proxy",
        connectionType: "VPC_LINK",
        connectionId: vpcLink.id,
    };
}

function convertRoute(name: string, route: Route, opts: pulumi.ResourceOptions): awsx.apigateway.Route {
    return {
        method: <awsx.apigateway.Method>route.method,
        path: route.path,
        eventHandler: convertHandlers(name, route, opts),
    };
}

function convertHandlers(name: string, route: Route, opts: pulumi.ResourceOptions): lambda.Function {
    const handlers = route.handlers;

    const callback: lambda.Callback<awsx.apigateway.Request, awsx.apigateway.Response> = (ev, ctx, cb) => {
        let body: Buffer;
        if (ev.body !== null) {
            if (ev.isBase64Encoded) {
                body = Buffer.from(ev.body, "base64");
            } else {
                body = Buffer.from(ev.body, "utf8");
            }
        } else {
            body = Buffer.from([]);
        }

        ctx.callbackWaitsForEmptyEventLoop = false;

        const [req, res] = apiGatewayToRequestResponse(ev, body, cb);
        let i = 0;
        const next = () => {
            const nextHandler = handlers[i++];
            if (nextHandler !== undefined) {
                nextHandler(req, res, next);
            }
        };
        next();
    };

    const routeName = name + sha1hash(route.method + ":" + route.path);

    // Create the CallbackFunction in the cloud layer as opposed to just passing 'callback' as-is to
    // apigateway.x.API to do it. This ensures that the right configuration values are used that
    // will appropriately respect user settings around things like codepaths/policies etc.
    const callbackFunction = createCallbackFunction(
        routeName, callback, /*isFactoryFunction:*/ false, opts);

    return callbackFunction;
}

const stageName = "stage";
function apiGatewayToRequestResponse(
    ev: awsx.apigateway.Request, body: Buffer, cb: (err: any, result: awsx.apigateway.Response) => void): [cloud.Request, cloud.Response] {
    const response = {
        statusCode: 200,
        headers: <{ [header: string]: string }>{},
        body: Buffer.from([]),
    };
    const headers: { [name: string]: string; } = {};
    const rawHeaders: string[] = [];
    // Lowercase all header names to align with Node.js HTTP request behaviour,
    // and create the `rawHeaders` array to maintain access to raw header data.
    if (ev.headers) {
        for (const [name, header] of Object.entries(ev.headers)) {
            if (header) {
                headers[name.toLowerCase()] = header;
                rawHeaders.push(name);
                rawHeaders.push(header);
            }
        }
    }
    const params: { [param: string]: string } = {};
    if (ev.pathParameters) {
        for (const [name, param] of Object.entries(ev.pathParameters)) {
            if (param) {
                params[name] = param;
            }
        }
    }
    const query: { [query: string]: string } = {};
    if (ev.queryStringParameters) {
        for (const [name, param] of Object.entries(ev.queryStringParameters)) {
            if (param) {
                query[name] = param;
            }
        }
    }
    // Always add `content-length` header, as this is stripped by API Gateway
    headers["content-length"] = body.length.toString();
    const req: cloud.Request = {
        headers: headers,
        rawHeaders: rawHeaders,
        body: body,
        method: ev.httpMethod,
        params: params,
        query: query,
        path: ev.path,
        baseUrl: "/" + stageName,
        hostname: headers["host"],
        protocol: headers["x-forwarded-proto"],
    };
    const res: cloud.Response = {
        locals: {},
        status: (code: number) => {
            response.statusCode = code;
            return res;
        },
        getHeader: (name: string) => {
            return response.headers![name];
        },
        setHeader: (name: string, value: string) => {
            response.headers![name] = value;
            return res;
        },
        write: (data: string | Buffer, encoding?: string) => {
            if (encoding === undefined) {
                encoding = "utf8";
            }
            if (typeof data === "string") {
                data = Buffer.from(data, encoding);
            }
            response.body = Buffer.concat([response.body, data]);
            return res;
        },
        end: (data?: string | Buffer, encoding?: string) => {
            if (data !== undefined) {
                res.write(data, encoding);
            }
            cb(null, {
                statusCode: response.statusCode,
                headers: response.headers,
                isBase64Encoded: true,
                body: response.body.toString("base64"),
            });
        },
        json: (obj: any) => {
            res.setHeader("content-type", "application/json");
            const seen = new WeakSet();
            res.end(JSON.stringify(obj, (_, value) => {
                if (typeof value === "object" && value !== null) {
                    if (seen.has(value)) {
                        return;
                    }
                    seen.add(value);
                }

                return value;
            }));
        },
        redirect: (arg1: string | number, arg2?: string) => {
            // Support two overloads:
            // - redirect(url: string): void;
            // - redirect(status: number, url: string): void;
            let code: number;
            let url: string;
            if (typeof arg1 === "string") {
                code = 302;
                url = arg1;
            } else {
                code = arg1;
                url = arg2!;
            }
            res.status(code);
            res.setHeader("Location", url);
            res.end();
        },
    };
    return [req, res];
}

/**
 * @deprecated HttpEndpoint has been renamed to API
 */
export type HttpEndpoint = API;
/**
 * @deprecated HttpEndpoint has been renamed to API
 */
export let HttpEndpoint = API; // tslint:disable-line

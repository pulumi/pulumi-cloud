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
import * as apigateway from "@pulumi/aws/apigateway";
import { x } from "@pulumi/aws/apigateway";
import * as lambda from "@pulumi/aws/lambda";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";

import * as crypto from "crypto";
import * as fs from "fs";
import * as mime from "mime";
import * as fspath from "path";
import * as utils from "./utils";

// import * as apigateway from "./apigateway";
import { createFunction, Function } from "./function";
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

    public static(path: string, localPath: string, options?: cloud.ServeStaticOptions) {
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        this.staticRoutes.push({ path, localPath, options: options || {} });
    }

    public proxy(path: string, target: string | pulumi.Output<cloud.Endpoint>) {
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
        this.proxyRoutes.push({ path, target });
    }

    public route(method: string, path: string, ...handlers: cloud.RouteHandler[]) {
        if (!path.startsWith("/")) {
            path = "/" + path;
        }
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
    public routes: Route[];
    public staticRoutes: StaticRoute[];
    public /*out*/ readonly url: pulumi.Output<string>; // the URL for this deployment.
    public /*out*/ readonly customDomainNames: pulumi.Output<string>[]; // any custom domain names.
    public /*out*/ readonly customDomains: aws.apigateway.DomainName[]; // AWS DomainName objects for custom domains.

    // private static registerStaticRoutes(parent: pulumi.Resource, apiName: string,
    //                                     staticRoutes: StaticRoute[], swagger: apigateway.SwaggerSpec) {
    //     // If there are no static files or directories, then we can bail out early.
    //     if (staticRoutes.length === 0) {
    //         return;
    //     }

    //     const method: string = apigateway.swaggerMethod("GET");

    //     // Create a bucket to place all the static data under.
    //     const bucket = new aws.s3.Bucket(safeS3BucketName(apiName), undefined, {parent});

    //     function createRole(key: string) {
    //         // Create a role and attach it so that this route can access the AWS bucket.
    //         const role = new aws.iam.Role(key, {
    //             assumeRolePolicy: JSON.stringify(apigateway.assumeRolePolicyDocument),
    //         }, {parent});
    //         const attachment = new aws.iam.RolePolicyAttachment(key, {
    //             role: role,
    //             policyArn: aws.iam.AmazonS3FullAccess,
    //         }, {parent});

    //         return role;
    //     }

    //     // For each static file, just make a simple bucket object to hold it, and create a swagger
    //     // path that routes from the file path to the arn for the bucket object.
    //     //
    //     // For static directories, use greedy api-gateway path matching so that we can map a single
    //     // api gateway route to all the s3 bucket objects we create for the files in these
    //     // directories.
    //     for (const route of staticRoutes) {
    //         const stat = fs.statSync(route.localPath);
    //         if (stat.isFile()) {
    //             processFile(route);
    //         }
    //         else if (stat.isDirectory()) {
    //             processDirectory(route);
    //         }
    //     }

    //     function createBucketObject(key: string, localPath: string, contentType?: string) {
    //         const obj = new aws.s3.BucketObject(key, {
    //             bucket: bucket,
    //             key: key,
    //             source: new pulumi.asset.FileAsset(localPath),
    //             contentType: contentType || mime.getType(localPath) || undefined,
    //         }, {parent});
    //     }

    //     function processFile(route: StaticRoute) {
    //         const key = apiName + sha1hash(method + ":" + route.path);
    //         const role = createRole(key);

    //         createBucketObject(key, route.localPath, route.options.contentType);

    //         const pathSpec = apigateway.createPathSpecObject(bucket, key, role);
    //         swagger.paths[route.path] = { [method]: pathSpec };
    //     }

    //     function processDirectory(directory: StaticRoute) {
    //         const directoryServerPath = directory.path.endsWith("/")
    //             ? directory.path
    //             : directory.path + "/";

    //         const directoryKey = apiName + sha1hash(method + ":" + directoryServerPath);
    //         const role = createRole(directoryKey);

    //         let startDir = directory.localPath.startsWith("/")
    //             ? directory.localPath
    //             : fspath.join(process.cwd(), directory.localPath);

    //         if (!startDir.endsWith(fspath.sep)) {
    //             startDir = fspath.join(startDir, fspath.sep);
    //         }

    //         const options = directory.options;

    //         // If the user has supplied 'false' for options.index, then no speciam index file served
    //         // at the root. Otherwise if they've supplied an actual filename to serve as the index
    //         // file then use what they've provided.  Otherwise attempt to serve "index.html" at the
    //         // root (if it exists).
    //         const indexFile = options && options.index === false
    //             ? undefined
    //             : options !== undefined && typeof options.index === "string"
    //                 ? options.index
    //                 : "index.html";

    //         const indexPath = indexFile === undefined ? undefined : fspath.join(startDir, indexFile);

    //         // Recursively walk the directory provided, creating bucket objects for all the files we
    //         // encounter.
    //         function walk(dir: string) {
    //             const children = fs.readdirSync(dir);

    //             for (const childName of children) {
    //                 const childPath = fspath.join(dir, childName);
    //                 const stats = fs.statSync(childPath);

    //                 if (stats.isDirectory()) {
    //                     walk(childPath);
    //                 }
    //                 else if (stats.isFile()) {
    //                     const childRelativePath = childPath.substr(startDir.length);
    //                     const childUrn = directoryKey + "/" + childRelativePath;

    //                     createBucketObject(childUrn, childPath);

    //                     if (childPath === indexPath) {
    //                         // We hit the file that we also want to serve as the index file. Create
    //                         // a specific swagger path from the server root path to it.
    //                         const indexPathSpec = apigateway.createPathSpecObject(bucket, childUrn, role);
    //                         swagger.paths[directoryServerPath] = { [method]: indexPathSpec };
    //                     }
    //                 }
    //             }
    //         }

    //         walk(startDir);

    //         // Take whatever path the client wants to host this folder at, and add the
    //         // greedy matching predicate to the end.

    //         const swaggerPath = directoryServerPath + "{proxy+}";
    //         const pathSpec = apigateway.createPathSpecObject(bucket, directoryKey, role, "proxy");
    //         swagger.paths[swaggerPath] = { [apigateway.swaggerMethod("any")]: pathSpec };
    //     }
    // }

    // private static registerProxyRoutes(parent: pulumi.Resource, apiName: string,
    //                                    proxyRoutes: ProxyRoute[], swagger: apigateway.SwaggerSpec) {
    //     const method = "x-amazon-apigateway-any-method";
    //     for (const route of proxyRoutes) {
    //         const swaggerPath = route.path.endsWith("/")
    //             ? route.path
    //             : route.path + "/";
    //         const swaggerPathProxy = swaggerPath + "{proxy+}";

    //         // If this is an Endpoint proxy, create a VpcLink to the load balancer in the VPC
    //         let vpcLink: aws.apigateway.VpcLink | undefined = undefined;
    //         if (typeof route.target !== "string") {
    //             const targetArn = route.target.apply(t => {
    //                 const endpoint = t as Endpoint;
    //                 if (!endpoint.loadBalancer) {
    //                     throw new RunError("AWS endpoint proxy requires an AWS Endpoint");
    //                 }
    //                 return endpoint.loadBalancer.loadBalancerType.apply(loadBalancerType => {
    //                     if (loadBalancerType === "application") {
    //                         // We can only support proxying to an Endpoint if it is backed by an
    //                         // NLB, which will only be the case for cloud.Service ports exposed as
    //                         // type "tcp".
    //                         throw new RunError(
    //                             "AWS endpoint proxy requires an Endpoint on a service port of type 'tcp'");
    //                     }
    //                     return endpoint.loadBalancer.arn;
    //                 });
    //             });
    //             const name = apiName + sha1hash(route.path);
    //             vpcLink = new aws.apigateway.VpcLink(name, {
    //                 targetArn: targetArn,
    //             });
    //         }

    //         // Register two paths in the Swagger spec, for the root and for a catch all under the root
    //         swagger.paths[swaggerPath] = {
    //             [method]: apigateway.createPathSpecProxy(route.target, vpcLink, false),
    //         };
    //         swagger.paths[swaggerPathProxy] = {
    //             [method]: apigateway.createPathSpecProxy(route.target, vpcLink, true),
    //         };
    //     }
    // }

    // private static registerRoutes(parent: pulumi.Resource, apiName: string,
    //                               routes: Route[], swagger: apigateway.SwaggerSpec): {[key: string]: Function} {
    //     const lambdas: {[key: string]: Function} = {};
    //     for (const route of routes) {
    //         const method = apigateway.swaggerMethod(route.method);
    //         const lambda = createFunction(
    //             apiName + sha1hash(method + ":" + route.path),
    //             (ev: apigateway.APIGatewayRequest, ctx, cb) => {
    //                 let body: Buffer;
    //                 if (ev.body !== null) {
    //                     if (ev.isBase64Encoded) {
    //                         body = Buffer.from(ev.body, "base64");
    //                     } else {
    //                         body = Buffer.from(ev.body, "utf8");
    //                     }
    //                 } else {
    //                     body = Buffer.from([]);
    //                 }

    //                 ctx.callbackWaitsForEmptyEventLoop = false;

    //                 const reqres = apiGatewayToRequestResponse(ev, body, cb);
    //                 let i = 0;
    //                 const next = () => {
    //                     const nextHandler = route.handlers[i++];
    //                     if (nextHandler !== undefined) {
    //                         nextHandler(reqres.req, reqres.res, next);
    //                     }
    //                 };
    //                 next();
    //             },
    //             { parent: parent },
    //         );
    //         lambdas[method + ":" + route.path] = lambda;

    //         if (!swagger.paths[route.path]) {
    //             swagger.paths[route.path] = {};
    //         }
    //         swagger.paths[route.path][method] = apigateway.createPathSpecLambda(lambda.lambda);
    //     }
    //     return lambdas;
    // }

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
            } else {
                domainArgs = {
                    domainName: domain.domainName,
                    certificateArn: domain.certificateArn,
                };
            }

            const awsDomain = new aws.apigateway.DomainName(apiNameAndHash, domainArgs, {parent});

            const basePathMapping = new aws.apigateway.BasePathMapping(apiNameAndHash, {
                restApi: api,
                stageName: stageName,
                domainName: awsDomain.domainName,
            }, {parent});

            awsDomains.push(awsDomain);
        }

        return awsDomains;
    }

    constructor(name: string, staticRoutes: StaticRoute[], proxyRoutes: ProxyRoute[],
                routes: Route[], customDomains: Domain[], opts?: pulumi.ResourceOptions) {

        super("cloud:http:API", name, {
            staticRoutes: staticRoutes,
            proxyRoutes: proxyRoutes,
            routes: routes,
            customDomains: customDomains,
        }, opts);

        this.routes = routes;
        this.staticRoutes = staticRoutes;

        const api2 = new x.API(name, {
            staticRoutes: convertStaticRoutes(staticRoutes),
            proxyRoutes: convertProxyRoutes(proxyRoutes),
            routes: convertRoutes(routes),
        }, { parent: this })

        // // Create a SwaggerSpec and then expand out all of the static files and routes.
        // const swagger = apigateway.createBaseSpec(name);
        // HttpDeployment.registerStaticRoutes(this, name, staticRoutes, swagger);
        // HttpDeployment.registerProxyRoutes(this, name, proxyRoutes, swagger);
        // const lambdas: {[key: string]: Function} = HttpDeployment.registerRoutes(this, name, routes, swagger);

        // // Now stringify the resulting swagger specification and create the various API Gateway objects.
        // const swaggerStr = apigateway.createSwaggerString(swagger);
        // const api = new aws.apigateway.RestApi(name, {
        //     body: swaggerStr,
        // }, { parent: this });

        // // bodyHash produces a hash that let's us know when any paths change in the swagger spec.
        // const bodyHash = swaggerStr.apply(s => sha1hash(s));

        // // we need to ensure a fresh deployment any time our body changes. So include the hash as
        // // part of the deployment urn.
        // const deployment = new aws.apigateway.Deployment(name, {
        //     restApi: api,
        //     stageName: "",
        //     // Note: We set `variables` here because it forces recreation of the Deployment object
        //     // whenever the body hash changes.  Because we use a blank stage name above, there will
        //     // not actually be any stage created in AWS, and thus these variables will not actually
        //     // end up anywhere.  But this will still cause the right replacement of the Deployment
        //     // when needed.  The Stage allocated below will be the stable stage that always points
        //     // to the latest deployment of the API.
        //     variables: {
        //         version: bodyHash,
        //     },
        //     description: bodyHash.apply(hash => `Deployment of version ${hash}`),
        // }, { parent: this });

        // const stage = new aws.apigateway.Stage(name, {
        //     stageName: stageName,
        //     description: "The current deployment of the API.",
        //     restApi: api,
        //     deployment: deployment,
        // }, { parent: this });

        // // Ensure that the permissions allow the API Gateway to invoke the lambdas.
        // for (const path of Object.keys(swagger.paths)) {
        //     for (let method of Object.keys(swagger.paths[path])) {
        //         const methodAndPath = method + ":" + path;
        //         const lambda = lambdas[methodAndPath];
        //         if (lambda !== undefined) {
        //             if (method === "x-amazon-apigateway-any-method") {
        //                 method = "*";
        //             }
        //             else {
        //                 method = method.toUpperCase();
        //             }
        //             const permissionName = name + "-" + sha1hash(methodAndPath);
        //             const invokePermission = new aws.lambda.Permission(permissionName, {
        //                 action: "lambda:invokeFunction",
        //                 function: lambda.lambda,
        //                 principal: "apigateway.amazonaws.com",
        //                 sourceArn: deployment.executionArn.apply(arn => arn + stageName + "/" + method + path),
        //             }, { parent: this });
        //         }
        //     }
        // }

        // If there are any custom domains, attach them now.
        const awsDomains: aws.apigateway.DomainName[] =
            HttpDeployment.registerCustomDomains(this, name, api2.restAPI, customDomains);

        // Finally, manufacture a URL and set it as an output property.
        this.url = api2.url;
        this.customDomainNames = awsDomains.map(awsDomain => awsDomain.cloudfrontDomainName);
        this.customDomains = awsDomains;
        super.registerOutputs({
            url: this.url,
            customDomainNames: this.customDomainNames,
        });

        return;
    }
}

function convertStaticRoutes(routes: StaticRoute[]): x.StaticRoute[] | undefined {
    if (!routes) {
        return undefined;
    }

    return routes.map(convertStaticRoute);
}

function convertStaticRoute(route: StaticRoute): x.StaticRoute {
    const options = route.options || {};
    return {
        path: route.path,
        localPath: route.localPath,
        contentType: options.contentType,
        index: options.index,
    };
}

function convertProxyRoutes(routes: ProxyRoute[]): x.ProxyRoute[] | undefined {
    if (!routes) {
        return undefined;
    }

    return routes.map(convertProxyRoute);
}

function convertProxyRoute(route: ProxyRoute): x.ProxyRoute {
    return {
        path: route.path,
        target: convertProxyRouteTarget(route.target),
    };
}

function convertProxyRouteTarget(target: string | pulumi.Output<cloud.Endpoint>): string | pulumi.Output<x.Endpoint> {
    if (typeof target === "string") {
        return target;
    }

    return target.apply(ep => {
        const apiEndpoint: x.Endpoint = {
            hostname: ep.hostname,
            port: ep.port,
            // note: if the endpoint passes in has no loadBalancer, this will fail with an
            // appropriate error in apigateway.x.API.
            loadBalancer: (ep as Endpoint).loadBalancer,
        };

        return apiEndpoint;
    });
}

function convertRoutes(routes: Route[]): x.Route[] | undefined {
    if (!routes) {
        return undefined;
    }

    return routes.map(convertRoute);
}

function convertRoute(route: Route): x.Route {
    return {
        method: <x.Method>route.method,
        path: route.path,
        handler: convertHandlers(route.handlers),
    };
}

function convertHandlers(handlers: cloud.RouteHandler[]): lambda.Callback<x.Request, x.Response> {
    const result: lambda.Callback<x.Request, x.Response> = (ev, ctx, cb) => {
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

    return result;
}

// interface RequestResponse {
//     req: cloud.Request;
//     res: cloud.Response;
// }

const stageName = "stage";
function apiGatewayToRequestResponse(
        ev: x.Request, body: Buffer, cb: (err: any, result: x.Response) => void): [cloud.Request, cloud.Response] {
    const response = {
        statusCode: 200,
        headers: <{[header: string]: string}>{},
        body: Buffer.from([]),
    };
    const headers: { [name: string]: string; } = {};
    const rawHeaders: string[] = [];
    // Lowercase all header names to align with Node.js HTTP request behaviour,
    // and create the `rawHeaders` array to maintain access to raw header data.
    for (const name of Object.keys(ev.headers)) {
        headers[name.toLowerCase()] = ev.headers[name];
        rawHeaders.push(name);
        rawHeaders.push(ev.headers[name]);
    }
    // Always add `content-length` header, as this is stripped by API Gateway
    headers["content-length"] = body.length.toString();
    const req: cloud.Request = {
        headers: headers,
        rawHeaders: rawHeaders,
        body: body,
        method: ev.httpMethod,
        params: ev.pathParameters,
        query: ev.queryStringParameters,
        path: ev.path,
        baseUrl: "/" + stageName,
        hostname: ev.headers["Host"],
        protocol: ev.headers["X-Forwarded-Proto"],
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
            res.end(JSON.stringify(obj));
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

// function safeS3BucketName(apiName: string): string {
//     return apiName.toLowerCase().replace(/[^a-z0-9\-]/g, "");
// }

/**
 * @deprecated HttpEndpoint has been renamed to API
 */
export type HttpEndpoint = API;
/**
 * @deprecated HttpEndpoint has been renamed to API
 */
export let HttpEndpoint = API; // tslint:disable-line

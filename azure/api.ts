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

import * as azure from "@pulumi/azure";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";

/** @deprecated [@pulumi/cloud-azure] has been deprecated.  Please migrate your code to [@pulumi/azure] */
export class API implements cloud.API {
    constructor(name: string) {
        throw new Error("Method not implemented.");
    }

    public static(path: string, localPath: string, options?: cloud.ServeStaticOptions) {
        throw new Error("Method not implemented.");
    }

    public proxy(path: string, target: string | pulumi.Output<cloud.Endpoint>) {
        throw new Error("Method not implemented.");
    }

    public route(method: string, path: string, ...handlers: cloud.RouteHandler[]) {
        throw new Error("Method not implemented.");
    }

    public get(path: string, ...handlers: cloud.RouteHandler[]) {
        throw new Error("Method not implemented.");
    }

    public put(path: string, ...handlers: cloud.RouteHandler[]) {
        throw new Error("Method not implemented.");
    }

    public post(path: string, ...handlers: cloud.RouteHandler[]) {
        throw new Error("Method not implemented.");
    }

    public delete(path: string, ...handlers: cloud.RouteHandler[]) {
        throw new Error("Method not implemented.");
    }

    public options(path: string, ...handlers: cloud.RouteHandler[]) {
        throw new Error("Method not implemented.");
    }

    public all(path: string, ...handlers: cloud.RouteHandler[]) {
        throw new Error("Method not implemented.");
    }

    public attachCustomDomain(domain: cloud.Domain): void {
        throw new Error("Method not implemented.");
    }

    public publish(): HttpDeployment {
        throw new Error("Method not implemented.");
    }
}

/** @deprecated [@pulumi/cloud-azure] has been deprecated.  Please migrate your code to [@pulumi/azure] */
export class HttpDeployment extends pulumi.ComponentResource implements cloud.HttpDeployment {
    public /*out*/ readonly url: pulumi.Output<string>; // the URL for this deployment.
    public /*out*/ readonly customDomainNames: pulumi.Output<string>[]; // any custom domain names.

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        super("cloud:http:API", name, {}, opts);

        throw new Error("Method not implemented.");

        this.registerOutputs({
            url: this.url,
            customDomainNames: this.customDomainNames,
        });
    }
}

/** @deprecated [@pulumi/cloud-azure] has been deprecated.  Please migrate your code to [@pulumi/azure] */
export type HttpEndpoint = API;

/** @deprecated [@pulumi/cloud-azure] has been deprecated.  Please migrate your code to [@pulumi/azure] */
export let HttpEndpoint = API; // tslint:disable-line

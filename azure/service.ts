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
import * as shared from "./shared";
import { RunError } from "@pulumi/pulumi/errors";

import * as docker from "@pulumi/docker";
import * as config from "./config";

export class Service extends pulumi.ComponentResource implements cloud.Service {
    public readonly name: string;

    public readonly endpoints: pulumi.Output<cloud.Endpoints>;
    public readonly defaultEndpoint: pulumi.Output<cloud.Endpoint>;

    public readonly getEndpoint: (containerName?: string, containerPort?: number) => Promise<cloud.Endpoint>;

    constructor(name: string, args: cloud.ServiceArguments, opts?: pulumi.ResourceOptions) {
        super("cloud:service:Service", name, { }, opts);

        this.getEndpoint = _ => { throw new Error("Method not implemented."); };

        throw new Error("Method not implemented.");
    }
}

/**
 * A Task represents a container which can be [run] dynamically whenever (and as many times as)
 * needed.
 */
export class Task extends pulumi.ComponentResource implements cloud.Task {
    public readonly run: (options?: cloud.TaskRunOptions) => Promise<void>;

    constructor(name: string, container: cloud.Container, opts?: pulumi.ResourceOptions) {
        super("cloud:task:Task", name, { container: container }, opts);

        this.run = _ => { throw new Error("Method not implemented."); };

        throw new Error("Method not implemented.");
    }
}

export class SharedVolume extends pulumi.ComponentResource implements cloud.SharedVolume {
    public readonly kind: cloud.VolumeKind;
    public readonly name: string;

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        super("cloud:volume:Volume", name, {}, opts);

        throw new Error("Method not implemented.");
    }
}

export class HostPathVolume implements cloud.HostPathVolume {
    public readonly kind: cloud.VolumeKind;
    public readonly path: string;

    constructor(path: string) {
        this.kind = "HostPathVolume";
        this.path = path;
    }
}

// registries contains a cache of already created azure container registries.
const registries = new Map<string, azure.containerservice.Registry>();

function getOrCreateRegistry(imageName: string): azure.containerservice.Registry {
    let registry = registries.get(imageName);
    if (!registry) {
        registry = new azure.containerservice.Registry(imageName, {
            resourceGroupName: shared.globalResourceGroupName,
            location: shared.globalResourceGroupLocation,

            // We need the admin account enabled so that we can grab the name/password to send to
            // docker.  We could consider an approach whereby this was not enabled, but it was
            // conditionally enabled/disabled on demand when needed.
            adminEnabled: true,
        });

        registries.set(imageName, registry);
    }

    return registry;
}

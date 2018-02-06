// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";

export class Service implements cloud.Service {
    name: string;
    endpoints: pulumi.Output<{ [containerName: string]: { [port: number]: cloud.Endpoint } }>;
    getEndpoint: (containerName?: string, containerPort?: number) => Promise<cloud.Endpoint>;
    constructor(name: string, args: cloud.ServiceArguments) {
        throw new Error(`Service not yet supported in mock implementation.`);
    }
}

export class Task implements cloud.Task {
    run: (options?: cloud.TaskRunOptions) => Promise<void>;
    constructor(name: string, container: cloud.Container) {
        throw new Error(`Task not yet supported in mock implementation.`);
    }
}

export class SharedVolume implements cloud.SharedVolume {
    kind: cloud.VolumeKind;
    name: string;
    constructor(name: string) {
        throw new Error(`SharedVolume not yet supported in mock implementation.`);
    }
}

export class HostPathVolume implements cloud.HostPathVolume {
    kind: cloud.VolumeKind;
    path: string;
    constructor(path: string) {
        throw new Error(`HostPathVolume not yet supported in mock implementation.`);
    }
}

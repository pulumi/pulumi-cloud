// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";

export class Service implements cloud.Service {
    name: string;
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

export class Volume implements cloud.Volume {
    name: string;
    constructor(name: string) {
        throw new Error(`Volume not yet supported in mock implementation.`);
    }
}

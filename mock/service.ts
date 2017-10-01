// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";

export class Service implements cloud.Service {
    name: string;
    getHostAndPort: (containerName: string, containerPort: number) => Promise<string>;
    constructor(name: string, args: cloud.ServiceArguments) {
        throw new Error(`Service not yet supported in mock implementation.`);
    }
}

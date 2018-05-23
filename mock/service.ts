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

import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";

export class Service implements cloud.Service {
    name: string;
    endpoints: pulumi.Output<{ [containerName: string]: { [port: number]: cloud.Endpoint } }>;
    defaultEndpoint: pulumi.Output<cloud.Endpoint>;

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

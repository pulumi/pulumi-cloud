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

export class Bucket extends pulumi.ComponentResource implements cloud.Bucket {
    public get: (key: string) => Promise<Buffer>;
    public put: (key: string, contents: Buffer) => Promise<void>;
    public delete: (key: string) => Promise<void>;

    public constructor(name: string, opts?: pulumi.ResourceOptions) {
        super("cloud:bucket:Bucket", name, {}, opts);

        this.get = _ => { throw new Error("Method not implemented."); };
        this.put = _ => { throw new Error("Method not implemented."); };
        this.delete = _ => { throw new Error("Method not implemented."); };

        throw new Error("Method not implemented.");
    }

    onPut(name: string, handler: cloud.BucketHandler, filter?: cloud.BucketFilter | undefined): void {
        throw new Error("Method not implemented.");
    }

    onDelete(name: string, handler: cloud.BucketHandler, filter?: cloud.BucketFilter | undefined): void {
        throw new Error("Method not implemented.");
    }
}

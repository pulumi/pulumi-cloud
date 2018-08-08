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

export class Table extends pulumi.ComponentResource implements cloud.Table {
    public readonly primaryKey: pulumi.Output<string>;
    public readonly primaryKeyType: pulumi.Output<string>;

    public get: (query: Object) => Promise<any>;
    public insert: (item: Object) => Promise<void>;
    public scan: { (): Promise<any[]>; (callback: (items: any[]) => Promise<boolean>): Promise<void>; };
    public delete: (query: Object) => Promise<void>;
    public update: (query: Object, updates: Object) => Promise<void>;

    constructor(name: string,
                primaryKey?: pulumi.Input<string>,
                primaryKeyType?: pulumi.Input<cloud.PrimaryKeyType>,
                opts?: pulumi.ResourceOptions) {
        if (primaryKey === undefined) {
            primaryKey = "id";
        }

        if (primaryKeyType === undefined) {
            primaryKeyType = "string";
        }

        super("cloud:table:Table", name, {
            primaryKey: primaryKey,
            primaryKeyType: primaryKeyType,
        }, opts);

        this.get = _ => { throw new Error("Method not implemented."); };
        this.insert = _ => { throw new Error("Method not implemented."); };
        this.scan = () => { throw new Error("Method not implemented."); };
        this.delete = _ => { throw new Error("Method not implemented."); };
        this.update = _ => { throw new Error("Method not implemented."); };
    }
}

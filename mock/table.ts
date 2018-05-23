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
import * as utils from "./utils";

const usedNames: { [name: string]: string } = Object.create(null);

export class Table implements cloud.Table {
    public readonly primaryKey: pulumi.Output<string>;
    public readonly primaryKeyType: pulumi.Output<string>;

    public get: (query: Object) => Promise<any>;
    public insert: (item: Object) => Promise<void>;
    public scan: { (): Promise<any[]>; (callback: (items: any[]) => Promise<boolean>): Promise<void>; };
    public delete: (query: Object) => Promise<void>;
    public update: (query: Object, updates: Object) => Promise<void>;

    constructor(name: string,
                primaryKey: pulumi.Input<string> = "id",
                primaryKeyType: pulumi.Input<string> = "string") {

        this.primaryKey = pulumi.output(primaryKey);
        this.primaryKeyType = pulumi.output(primaryKeyType);
        utils.ensureUnique(usedNames, name, "Table");

        const primaryKeyLocal = <string>primaryKey;
        const database = Object.create(null);
        this.get = (query: any) => {
            const pk = query[primaryKeyLocal];
            if (pk === undefined) {
                return Promise.reject(new Error("PrimaryKey not provided"));
            }

            for (const key of Object.keys(query)) {
                if (key !== primaryKeyLocal) {
                    return Promise.reject(new Error("Query does not match schema: " + key));
                }
            }

            const result = database[pk];
            return Promise.resolve(result);
        };

        this.insert = (query: any) => {
            const pk = query[primaryKeyLocal];
            if (pk === undefined) {
                return Promise.reject(new Error("PrimaryKey not provided"));
            }

            database[pk] = query;
            return Promise.resolve();
        };

        this.delete = (query: any) => {
            const pk = query[primaryKeyLocal];
            if (pk === undefined) {
                return Promise.reject(new Error("PrimaryKey not provided"));
            }

            const existingValue = database[pk];
            if (existingValue === undefined) {
                return Promise.reject(new Error("Item not found"));
            }

            delete database[pk];
            return Promise.resolve();
        };

        this.update = (query: any, updates: any) => {
            const pk = query[primaryKeyLocal];
            if (pk === undefined) {
                return Promise.reject(new Error("PrimaryKey not provided"));
            }

            const existingValue = database[pk];
            if (existingValue === undefined) {
                updates[primaryKeyLocal] = pk;
                return this.insert(updates);
            }

            for (const key of Object.keys(updates)) {
                existingValue[key] = updates[key];
            }

            return Promise.resolve();
        };

        this.scan = <any>((callback?: (items: any[]) => Promise<boolean>) => {
            const result = [];
            for (const key of Object.keys(database)) {
                result.push(database[key]);
            }

            if (callback !== undefined) {
                callback(result);
                return Promise.resolve();
            } else {
                return Promise.resolve(result);
            }
        });
    }
}

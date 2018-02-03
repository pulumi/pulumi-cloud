// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";
import * as utils from "./utils";

const usedNames: { [name: string]: string } = Object.create(null);

export class Table implements cloud.Table {
    public readonly primaryKey: pulumi.Computed<string>;
    public readonly primaryKeyType: pulumi.Computed<string>;

    public get: (query: Object) => Promise<any>;
    public insert: (item: Object) => Promise<void>;
    public scan: () => Promise<any[]>;
    public delete: (query: Object) => Promise<void>;
    public update: (query: Object, updates: Object) => Promise<void>;

    constructor(name: string,
                primaryKey: pulumi.ComputedValue<string> = "id",
                primaryKeyType: pulumi.ComputedValue<string> = "string") {

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

        this.scan = () =>  {
            const result = [];
            for (const key of Object.keys(database)) {
                result.push(database[key]);
            }

            return Promise.resolve(result);
        };
    }
}

// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";
import * as utils from "./utils";

const usedNames: { [name: string]: string } = Object.create(null);

export class Table implements cloud.Table {
    public tableName: pulumi.Computed<string>;

    public get: (query: Object) => Promise<any>;
    public insert: (item: Object) => Promise<void>;
    public scan: () => Promise<any[]>;
    public delete: (query: Object) => Promise<void>;
    public update: (query: Object, updates: Object) => Promise<void>;

    constructor(name: string,
                public readonly primaryKey: string = "id",
                public readonly primaryKeyType: string = "string") {

        utils.ensureUnique(usedNames, name, "Table");

        this.tableName = Promise.resolve(name);

        const database = Object.create(null);
        this.get = (query: any) => {
            const pk = query[primaryKey];
            if (pk === undefined) {
                return Promise.reject(new Error("PrimaryKey not provided"));
            }

            const result = database[pk];
            return Promise.resolve(result);
        };

        this.insert = (query: any) => {
            const pk = query[primaryKey];
            if (pk === undefined) {
                return Promise.reject(new Error("PrimaryKey not provided"));
            }

            database[pk] = query;
            return Promise.resolve();
        };

        this.delete = (query: any) => {
            const pk = query[primaryKey];
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
            const pk = query[primaryKey];
            if (pk === undefined) {
                return Promise.reject(new Error("PrimaryKey not provided"));
            }

            const existingValue = database[pk];
            if (existingValue === undefined) {
                updates[primaryKey] = pk;
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

// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as fabric from "@pulumi/pulumi-fabric";

import * as types from "../api/types"

const makeComputed = <T>(value: T): fabric.Computed<T> => ({
    mapValue: <U>(callback: (v: T) => fabric.MaybeComputed<U>) => <fabric.Computed<U>>callback(value)
});

// Creates a simple object that can be used safely as a dictionary (i.e. no worries about it having
// pre-existing members with certain names, like you would get with a normal javascript object.)
function createDictionaryObject(): any {
    const map = Object.create(/*prototype*/ null); // tslint:disable-line:no-null-keyword

    // Using 'delete' on an object causes V8 to put the object in dictionary mode.
    // This disables creation of hidden classes, which are expensive when an object is
    // constantly changing shape.
    map["__"] = undefined;
    delete map["__"];

    return map;
}

const globalDatabase = createDictionaryObject();

export class Table implements types.Table {
    public tableName: fabric.Computed<string>;

    public get: (query: Object) => Promise<any>;
    public insert: (item: Object) => Promise<void>;
    public scan: () => Promise<any[]>;
    public delete: (query: Object) => Promise<void>;
    public update: (query: Object, updates: Object) => Promise<void>;

    constructor(name: string,
                public readonly primaryKey: string = "id",
                public readonly primaryKeyType: string = "string") {
        this.tableName = makeComputed(name);

        const localDatabase = globalDatabase[name] || (globalDatabase[name] = createDictionaryObject());
        this.get = (query: any) => {
            var pk = query[primaryKey];
            if (pk === undefined) {
                return Promise.reject(new Error("PrimaryKey not provided"));
            }

            var result = localDatabase[pk];
            return result ? Promise.resolve(result) : Promise.reject(new Error("Key not found"));
        };

        this.insert = (query: any) => {
            var pk = query[primaryKey];
            if (pk === undefined) {
                return Promise.reject(new Error("PrimaryKey not provided"));
            }

            localDatabase[pk] = query;
            return Promise.resolve();
        }

        this.delete = (query: any) => {
            var pk = query[primaryKey];
            if (pk === undefined) {
                return Promise.reject(new Error("PrimaryKey not provided"));
            }

            var existingValue = localDatabase[pk];
            if (existingValue === undefined) {
                return Promise.reject(new Error("Item not found"));
            }

            delete localDatabase[pk];
            return Promise.resolve();
        };

        this.update = (query: any, updates: any) => {
            var pk = query[primaryKey];
            if (pk === undefined) {
                return Promise.reject(new Error("PrimaryKey not provided"));
            }

            var existingValue = localDatabase[pk];
            if (existingValue === undefined) {
                updates[primaryKey] = pk;
                return this.insert(updates);
            }

            for (let key of Object.keys(updates)) {
                existingValue[key] = updates[key];
            }

            return Promise.resolve();
        };

        this.scan = () =>  {
            var result = [];
            for (let key of Object.keys(localDatabase)) {
                result.push(localDatabase[key]);
            }

            return Promise.resolve(result);
        }
    }
}

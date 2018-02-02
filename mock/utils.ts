// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import { Dependency } from "pulumi";

export function ensureUnique(values: { [name: string]: string }, name: string, typeName: string) {
    if (values[name]) {
        throw new Error(`${typeName} with this name has already been created.`);
    }

    values[name] = "-";
}

export async function serialize<T>(dep: Dependency<T>): Promise<Dependency<T>>;
export async function serialize(prop: any): Promise<any>;
export async function serialize(prop: any): Promise<any> {
    if (prop === undefined) {
        return undefined;
    }
    else if (prop === null ||
             typeof prop === "boolean" ||
             typeof prop === "number" ||
             typeof prop === "string") {
        return prop;
    }
    else if (prop instanceof Array) {
        const elems: any[] = [];
        for (const v of prop) {
            elems.push(await serialize(v));
        }
        return elems;
    }
    else if (prop instanceof Promise) {
        return await prop;
    }
    else if (prop instanceof Dependency) {
        const val = await serialize((<any>prop).promise());
        return { get: () => val };
    } else {
        const obj: any = {};
        for (const k of Object.keys(prop)) {
            obj[k] = await serialize(prop[k]);
        }

        return obj;
    }
}

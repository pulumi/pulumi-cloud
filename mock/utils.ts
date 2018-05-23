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

import * as pulumi from "@pulumi/pulumi";

export function ensureUnique(values: { [name: string]: string }, name: string, typeName: string) {
    if (values[name]) {
        throw new Error(`${typeName} with this name has already been created.`);
    }

    values[name] = "-";
}

export async function serialize<T>(dep: pulumi.Output<T>): Promise<pulumi.Output<T>>;
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
    else if (prop instanceof pulumi.Output) {
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

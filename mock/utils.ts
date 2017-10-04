// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

export function ensureUnique(values: { [name: string]: string }, name: string, typeName: string) {
    if (values[name]) {
        throw new Error(`${typeName} with this name has already been created.`);
    }

    values[name] = "-";
}

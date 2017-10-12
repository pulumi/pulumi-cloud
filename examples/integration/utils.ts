// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.
/* tslint:enable pulumi */

const wcstring = require("wcstring");

export function toShortString(obj: string): string {
    const maxLength = process.stdout.columns || 120;

    let result: string = obj ? obj.toString() : "";
    result = result.replace(/[\n\r]/g, " ");
    const str = wcstring(result);

    return str.truncate(maxLength, "...");
}

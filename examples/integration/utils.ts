// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

export function toShortString(obj: any): string {
    const maxLength = 120;
    const ellipses = "...";

    let result: string = obj ? obj.toString() : "";
    result = result.replace(/[\n\r]/g, " ");
    return result.length > maxLength
        ? result.substr(0, maxLength - ellipses.length) + ellipses
        : result;
}

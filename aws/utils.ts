// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";
import * as crypto from "crypto";

// sha1hash returns a partial SHA1 hash of the input string.
export function sha1hash(s: string): string {
    const shasum: crypto.Hash = crypto.createHash("sha1");
    shasum.update(s);
    // TODO[pulumi/pulumi#377] Workaround for issue with long names not generating per-deplioyment randomness, leading
    //     to collisions.  For now, limit the size of hashes to ensure we generate shorter/ resource names.
    return shasum.digest("hex").substring(0, 8);
}

export function apply<T, U>(val: Record<string, T>, func: (t: T) => U): Record<string, U> {
    const result: Record<string, U> = {};
    for (const k of Object.keys(val)) {
        result[k] = func(val[k]);
    }

    return result;
}

// TODO: Replace this with `pulumi.output(Resource)` being able to create an Output with a dependency on the argument
// Resource.
export function liftResource<T extends pulumi.Resource>(resource: T): pulumi.Output<T> {
    return resource.urn.apply(_ => resource);
}

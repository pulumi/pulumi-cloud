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

export function combineDependencies<T extends pulumi.Resource>(
    source: T,
    ...resources: pulumi.Resource[]): pulumi.Output<T> {
    const outputs: pulumi.Output<pulumi.Resource>[] = [];
    outputs.push(liftResource(source));
    for (const res of resources) {
        outputs.push(liftResource(res));
    }

    return pulumi.all([source, ...resources]).apply(_ => source);
}

export function combineOutput<T>(source: pulumi.Output<T>, ...dependencies: pulumi.Resource[]): pulumi.Output<T> {
    const [first, ...rest] = dependencies;
    const deps = combineDependencies(first, ...rest);
    return pulumi.all([source, deps]).apply(([s, _]) => source);
}

export function composeOutput<T, U>(first: pulumi.Output<T>, second: pulumi.Output<U>): pulumi.Output<T> {
    return pulumi.all([first, second]).apply(([f, _]) => f);
}

export function liftResource<T extends pulumi.Resource>(resource: T): pulumi.Output<T> {
    return resource.urn.apply(_ => resource);
}

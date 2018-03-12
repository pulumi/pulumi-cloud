// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";

export class Bucket implements cloud.Bucket {

    public get: (key: string) =>Promise<Buffer | undefined>;
    public put: (key: string, contents: Buffer) => Promise<void>;

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        throw new Error("Bucket is not yet implemented in mock");
    }

    public onPut(name: string, handler: cloud.BucketPutHandler, filter?: cloud.BucketPutFilter): void {
        throw new Error("Bucket is not yet implemented in mock");
    }
}

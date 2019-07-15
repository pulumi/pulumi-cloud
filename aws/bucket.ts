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

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";

import { createCallbackFunction } from "./function";

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export class Bucket extends pulumi.ComponentResource implements cloud.Bucket {
    public readonly bucket: aws.s3.Bucket;

    public get: (key: string) => Promise<Buffer>;
    public put: (key: string, contents: Buffer) => Promise<void>;
    public delete: (key: string) => Promise<void>;

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        super("cloud:bucket:Bucket", name, {}, opts);

        // If `protect` is true, we will prevent the bucket from being destroyed
        //
        // TODO[pulumi/pulumi#782]: We shouldn't have to pass this explicitly to the child resource, it should be
        // implicit that a protected component protects all its children from being deleted.
        const preventDestroy = opts && opts.protect;

        this.bucket = new aws.s3.Bucket(name, {
            serverSideEncryptionConfiguration: {
                rule: {
                    applyServerSideEncryptionByDefault: {
                        sseAlgorithm: "AES256",
                    },
                },
            },
            // We rely on Pulumi's `protect` as a first class way to prevent deletion instead of the S3 bucket's
            // built-in `forceDestroy`. This means that by default, the bucket and all its contents can be deleted.
            forceDestroy: true,
        }, { parent: this, protect: preventDestroy });

        const bucketName = this.bucket.id;

        this.get = async (key: string) => {
            const s3 = new aws.sdk.S3();
            const res = await s3.getObject({
                Bucket: bucketName.get(),
                Key: key,
            }).promise();
            return <Buffer>res.Body;
        };

        this.put = async (key: string, contents: Buffer) => {
            const s3 = new aws.sdk.S3();
            const res = await s3.putObject({
                Bucket: bucketName.get(),
                Key: key,
                Body: contents,
            }).promise();
        };

        this.delete = async (key: string) => {
            const s3 = new aws.sdk.S3();
            const res = await s3.deleteObject({
                Bucket: bucketName.get(),
                Key: key,
            }).promise();
        };

        this.registerOutputs({ bucket: this.bucket });
    }

    public onPut(name: string, handler: cloud.BucketHandler, filter?: cloud.BucketFilter) {
        this.addHandler(name, handler, ["s3:ObjectCreated:*"], filter);
    }

    public onDelete(name: string, handler: cloud.BucketHandler, filter?: cloud.BucketFilter) {
        this.addHandler(name, handler, ["s3:ObjectRemoved:*"], filter);
    }

    public addHandler(name: string, handler: cloud.BucketHandler, events: string[], filter?: cloud.BucketFilter) {
        // Create the wrapper function that will convert from raw AWS S3 events to the form
        // cloud.BucketHandler expects.
        const eventHandler: aws.s3.BucketEventHandler = (ev, context, callback) => {
            const records = ev.Records || [];

            const promises: Promise<void>[] = [];
            for (const record of records) {
                // Construct an event arguments object and call the user handler.
                promises.push(handler({
                    key: record.s3.object.key,
                    size: record.s3.object.size,
                    eventTime: record.eventTime,
                }));
            }

            // Combine the results of all user handlers, and invoke the Lambda callback with results.
            Promise.all(promises).then(
                _ => callback(undefined, undefined),
                err => callback(err, undefined));
        };

        // Create the CallbackFunction in the cloud layer as opposed to just passing the javascript
        // callback down to pulumi-aws directly.  This ensures that the right configuration values
        // are used that will appropriately respect user settings around things like
        // codepaths/policies etc.
        const opts = { parent: this };
        const lambda = createCallbackFunction(
            name, eventHandler, /*isFactoryFunction:*/ false, opts);

        // Register for the raw s3 events from the bucket.
        filter = filter || {};
        this.bucket.onEvent(name, lambda, {
            events: events,
            filterPrefix: filter.keyPrefix,
            filterSuffix: filter.keySuffix,
        }, opts);
    }
}

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
import * as serverless from "@pulumi/aws-serverless";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";

export class Bucket extends pulumi.ComponentResource implements cloud.Bucket {
    public bucket: aws.s3.Bucket;

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

        async function s3Client() {
            const awssdk = await import("aws-sdk");
            return new awssdk.S3();
        }

        this.get = async (key: string) => {
            const s3 = await s3Client();
            const res = await s3.getObject({
                Bucket: bucketName.get(),
                Key: key,
            }).promise();
            return <Buffer>res.Body;
        };

        this.put = async (key: string, contents: Buffer) => {
            const s3 = await s3Client();
            const res = await s3.putObject({
                Bucket: bucketName.get(),
                Key: key,
                Body: contents,
            }).promise();
        };

        this.delete = async (key: string) => {
            const s3 = await s3Client();
            const res = await s3.deleteObject({
                Bucket: bucketName.get(),
                Key: key,
            }).promise();
        };

    }

    public onPut(name: string, handler: cloud.BucketHandler, filter?: cloud.BucketFilter) {
        const args = getSubscriptionArgs(filter);
        const handlerWrapper = createHandlerWrapper(handler);
        serverless.s3.bucket.onObjectCreated(name, this.bucket, handlerWrapper, args, { parent: this});
    }

    public onDelete(name: string, handler: cloud.BucketHandler, filter?: cloud.BucketFilter) {
        const args = getSubscriptionArgs(filter);
        const handlerWrapper = createHandlerWrapper(handler);
        serverless.s3.bucket.onObjectRemoved(name, this.bucket, handlerWrapper, args, { parent: this });
    }
}

function getSubscriptionArgs(filter?: cloud.BucketFilter): serverless.s3.bucket.CommonBucketSubscriptionArgs {
    const args: serverless.s3.bucket.CommonBucketSubscriptionArgs = { };
    args.filterPrefix = filter === undefined ? undefined : filter.keyPrefix;
    args.filterSuffix = filter === undefined ? undefined : filter.keySuffix;

    return args;
}

function createHandlerWrapper(handler: cloud.BucketHandler): serverless.s3.bucket.BucketEventHandler {
    return (event, context, callback) => {
        const records = event.Records || [];

        const promises: Promise<void>[] = [];
        for (const record of records) {
            // Construct an event arguments object.
            const handlerArgs: cloud.BucketHandlerArgs = {
                key: record.s3.object.key,
                size: record.s3.object.size,
                eventTime: record.eventTime,
            };
            // Call the user handler.
            promises.push(handler(handlerArgs));
        }

        Promise.all(promises)
            .then(() => callback(undefined, undefined))
            .catch(err => callback(err, undefined));
    };
}

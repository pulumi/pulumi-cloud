// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { Function } from "./function";

interface S3BucketNotificationEvent {
    "Records"?: S3BucketNotificationEvent[];
}

interface S3BucketNotificationEvent {
    "eventVersion": string;
    "eventSource": string;
    "awsRegion": string;
    "eventTime": string;
    "eventName": string;
    "userIdentity": {
        "principalId": string;
    };
    "requestParameters": {
        "sourceIPAddress": string;
    };
    "responseElements": {
        "x-amz-request-id": string;
        "x-amz-id-2": string;
    };
    "s3": {
        "s3SchemaVersion": string;
        "configurationId": string;
        "bucket": {
            "name": string;
            "ownerIdentity": {
                "principalId": string;
            },
            "arn": string;
        };
        "object": {
            "key": string;
            "size": number;
            "eTag": string;
            "versionId"?: string;
            "sequencer": string;
        };
    };
}

export class Bucket extends pulumi.ComponentResource implements cloud.Bucket {
    public bucket: aws.s3.Bucket;

    public get: (key: string) =>Promise<Buffer | undefined>;
    public put: (key: string, contents: Buffer) => Promise<void>;

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        super("cloud:bucket:Bucket", name, {}, opts);

        this.bucket = new aws.s3.Bucket(name, {
            serverSideEncryptionConfiguration: {
                rule: {
                    applyServerSideEncryptionByDefault: {
                        sseAlgorithm: "AES256",
                    },
                },
            },
        }, { parent: this });

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
    }

    public onPut(name: string, handler: cloud.BucketPutHandler, filter?: cloud.BucketPutFilter): void {

        const f = new Function(name, (
                event: S3BucketNotificationEvent,
                context: aws.serverless.Context,
                callback: (error: any, result: any) => void,
            ) => {

            // If there were no records, return immediately.
            if (!event.Records) {
                callback(undefined, undefined);
                return;
            }

            const promises: Promise<void>[] = [];
            for (const record of event.Records) {
                // Construct an event arguments object.
                const args: cloud.BucketPutHandlerArgs = {
                    key: record.s3.object.key,
                    size: record.s3.object.size,
                    eventTime: record.eventTime,
                    eTag: record.s3.object.eTag,
                };
                // Call the user handler.
                const promise = handler(args);
                promises.push(promise);
            }

            // Combine the results of all user handlers, and invoke the Lambda callback with results.
            Promise.all(promises)
            .then(() => {
                callback(undefined, undefined);
            }).catch(err => {
                callback(err, undefined);
            });
        }, { parent: this });

        const permission = new aws.lambda.Permission(name, {
            function: f.lambda,
            action: "lambda:InvokeFunction",
            principal: "s3.amazonaws.com",
            sourceArn: this.bucket.id.apply(bucketName => `arn:aws:s3:::${bucketName}`),
        }, { parent: this });

        const subscription = new aws.s3.BucketNotification(name, {
            bucket: this.bucket.id,
            lambdaFunctions: [{
                events: ["s3:ObjectCreated:*"],
                filterPrefix: filter && filter.keyPrefix,
                lambdaFunctionArn: f.lambda.arn,
            }],
        }, { parent: this, dependsOn: [ permission ] });
    }
}

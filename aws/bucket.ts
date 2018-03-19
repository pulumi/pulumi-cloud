// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { Function } from "./function";

// See https://docs.aws.amazon.com/AmazonS3/latest/dev/notification-content-structure.html.
interface S3BucketNotificationEvent {
    Records?: S3BucketNotificationEvent[];
}

interface S3BucketNotificationEvent {
    eventVersion: string;
    eventSource: string;
    awsRegion: string;
    eventTime: string;
    eventName: string;
    userIdentity: {
        principalId: string;
    };
    requestParameters: {
        sourceIPAddress: string;
    };
    responseElements: {
        "x-amz-request-id": string;
        "x-amz-id-2": string;
    };
    s3: {
        s3SchemaVersion: string;
        configurationId: string;
        bucket: {
            name: string;
            ownerIdentity: {
                principalId: string;
            },
            arn: string;
        };
        object: {
            key: string;
            size: number;
            eTag: string;
            versionId?: string;
            sequencer: string;
        };
    };
}

interface Subscription {
    events: string[];
    filterPrefix?: string;
    filterSuffix?: string;
    lambdaFunctionArn: pulumi.Output<string>;
    permission: aws.lambda.Permission;
}

export class Bucket extends pulumi.ComponentResource implements cloud.Bucket {
    private subscriptions: Subscription[];
    public bucket: aws.s3.Bucket;

    public get: (key: string) => Promise<Buffer>;
    public put: (key: string, contents: Buffer) => Promise<void>;
    public delete: (key: string) => Promise<void>;

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        super("cloud:bucket:Bucket", name, {}, opts);
        this.subscriptions = [];

        this.bucket = new aws.s3.Bucket(name, {
            serverSideEncryptionConfiguration: {
                rule: {
                    applyServerSideEncryptionByDefault: {
                        sseAlgorithm: "AES256",
                    },
                },
            },
        }, { parent: this });

        // Create the bucket notification resource if needed once before process exit.
        process.on("beforeExit", () => {
            if (this.subscriptions.length > 0 ) {
                const dependsOn = this.subscriptions.map(s => s.permission);
                const _ = new aws.s3.BucketNotification(name, {
                    bucket: this.bucket.id,
                    lambdaFunctions: this.subscriptions.map(subscription => ({
                        events: subscription.events,
                        filterPrefix: subscription.filterPrefix,
                        filterSuffix: subscription.filterSuffix,
                        lambdaFunctionArn: subscription.lambdaFunctionArn,
                    })),
                }, { parent: this, dependsOn: dependsOn });
                // Since we are generating more work on the event loop, we will casue `beforeExit` to be invoked again.
                // Make sure to clear out eh pending subscrpitions array so that we don't try to apply them again.
                this.subscriptions = [];
            }
        });

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
        this.addHandler(name, handler, ["s3:ObjectCreated:*"], filter);
    }

    public onDelete(name: string, handler: cloud.BucketHandler, filter?: cloud.BucketFilter) {
        this.addHandler(name, handler, ["s3:ObjectRemoved:*"], filter);
    }

    public addHandler(name: string, handler: cloud.BucketHandler, events: string[], filter?: cloud.BucketFilter) {

        // Create the Lambda function to handle the event.
        const f = new Function(name, eventHandler, { parent: this });

        // Give S3 permission to invoke the function.
        const permission = new aws.lambda.Permission(name, {
            function: f.lambda,
            action: "lambda:InvokeFunction",
            principal: "s3.amazonaws.com",
            sourceArn: this.bucket.id.apply(bucketName => `arn:aws:s3:::${bucketName}`),
        }, { parent: this });

        // We must create only a single BucketNotification per Bucket per AWS API limitations.  See
        // https://github.com/terraform-providers/terraform-provider-aws/issues/1715.  So we push the subscription
        // information here, and then actually create the BucketNotification if needed on process `beforeExit`.
        this.subscriptions.push({
            events: events,
            filterPrefix: filter && filter.keyPrefix,
            filterSuffix: filter && filter.keySuffix,
            lambdaFunctionArn: f.lambda.arn,
            permission: permission,
        });

        function eventHandler(
            event: S3BucketNotificationEvent,
            context: aws.serverless.Context,
            callback: (error: any, result: any) => void) {

            const records = event.Records || [];

            const promises: Promise<void>[] = [];
            for (const record of records) {
                // Construct an event arguments object.
                const args: cloud.BucketHandlerArgs = {
                    key: record.s3.object.key,
                    size: record.s3.object.size,
                    eventTime: record.eventTime,
                };
                // Call the user handler.
                const promise = handler(args);
                promises.push(promise);
            }

            // Combine the results of all user handlers, and invoke the Lambda callback with results.
            Promise.all(promises)
            .then(() => callback(undefined, undefined))
            .catch(err => callback(err, undefined));
        }

    }
}

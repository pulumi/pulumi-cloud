// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as pulumi from "pulumi";
import * as config from "./config";
import * as shared from "./shared";

// https://docs.aws.amazon.com/lambda/latest/dg/eventsources.html#eventsources-kinesis-streams
interface KinesisDataStreamsEvent {
    Records: {
        eventId: string;
        eventVersion: string;
        kinesis: {
            partitionKey: string;
            data: string;  // base64-encoded
            kinesisSchemaVersion: string;
            sequenceNumber: string;
        };
        invokeIdentityArn: string;
        eventName: string;
        eventSourceARN: string;
        eventSource: string;
        awsRegion: string;
    }[];
}

// https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/SubscriptionFilters.html#LambdaFunctionExample
interface CloudwatchLogsDestinationEvent {
    owner: string;
    logGroup: string;
    logStream: string;
    subscriptionFilters: string[];
    messageType: "DATA_MESSAGE" | "CONTROL_MESSAGE";
    logEvents: {
        id: string;
        timestamp: number;
        message: string;
    }[];
}

// TODO: use config
const sumoEndpoint = {
    hostname: "endpoint3.collection.us2.sumologic.com",
    path: "/receiver/v1/http/ZaVnC4dhaV1WSO8CA25pU3U2Zcx26SDK_vsRJWx1ullkOffeLWDF0evPJge0v982P-XQQ6E9F49GW2uN" +
          "QQWotp1JHU-UFp02fEp44OoYHWBo1aMRwDjMPw==",
};

class LogTarget extends pulumi.ComponentResource {
    public readonly destination: aws.cloudwatch.LogDestination;

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        super("cloud:logTarget:LogTarget", name, opts);

        const stream = new aws.kinesis.Stream(
            name,
            {
                shardCount: 1,
                retentionPeriod: 24,  // hours
            },
            { parent: this },
        );

        const assumeRolePolicyDocument = JSON.stringify(<aws.iam.PolicyDocument>{
            Version: "2012-10-17",
            Statement: [{
                Effect: "Allow",
                Action: "sts:AssumeRole",
                Principal: { Service: `logs.${aws.config.requireRegion()}.amazonaws.com` },
            }],
        });

        const cloudwatchLogsPermissionsDocument = (async () => {
            return JSON.stringify(<aws.iam.PolicyDocument>{
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Action: "kinesis:PutRecord",
                    Resource: await stream.arn,
                }],
            });
        })();

        const cloudwatchLogsRole = new aws.iam.Role(
            name,
            { assumeRolePolicy: assumeRolePolicyDocument },
            { parent: this },
        );

        const cloudwatchLogsRolePolicy = new aws.iam.RolePolicy(
            name,
            {
                role: cloudwatchLogsRole.id,
                policy: cloudwatchLogsPermissionsDocument,
            },
            { parent: this },
        );

        this.destination = new aws.cloudwatch.LogDestination(
            name,
            {
                roleArn: cloudwatchLogsRole.arn,
                targetArn: stream.arn,
            },
            { parent: this},
        );

        const destinationPolicyDocument = (async () => {
            const accountId = (await aws.getCallerIdentity()).accountId;

            return JSON.stringify(<aws.iam.PolicyDocument>{
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Action: "logs:PutSubscriptionFilter",
                    Resource: await this.destination.arn,
                    Principal: { AWS: "*" },  // Allow any account to write.
                }],
            });
        })();

        const destinationPolicy = new aws.cloudwatch.LogDestinationPolicy(
            name,
            {
                accessPolicy: destinationPolicyDocument,
                destinationName: this.destination.name,
            },
            { parent: this },
        );

        // https://github.com/SumoLogic/sumologic-aws-lambda/blob/master/kinesis/node.js/k2sl_lambda.js
        const forwarder = new aws.serverless.Function(
            name,
            { policies: [ aws.iam.AWSLambdaKinesisExecutionRole ] },
            async (event: KinesisDataStreamsEvent, context, callback) => {
                const https = await import("https");
                const zlib = await import("zlib");

                try {
                    for (const record of event.Records) {
                        const compressedPayload = new Buffer(record.kinesis.data, "base64");
                        const payloadBytes = zlib.gunzipSync(compressedPayload);
                        const payloadString = payloadBytes.toString("utf8");
                        const payload: CloudwatchLogsDestinationEvent = JSON.parse(payloadString);

                        if (payload.messageType !== "DATA_MESSAGE") {
                            continue;
                        }

                        const request = https.request({
                            ...sumoEndpoint,
                            method: "POST",
                            headers: {
                                "X-Sumo-Name": payload.logStream,
                                "X-Sumo-Host": payload.logGroup,
                                "X-Sumo-Category": "KinesisEvents",
                            },
                        }, response => {
                            if (response.statusCode !== 200) {
                                console.log(`failed POST: ${response.statusCode} ${response.statusMessage}`);
                            }
                        });

                        request.on("error", err => {
                            console.log(`failed POST: ${err.message}`);
                        });

                        for (const logEvent of payload.logEvents) {
                            request.write(logEvent.message + "\n");
                            // TODO: use logEvent.timestamp?
                        }

                        request.end();
                    }

                    callback(null, null);
                } catch (err) {
                    // TODO: Perhaps skip individual records/events instead of failing the whole batch.
                    callback(err, null);
                }
            },
            { parent: this },
        );

        const mapping = new aws.lambda.EventSourceMapping(
            name,
            {
                eventSourceArn: stream.arn,
                functionName: forwarder.lambda.arn,
                startingPosition: "LATEST",
            },
            { parent: this },
        );

        // No aws.lambda.Permission to create because Lambda is polling Kinesis and calling the function itself.
    }
}

// TODO: the log destination can be in a different account but must be in the same region.
// However, the destination should be able to point to a Kinesis stream in a different region:
//   "The log group and the destination must be in the same AWS region. However, the AWS resource
//   that the destination points to can be located in a different region.
// https://docs.aws.amazon.com/AmazonCloudWatch/latest/logs/CrossAccountSubscriptions.html
// Ultimately we should be able to create a log destination in each region in one account,
// all pointing to one Kinesis stream in one region in that account, with each log destination
// accepting logs from resources in all accounts in its region.

let logTarget: LogTarget | undefined;
export function getLogDestinationArn(): Promise<string> {
    if (config.logDestinationArn) {
        return Promise.resolve(config.logDestinationArn);
    }

    if (!logTarget) {
        logTarget = new LogTarget(
            shared.createNameWithStackInfo("logtarget"),
            { parent: shared.getGlobalInfrastructureResource() },
        );
    }

    return <Promise<string>>logTarget.destination.arn;
}

// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import { Function } from "./function";

interface SNSEvent {
    Records: SNSRecord[];
}

interface SNSRecord {
    EventVersion: string;
    EventSubscriptionArn: string;
    EventSource: string;
    Sns: SNSItem;
}

export interface SNSItem {
    SignatureVersion: string;
    Timestamp: string;
    Signature: string;
    SigningCertUrl: string;
    MessageId: string;
    Message: string;
    MessageAttributes: { [key: string]: SNSMessageAttribute };
    Type: string;
    UnsubscribeUrl: string;
    TopicArn: string;
    Subject: string;
}

export interface SNSMessageAttribute {
    Type: string;
    Value: string;
}

// createSubscription creates a subscription on an SNS topic, passing the full SNSItem to the handler.
export function createSubscription(
    resName: string, topic: aws.sns.Topic, handler: (item: SNSItem) => Promise<void>): aws.sns.TopicSubscription {

    let subscription: aws.sns.TopicSubscription;
    const func = new Function(
        resName,
        (ev: SNSEvent, ctx: aws.serverless.Context, cb: (error: any, result: any) => void) => {
            Promise.all(ev.Records.map(async (record: SNSRecord) => {
                await handler(record.Sns);
            }))
            .then(() => { cb(null, null); })
            .catch((err: any) => { cb(err, null); });
        },
    );
    const invokePermission = new aws.lambda.Permission(resName, {
        action: "lambda:invokeFunction",
        function: func.lambda,
        principal: "sns.amazonaws.com",
        sourceArn: topic.id,
    });
    subscription = new aws.sns.TopicSubscription(resName, {
        topic: topic,
        protocol: "lambda",
        endpoint: func.lambda.arn,
    });

    return subscription;
}

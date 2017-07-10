// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@lumi/aws";
import { LoggedFunction as Function } from "./function";

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

// createSubscription creates a subscription on an SNS topic, passing the full
// SNSItem to the handler.
export function createSubscription(
    resName: string,
    topic: aws.sns.Topic,
    handler: (item: SNSItem) => Promise<void>): aws.sns.Subscription {
    let policies: aws.ARN[] = [aws.iam.AWSLambdaFullAccess];
    let lambda = new Function(resName, policies, (ev: SNSEvent, ctx, cb) => {
        (<any>Promise).all((<any>ev.Records).map(async (record: SNSRecord) => {
            await handler(record.Sns);
        }))
        .then(() => { cb(null, null); })
        .catch((err: any) => { cb(err, null); });
    });
    let invokePermission = new aws.lambda.Permission(resName, {
        action: "lambda:invokeFunction",
        function: lambda.lambda,
        principal: "sns.amazonaws.com",
        sourceARN: topic.id,
    });
    let subscription = new aws.sns.Subscription(resName, {
        topic: topic,
        protocol: "lambda",
        endpoint: lambda.lambda.arn,
    });
    return subscription;
}

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
    Sns: {
        SignatureVersion: string;
        Timestamp: string;
        Signature: string;
        SigningCertUrl: string;
        MessageId: string;
        Message: string;
        MessageAttributes: { [key: string]: SNSMessageAttribute }
        Type: string;
        UnsubscribeUrl: string;
        TopicArn: string;
        Subject: string;
    };
}

interface SNSMessageAttribute {
    Type: string;
    Value: string;
}

export class Topic<T> {
    private name: string;
    private topic: aws.sns.Topic;
    private subscriptions: aws.sns.Subscription[];

    constructor(name: string) {
        this.name = name;
        this.topic = new aws.sns.Topic(name, {});
        this.subscriptions = [];
    }

    subscribe(name: string, handler: (item: T) => Promise<void>) {
        let resName = this.name + "_" + name;
        let policies: aws.ARN[] = [aws.iam.AWSLambdaFullAccess]; // TODO: Least privelege
        let lambda = new Function(resName, policies, (ev: SNSEvent, ctx, cb) => {
            (<any>Promise).all((<any>ev.Records).map(async (record: SNSRecord) => {
                let item = (<any>JSON).parse(record.Sns.Message);
                await handler(item);
            }))
            .then(() => { cb(null, null); })
            .catch((err: any) => { cb(err, null); });
        });
        let invokePermission = new aws.lambda.Permission(resName, {
            action: "lambda:invokeFunction",
            function: lambda.lambda,
            principal: "sns.amazonaws.com",
            sourceARN: this.topic.id,
        });
        let subscription = new aws.sns.Subscription(resName, {
            topic: this.topic,
            protocol: "lambda",
            endpoint: lambda.lambda.arn,
        });
        (<any>this.subscriptions).push(subscription);
    }
}

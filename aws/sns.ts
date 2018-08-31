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
import { createFunction, Function } from "./function";

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
    const func = createFunction(
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

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
import * as sns from "./sns";

export class Topic<T> extends pulumi.ComponentResource implements cloud.Topic<T> {
    private readonly name: string;
    public readonly topic: aws.sns.Topic;
    public readonly subscriptions: aws.sns.TopicSubscription[];

    public readonly publish: (item: T) => Promise<void>;

    // Outside API (constructor and methods)

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        super("cloud:topic:Topic", name, {}, opts);

        this.name = name;
        this.topic = new aws.sns.Topic(name, {}, { parent: this });
        this.subscriptions = [];
        const topicId = this.topic.id;

        this.publish = async (item) => {
            const awssdk = await import("aws-sdk");
            const snsconn = new awssdk.SNS();
            const result = await snsconn.publish({
                Message: JSON.stringify(item),
                TopicArn: topicId.get(),
            }).promise();
        };
    }

    public subscribe(name: string, handler: (item: T) => Promise<void>) {
        const subscriptionName = this.name + "_" + name;
        const subscription = sns.createSubscription(subscriptionName, this.topic, async (snsItem: sns.SNSItem) => {
            const item = JSON.parse(snsItem.Message);
            await handler(item);
        });

        this.subscriptions.push(subscription);
    }
}

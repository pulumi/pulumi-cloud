// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import * as sns from "./sns";

export class Topic<T> extends pulumi.ComponentResource implements cloud.Topic<T> {
    private readonly name: string;
    public readonly topic: aws.sns.Topic;
    // public readonly subscriptions: aws.sns.TopicSubscription[];

    public readonly publish: (item: T) => Promise<void>;

    // Outside API (constructor and methods)

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        super("cloud:topic:Topic", name, {}, opts);

        this.name = name;
        this.topic = new aws.sns.Topic(name, {}, { parent: this });
        // this.subscriptions = [];
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

        // this.subscriptions.push(subscription);
    }
}

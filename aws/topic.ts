// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";
import * as sns from "./sns";

export class Topic<T> extends pulumi.ComponentResource implements cloud.Topic<T> {
    // Inside + Outside API

    private readonly name: string;
    private readonly topic: aws.sns.Topic;

    // Inside API

    public readonly publish: (item: T) => Promise<void>;

    // Outside API (constructor and methods)

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        super("cloud:topic:Topic", name, {}, opts);

        this.name = name;
        this.topic = new aws.sns.Topic(name, {}, { parent: this });

        this.publish = (item) => {
            const awssdk = require("aws-sdk");
            const snsconn = new awssdk.SNS();
            return snsconn.publish({
                Message: JSON.stringify(item),
                TopicArn: this.topic.id,
            }).promise();
        };
    }

    public subscribe(name: string, handler: (item: T) => Promise<void>) {
        sns.createSubscription(this.name + "_" + name, this.topic, async (snsItem: sns.SNSItem) => {
            const item = JSON.parse(snsItem.Message);
            await handler(item);
        });
    }
}

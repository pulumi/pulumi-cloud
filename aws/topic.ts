// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";
import * as sns from "./sns";

export class Topic<T> extends pulumi.Resource implements cloud.Topic<T> {
    // Inside + Outside API

    private name: string;
    private topic: aws.sns.Topic;

    // Inside API

    public publish: (item: T) => Promise<void>;

    // Outside API (constructor and methods)

    constructor(name: string) {
        super();

        this.name = name;
        this.topic = new aws.sns.Topic(name, {});
        this.adopt(this.topic);

        this.publish = (item) => {
            const awssdk = require("aws-sdk");
            const snsconn = new awssdk.SNS();
            return snsconn.publish({
                Message: JSON.stringify(item),
                TopicArn: this.topic.id,
            }).promise();
        };

        this.register("cloud:topic:Topic", name, false, {});
    }

    public subscribe(name: string, handler: (item: T) => Promise<void>) {
        sns.createSubscription(this.name + "_" + name, this.topic, async (snsItem: sns.SNSItem) => {
            const item = JSON.parse(snsItem.Message);
            await handler(item);
        });
    }
}

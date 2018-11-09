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

import { createCallbackFunction } from "./function";

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
            const snsconn = new aws.runtime.SNS();
            const result = await snsconn.publish({
                Message: JSON.stringify(item),
                TopicArn: topicId.get(),
            }).promise();
        };

        this.registerOutputs({
            topic: this.topic,
        });
    }

    public subscribe(name: string, handler: (item: T) => Promise<void>) {
        const subscriptionName = this.name + "_" + name;

        const eventHandler: aws.sns.TopicEventHandler = (ev, context, callback) => {
            Promise.all(ev.Records.map(async (record) => {
                await handler(JSON.parse(record.Sns.Message));
            })).then(() => callback(undefined, undefined), err => callback(err, undefined));
        };

        // Create the CallbackFunction in the cloud layer as opposed to just passing the javascript
        // callback down to pulumi-aws directly.  This ensures that the right configuration values
        // are used that will appropriately respect user settings around things like
        // codepaths/policies etc.
        const opts = { parent: this };
        const lambda = createCallbackFunction(
            subscriptionName, eventHandler, /*isFactoryFunction:*/ false, opts);

        this.topic.onEvent(subscriptionName, eventHandler, {}, opts);
    }
}

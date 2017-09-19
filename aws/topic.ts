// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as sns from "./sns";

/**
 * A Topic<T> is used to distribute work which will be run conurrently by any susbcribed
 * handlers.
 *
 * Producers can [[publish]] to the topic, and consumers can [[subscribe]] to be
 * notified when new items are published. All items published to the topics are delivered
 * to every subscriber.
 *s
 * Although most of the time each item will be received by each subscriber exactly once,
 * it is possible for an item to be delivered more than once. Subscribers should ensure
 * that receiving the same message multiple times does not create errors or inconsistencies.
 *
 * @param T The type of items published to the topic.
 */
export class Topic<T> implements Stream<T> {
    // Inside + Outside API

    private name: string;
    private topic: aws.sns.Topic;

    // Inside API

    /**
     * Publish an item to this Topic.
     *
     * @param item The item to publish.
     */
    public publish: (item: T) => Promise<void>;

    // Outside API (constructor and methods)

    constructor(name: string) {
        this.name = name;
        this.topic = new aws.sns.Topic(name, {});
        // TODO[pulumi/pulumi-fabric#331]: bring this back once deadlock issues are resolved.
        // this.subscriptions = [];
        this.publish = (item) => {
            let awssdk = require("aws-sdk");
            let snsconn = awssdk.SNS();
            return new snsconn.publish({
                Message: JSON.stringify(item),
                TopicArn: this.topic.id,
            }).promise();
        };
    }

    /**
     * Subscribe to items published to this topic.
     *
     * Each subscription receives all items published to the topic.
     *
     * @param name The name of the subscription.
     * @param handler A callback to handle each item published to the topic.
     */
    public subscribe(name: string, handler: (item: T) => Promise<void>) {
        sns.createSubscription(this.name + "_" + name, this.topic, async (snsItem: sns.SNSItem) => {
            let item = JSON.parse(snsItem.Message);
            await handler(item);
        });
    }
}


/**
 * A Stream<T> provides access to listen to an (infinite) stream of items coming from a
 * data source.  Unlike [[Topic]], a Stream provides only access to read from the stream,
 * not the ability to publish new items to the stream.
 *
 * @param T The type of items published to the stream.
 */
export interface Stream<T> {
    /**
     * Subscribe to items published to this stream.
     *
     * Each subscription receives all items published to the stream.
     *
     * @param name The name of the subscription.
     * @param handler A callback to handle each item published to the stream.
     */
    subscribe(name: string, handler: (item: T) => Promise<void>): void;
}

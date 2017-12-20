// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";

export interface TopicConstructor {
    /**
     * Allocate a new Topic with a given name.
     *
     * @param name The unique name of the Topic.
     * @param opts A bag of options that controls how this resource behaves.
     */
    new<T>(name: string, opts?: pulumi.ResourceOptions): Topic<T>;
}

export let Topic: TopicConstructor; // tslint:disable-line

/**
 * A Topic<T> is used to distribute work which will be run concurrently by any
 * susbcribed handlers.  Producers can [[publish]] to the topic, and consumers
 * can [[subscribe]] to be notified when new items are published.
 *
 * @param T The type of items published to the topic.
 */
export interface Topic<T> extends Stream<T> {
    /**
     * Publish an item to this Topic.
     *
     * @param item The item to publish.
     */
    publish: (item: T) => Promise<void>;

    /**
     * Subscribe to items published to this topic.
     *
     * Each subscription receives all items published to the topic.
     *
     * @param name The name of the subscription.
     * @param handler A callback to handle each item published to the topic.
     */
    subscribe(name: string, handler: (item: T) => Promise<void>): void;
}

/**
 * A Stream<T> provides access to listen to an (infinite) stream of items coming
 * from a data source.  Unlike [[Topic]], a Stream provides only access to read
 * from the stream, not the ability to publish new items to the stream.
 *
 * @param T The type of items published to the stream.
 */
export interface Stream<T> {
    /**
     * Subscribe to items published to this stream.
     *
     * Each subscription receives all items published to the stream. If a
     * subscription handler returns a failed promise, the subscription handler
     * may be retried some number of times.  If no retry is successful, the item
     * will be sent to the global error handler.  Note that as a result,
     * subscription handlers must ensure they can safely be retried.
     *
     * @param name The name of the subscription.
     * @param handler A callback to handle each item published to the stream.
     */
    subscribe(name: string, handler: (item: T) => Promise<void>): void;
}

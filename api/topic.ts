// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

export interface TopicConstructor {
    new<T>(name: string): Topic<T>;
}

export let Topic: TopicConstructor;

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

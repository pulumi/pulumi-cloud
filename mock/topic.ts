// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";

const globalTopicToSubscribers: { [topic: string]: {(item: any): Promise<void>}[] } = Object.create(null);

export class Topic<T> implements cloud.Topic<T> {
    public publish: (item: T) => Promise<void>;
    public subscribe: (name: string, handler: (item: T) => Promise<void>) => void;

    constructor(name: string) {
        const subscribers = globalTopicToSubscribers[name] || (globalTopicToSubscribers[name] = []);

        this.publish = item => {
            // Make publishing seem asynchronous by actually doing the notification on the next
            // event loop.
            setTimeout(
                () => {
                    for (const subscriber of subscribers) {
                        subscriber(item);
                    }
                },
                1);
            return Promise.resolve();
        };

        this.subscribe = (unused, handler) => {
            subscribers.push(handler);
        };
    }
}

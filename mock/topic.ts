// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as utils from "./utils";

const usedNames: { [name: string]: string } = Object.create(null);

export class Topic<T> implements cloud.Topic<T> {
    public publish: (item: T) => Promise<void>;
    public subscribe: (name: string, handler: (item: T) => Promise<void>) => void;

    constructor(name: string) {
        utils.ensureUnique(usedNames, name, "Topic");

        const subscribers: { (item: T): Promise<void> }[] = [];
        this.publish = item => {
            // Make publishing seem asynchronous by actually doing the notification on the next
            // event loop.
            setTimeout(() => {
                for (const subscriber of subscribers) {
                    subscriber(item);
                }
            }, 1);

            return Promise.resolve();
        };

        const usedSubscriptionNames: { [name: string]: string } = Object.create(null);
        this.subscribe = (subscriptionName, handler) => {
            utils.ensureUnique(usedSubscriptionNames, subscriptionName, "Subscription");

            subscribers.push(handler);
        };
    }
}

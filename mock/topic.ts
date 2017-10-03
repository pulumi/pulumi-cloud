// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";

const globalTopicToSubscribers: { [topic: string]: {(item: any): Promise<void>}[] } = Object.create(null);

export class Topic<T> implements cloud.Topic<T> {
    public publish: (item: T) => Promise<void>;
    public subscribe: (name: string, handler: (item: T) => Promise<void>) => void;

    constructor(name: string) {
        const subscribers = globalTopicToSubscribers[name] || (globalTopicToSubscribers[name] = []);

        this.publish = item => {
            // For testing purposes we have to keep track that we've started an async operation.
            // This way the test can have a way of waiting until the actual notification to the
            // subscriber has been done before validating anything.
            // onAsynchronousOperationStarted();

            // Make publishing seem asynchronous by actually doing the notification on the next
            // event loop.
            setTimeout(
                () => {
                    for (const subscriber of subscribers) {
                        subscriber(item);
                    }

                    // onAsynchronousOperationFinished();
                },
                1);
            return Promise.resolve();
        };

        this.subscribe = (unused, handler) => {
            subscribers.push(handler);
        };
    }
}

// let outstandingAsynchronousOperationCount = 0;
// let outstandingAsynchronousOperationListeners: { (): void }[] = [];

// function onAsynchronousOperationStarted() {
//     console.log("Entering onAsynchronousOperationStarted");
//     if (outstandingAsynchronousOperationCount < 0) {
//         throw new Error("outstandingAsynchronousRequestsCount < 0");
//     }

//     outstandingAsynchronousOperationCount++;
//     console.log("outstandingAsynchronousOperationCount=" + outstandingAsynchronousOperationCount);
// }

// function onAsynchronousOperationFinished() {
//     console.log("Entering onAsynchronousOperationFinished");
//     outstandingAsynchronousOperationCount--;
//     console.log("outstandingAsynchronousOperationCount=" + outstandingAsynchronousOperationCount);
//     if (outstandingAsynchronousOperationCount < 0) {
//         throw new Error("outstandingAsynchronousRequests < 0");
//     }

//     if (outstandingAsynchronousOperationCount === 0) {
//         const listeners = outstandingAsynchronousOperationListeners;
//         outstandingAsynchronousOperationListeners = [];

//         for (const listener of listeners) {
//             listener();
//         }
//     }
// }

// export function awaitOutstandingAsynchronousRequests(): Promise<void> {
//     console.log("Entering awaitOutstandingAsynchronousRequests");
//     if (outstandingAsynchronousOperationCount === 0) {
//         console.log("No outstanding requests");
//         // no actual outstanding async requests.  Caller doesn't need to wait for anything.
//         return Promise.resolve();
//     }

//     console.log("Outstanding requests");
//     return new Promise((resolve, reject) => {
//         outstandingAsynchronousOperationListeners.push(resolve);
//     });
// }

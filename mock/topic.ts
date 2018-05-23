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

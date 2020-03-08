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

import * as azure from "@pulumi/azure";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import * as azuresb from "azure-sb";
import * as shared from "./shared";

export class Topic<T> extends pulumi.ComponentResource implements cloud.Topic<T> {
    public readonly namespace: azure.eventhub.Namespace;
    public readonly topic: azure.servicebus.Topic;
    public readonly subscriptions: azure.servicebus.TopicEventSubscription[] = [];

    public readonly publish: (item: T) => Promise<void>;

    // Outside API (constructor and methods)
    public readonly subscribe: (name: string, handler: (item: T) => Promise<void>) => void;

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        super("cloud:topic:Topic", name, {}, opts);

        const namespace = new azure.servicebus.Namespace(name, {
            location: shared.location,
            resourceGroupName: shared.globalResourceGroupName,
            // topics are only supported in standard and premium.
            sku: "standard",
        }, { parent: this });

        const topic = new azure.servicebus.Topic(name, {
            resourceGroupName: shared.globalResourceGroupName,
            namespaceName: namespace.name,
        }, { parent: this });

        this.namespace = namespace;
        this.topic = topic;

        this.subscribe = (name, handler) => {
            const subscription = this.topic.onEvent(
                name, {
                    ...shared.defaultSubscriptionArgs,
                    account: shared.getGlobalStorageAccount(),
                    callback: (context, event) => {
                        handler(JSON.parse(event) as T).then(() => context.done());
                    },
                }, { parent: this });

            this.subscriptions.push(subscription);
        };

        this.publish = async (val) => {
            const client = azuresb.createServiceBusService(namespace.defaultPrimaryConnectionString.get());
            await new Promise((resolve, reject) => {
                client.sendTopicMessage(topic.name.get(), JSON.stringify(val), (err, res) => {
                    if (err) {
                        return reject(err);
                    }

                    return resolve(res);
                });
            });
        };

        this.registerOutputs({
            namespace, topic,
        });
    }
}

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
import * as serverless from "@pulumi/azure-serverless";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import * as azuresb from "azure-sb";
import * as callback from "./callback";
import * as shared from "./shared";

export type StreamHandler<T> = callback.AzureCallback<(item: T) => Promise<void>>;

export class Topic<T> extends pulumi.ComponentResource implements cloud.Topic<T> {
    public readonly namespace: azure.eventhub.Namespace;
    public readonly topic: azure.eventhub.Topic;
    public readonly subscriptions: serverless.eventhub.TopicEventSubscription[] = [];

    public readonly publish: (item: T) => Promise<void>;

    // Outside API (constructor and methods)
    public readonly subscribe: (name: string, handler: StreamHandler<T>) => void;

    constructor(name: string, opts?: pulumi.ResourceOptions) {
        super("cloud:topic:Topic", name, {}, opts);

        const namespace = new azure.eventhub.Namespace(name, {
            location: shared.location,
            resourceGroupName: shared.globalResourceGroupName,
            // topics are only supported in standard and premium.
            sku: "standard",
        }, { parent: this });

        const topic = new azure.eventhub.Topic(name, {
            resourceGroupName: shared.globalResourceGroupName,
            namespaceName: namespace.name,
        }, { parent: this });

        this.namespace = namespace;
        this.topic = topic;

        this.subscribe = (name, handler) => {
            const data = callback.getOrCreateAzureCallbackData(handler);
            const handlerFunc = data.function;

            // Wrap the cloud handler with an appropriate Azure FunctionApp entrypoint.
            function entryPoint(context: serverless.subscription.Context, val: T) {
                handlerFunc(val).then(() => context.done(), err => context.done(err));
            }

            const subscriptionArgs = callback.createCallbackEventSubscriptionArgs(entryPoint, data);

            const subscription = serverless.eventhub.onTopicEvent(
                name, namespace, topic, subscriptionArgs, { parent: this });

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

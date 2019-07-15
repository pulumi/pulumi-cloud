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

import * as pulumi from "@pulumi/pulumi";

/** @deprecated [@pulumi/cloud] has been deprecated.  Please migrate your code to [@pulumi/aws] or [@pulumi/azure] */
export interface TopicConstructor {
    /**
     * Allocate a new Topic with a given name.
     *
     * @param name The unique name of the Topic.
     * @param opts A bag of options that controls how this resource behaves.
     */
    new<T>(name: string, opts?: pulumi.ResourceOptions): Topic<T>;
}

/** @deprecated [@pulumi/cloud] has been deprecated.  Please migrate your code to [@pulumi/aws] or [@pulumi/azure] */
export let Topic: TopicConstructor; // tslint:disable-line

/** @deprecated [@pulumi/cloud] has been deprecated.  Please migrate your code to [@pulumi/aws] or [@pulumi/azure] */
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

/** @deprecated [@pulumi/cloud] has been deprecated.  Please migrate your code to [@pulumi/aws] or [@pulumi/azure] */
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

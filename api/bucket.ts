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

/**
 * BucketHandlerArgs are the arguments passed to an [onPut] or [onDelete] handler.
 */
export interface BucketHandlerArgs {
    /**
     * The key that was updated or deleted by the operation.
     */
    key: string;
    /**
     * The size, in bytes, of the blob that was [put].
     */
    size: number;
    /**
     * The time (in ISO-8601 format) when the [put] or [delete] was completed.
     */
    eventTime: string;
}

/**
 * BucketHandler is the callback that handles an [onPut] or [onDelete] event.
 */
export type BucketHandler = (args: BucketHandlerArgs) => Promise<void>;

/**
 * BucketFilter specifies filters to apply to an [onPut] or [onDelete] subscription.
 */
export interface BucketFilter {
    keyPrefix?: string;
    keySuffix?: string;
}

export interface BucketConstructor {
    /**
     * Creates a new Bucket.
     *
     * @param name A unique name for the bucket.
     * @param opts A bag of options that controls how this resource behaves.
     */
    new (name: string, opts?: pulumi.ResourceOptions): Bucket;
}

export let Bucket: BucketConstructor; // tslint:disable-line

/**
 * Bucket is a simple blob store.
 *
 * Gets are read-after-write consistent for puts of new blobs, and eventually consistent for overwriting puts.
 *
 * Blobs in a bucket are encrypted at rest by default.
 */
export interface Bucket {
    /**
     * Registers a handler to be notified when blobs are put into the bucket (created or updated).
     *
     * @param name A unique name for the subscription.
     * @param filter A filter to decide which put events should be reported.
     * @param handler A callback to handle the event.
     */
    onPut(name: string, handler: BucketHandler, filter?: BucketFilter): void;
    /**
     * Registers a handler to be notified when blobs are deleted from the bucket.
     *
     * @param name A unique name for the subscription.
     * @param filter A filter to decide which put events should be reported.
     * @param handler A callback to handle the event.
     */
    onDelete(name: string, handler: BucketHandler, filter?: BucketFilter): void;

    /**
     * Get a blob from the bucket.
     *
     * @param key The key of the blog to retrieve.
     * @returns A promise for the success or failure of the get.
     */
    get(key: string): Promise<Buffer>;
    /**
     * Insert a blob into the bucket.
     *
     * @param key The key to use for retreiving this blob later.
     * @returns A promise for the success or failure of the put.
     */
    put(key: string, contents: Buffer): Promise<void>;
    /**
     * Delete a blob from the bucket.
     *
     * @param key The key of the blob to delete.
     * @returns A promise for the success or failure of the delete.
     */
    delete(key: string): Promise<void>;
}

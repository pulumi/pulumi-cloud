// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";

/**
 * BucketPutHandlerArgs are the arguments passed to an [onPut] handler when an object is put in a bucket.
 */
export interface BucketPutHandlerArgs {
    /**
     * The key that was [put].
     */
    key: string;
    /**
     * The size, in bytes, of the blob that was [put].
     */
    size: number;
    /**
     * The ETag returned by the [put] operation.
     */
    eTag: string;
    /**
     * The time when the [put] was performed.
     */
    eventTime: string;
}

/**
 * BucketPutHandler is the callback that handles an [onPut] event.
 */
export type BucketPutHandler = (args: BucketPutHandlerArgs) => Promise<void>;

/**
 * BucketPutFilter specifies filters to apply to an [onPut] subscription.
 */
export interface BucketPutFilter {
    keyPrefix?: string;
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
 */
export interface Bucket {

    /**
     * Registers a handler to be notified when blobs are put into the bucket (created or updated).
     *
     * @param name A unique name for the subscription.
     * @param filter A filter to decide which put events should be reported.
     * @param handler A callback to handle the event.
     */
    onPut(name: string, handler: BucketPutHandler, filter?: BucketPutFilter): void;

    /**
     * Get a blob from the bucket.
     *
     * @param key The key to use for retreiving this blob later.
     * @returns A promise for the resulting bloc if found, or for undefined if not found,
     *   or a failed promise if the query could not be processed.
     */
    get(key: string): Promise<Buffer | undefined>;
    /**
     * Insert a blob into the bucket.
     *
     * @param key The key to use for retreiving this blob later.
     * @returns A promise for the success or failure of the put.
     */
    put(key: string, contents: Buffer): Promise<void>;
}

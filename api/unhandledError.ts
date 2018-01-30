// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

/**
 * The type for global unhandled error handlers
 */
export type ErrorHandler = (message: string, payload: any) => void;

/**
 * onError registers a global error handler which will be passed the payload
 * and error messages associated with any function which fails during program
 * execution.
 *
 * @param name The name of this gobal error handler.
 * @param handler The callback to invoke on unhandled errors.
 */
export let onError: (name: string, handler: ErrorHandler) => void;

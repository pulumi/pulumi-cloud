// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

export type ErrorHandler = (message: string, payload: any) => void;

export let onError: { (name: string, handler: ErrorHandler): void };

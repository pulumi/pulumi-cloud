// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

export type ErrorHandler = (message: string, payload: any) => void;

export function onError(name: string, handler: ErrorHandler): void {
    throw new Error("Not yet implemented.");
}

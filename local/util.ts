// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import { Computed, MaybeComputed } from "@pulumi/pulumi-fabric";

export const makeComputed = <T>(value: T): Computed<T> => ({
    mapValue: <U>(callback: (v: T) => MaybeComputed<U>) => <Computed<U>>callback(value),
});

// Creates a simple object that can be used safely as a dictionary (i.e. no worries about it having
// pre-existing members with certain names, like you would get with a normal javascript object.)
export function createDictionaryObject(): any {
    const map = Object.create(/*prototype*/ null); // tslint:disable-line:no-null-keyword

    // Using 'delete' on an object causes V8 to put the object in dictionary mode.
    // This disables creation of hidden classes, which are expensive when an object is
    // constantly changing shape.
    map["__"] = undefined;
    delete map["__"];

    return map;
}

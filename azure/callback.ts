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

import { Callback, CallbackFactory, Context, EventSubscription, EventSubscriptionArgs } from "@pulumi/azure-serverless/subscription";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import * as shared from "./shared";

/**
 * Azure-specific data to create an AWS lambda out of a callback function.  Can be passed to any
 * functions in pulumi/cloud-aws that can take a cloud.Callback<T> argument.  To create the same
 * default AwsCallbackData Pulumi creates when given a simple JavaScript function, use
 * [createCallbackData].
 */
export interface AzureCallbackData<T extends Function> extends cloud.CallbackData<T>, EventSubscriptionArgs<any, any> {
    /**
     * Not used.  Provide [function] instead.
     */
    func?: never;
    /**
     * Not used.  Provide [function] instead.
     */
    factoryFunc?: never;
}

/**
 * Type for parameters that will be converted into serverless function.  Either a simple JavaScript
 * function, or an object with information necessary to create an AWS Lambda can be used.
 */
export type AzureCallback<T extends Function> = T | AzureCallbackData<T>;

export function createCallbackData<T extends Function>(func: T): AzureCallbackData<T> {
    const data: AzureCallbackData<T> = {
        ...shared.defaultSubscriptionArgs,
        function: func,
    };

    return data;
}

// function createEventSubscriptionArgs<E extends Context, R>(data: AzureCallback<any>): EventSubscriptionArgs<E, R> {
//     const copy = {...data};
//     delete copy.function;
//     const args = <EventSubscriptionArgs<E, R>>copy;
//     return args;
// }

export function createCallbackEventSubscriptionArgs<E extends Context, R>(
        callback: Callback<E, R>, data: AzureCallback<any>): EventSubscriptionArgs<E, R> {
    const copy = {...data};
    delete copy.function;
    const args = <EventSubscriptionArgs<E, R>>copy;
    args.func = callback;
    return args;
}

export function createCallbackFactoryEventSubscriptionArgs<E extends Context, R>(
        callbackFactory: CallbackFactory<E, R>, data: AzureCallback<any>): EventSubscriptionArgs<E, R> {
    const copy = {...data};
    delete copy.function;
    const args = <EventSubscriptionArgs<E, R>>copy;
    args.factoryFunc = callbackFactory;
    return args;
}

/**
 * Creates an [aws.lambda.CallbackFunction] from the callback function and callback data provided.
 * The callback function becomes the entry-point for the AWS lambda.  The callback data is used to
 * provided specialized configuration of that lambda (for example, specifying the desired
 * [memorySize]).
 */
// export function createEventSubscription<E extends Context, R>(
//         name: string, callback: Callback<E, R>,
//         data: AzureCallbackData<any>, opts?: pulumi.ResourceOptions): EventSubscription<E, R> {

//     const args = createEventSubscriptionArgs(data);
//     args.func = callback;
//     return new EventSubscription<E, R>(.lambda.CallbackFunction(name, args, opts);
// }

// export function createCallbackFactoryFunction<E, R>(
//         name: string, callbackFactory: aws.lambda.CallbackFactory<E, R>,
//         data: AwsCallbackData<any>, opts?: pulumi.ResourceOptions): aws.lambda.CallbackFunction<E, R> {

//     const args = createCallbackFunctionArgs(data);
//     args.callbackFactory = callbackFactory;
//     return new aws.lambda.CallbackFunction(name, args, opts);
// }

export function getOrCreateAzureCallbackData<T extends Function>(callback: AzureCallback<T>): AzureCallbackData<T> {
    if (callback instanceof Function) {
        const data = createCallbackData(callback);
        return data;
    }

    // Already in AwsCallbackData form.
    return callback;
}

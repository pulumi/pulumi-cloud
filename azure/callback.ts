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
 * Azure-specific data to create an FunctionApp out of a callback function.  Can be passed to any
 * functions in pulumi/cloud-aws that can take a cloud.Callback<T> argument.  To create the same
 * default AzureCallbackData Pulumi creates when given a simple JavaScript function, use
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
 * function, or an object with information necessary to create an Azure FunctionApp can be used.
 */
export type AzureCallback<T extends Function> = T | AzureCallbackData<T>;

export function createCallbackData<T extends Function>(func: T): AzureCallbackData<T> {
    const data: AzureCallbackData<T> = {
        ...shared.defaultSubscriptionArgs,
        function: func,
    };

    return data;
}

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

export function getOrCreateAzureCallbackData<T extends Function>(callback: AzureCallback<T>): AzureCallbackData<T> {
    if (callback instanceof Function) {
        const data = createCallbackData(callback);
        return data;
    }

    // Already in AzureCallbackData form.
    return callback;
}

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

import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

import * as callback from "./callback";

/** @deprecated No longer needed. Use [aws.lambda.CallbackFunction] instead. */
export function createFunction(
        name: string, handler: aws.serverless.Handler, opts?: pulumi.ResourceOptions): Function {
    return new Function(name, handler, /*isFactoryFunction*/ false, opts);
}

/** @deprecated No longer needed. Use [aws.lambda.CallbackFunction] instead. */
export function createFactoryFunction(
        name: string, handler: aws.serverless.HandlerFactory, opts?: pulumi.ResourceOptions): Function {
    return new Function(name, handler, /*isFactoryFunction*/ true, opts);
}

/** @deprecated No longer needed. Use [aws.lambda.CallbackFunction] instead. */
export class Function extends pulumi.ComponentResource {
    public readonly handler: aws.serverless.Handler;
    public readonly lambda: aws.lambda.Function;

    constructor(name: string,
                handler: aws.serverless.Handler | aws.serverless.HandlerFactory,
                isFactoryFunction: boolean,
                opts?: pulumi.ResourceOptions) {
        super("cloud:function:Function", name, { handler: handler }, opts);

        const data = callback.createCallbackData(handler);
        this.lambda = isFactoryFunction
            ? callback.createCallbackFactoryFunction(name, <aws.serverless.HandlerFactory>handler, data, { parent: this })
            : callback.createCallbackFunction(name, <aws.serverless.Handler>handler, data, { parent: this });

        this.registerOutputs({
            lambda: this.lambda,
        });
    }
}

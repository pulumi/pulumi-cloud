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
import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { functionIncludePackages, functionIncludePaths, functionMemorySize } from "./config";
import { getComputeIAMRolePolicies, getOrCreateNetwork, runLambdaInVPC } from "./shared";

/**
 * AWS-specific data to create an AWS lambda out of a callback function.  Can be passed to any
 * functions in pulumi/cloud-aws that can take a cloud.Callback<T> argument.  To create the same
 * default AwsCallbackData Pulumi creates when given a simple JavaScript function, use
 * [createCallbackData].
 */
export interface AwsCallbackData<T extends Function> extends cloud.CallbackData<T>, aws.lambda.CallbackFunctionArgs<any, any> {
    /**
     * Not used.  Provide [function] instead.
     */
    callback?: never;
    /**
     * Not used.  Provide [function] instead.
     */
    callbackFactory?: never;
}

/**
 * Type for parameters that will be converted into serverless function.  Either a simple JavaScript
 * function, or an object with information necessary to create an AWS Lambda can be used.
 */
export type AwsCallback<T extends Function> = T | AwsCallbackData<T>;

export function createCallbackData<T extends Function>(func: T): AwsCallbackData<T> {
    const policies = [...getComputeIAMRolePolicies()];
    let vpcConfig: aws.serverless.FunctionOptions["vpcConfig"] | undefined;

    if (runLambdaInVPC) {
        const network = getOrCreateNetwork();
        // TODO[terraform-providers/terraform-provider-aws#1507]: Updates which cause existing Lambdas to need to
        //     add VPC access will currently fail due to an issue in the Terraform provider.
        policies.push(aws.iam.AWSLambdaVPCAccessExecutionRole);
        vpcConfig = {
            securityGroupIds: pulumi.all(network.securityGroupIds),
            subnetIds: pulumi.all(network.subnetIds),
        };
    }

    // First allocate a function.
    const args: AwsCallbackData<T> = {
        function: func,
        policies,
        vpcConfig,
        memorySize: functionMemorySize,
        codePathOptions: {
            extraIncludePaths: functionIncludePaths,
            extraIncludePackages: functionIncludePackages,
        },
    };

    return args;
}

function createCallbackFunctionArgs<E, R>(data: AwsCallbackData<any>): aws.lambda.CallbackFunctionArgs<E, R> {
    const copy = {...data};
    delete copy.function;
    const args = <aws.lambda.CallbackFunctionArgs<E, R>>copy;
    return args;
}

/**
 * Creates an [aws.lambda.CallbackFunction] from the callback function and callback data provided.
 * The callback function becomes the entry-point for the AWS lambda.  The callback data is used to
 * provided specialized configuration of that lambda (for example, specifying the desired
 * [memorySize]).
 */
export function createCallbackFunction<E, R>(
        name: string, callback: aws.lambda.Callback<E, R>,
        data: AwsCallbackData<any>, opts?: pulumi.ResourceOptions): aws.lambda.CallbackFunction<E, R> {

    const args = createCallbackFunctionArgs(data);
    args.callback = callback;
    return new aws.lambda.CallbackFunction(name, args, opts);
}

export function createCallbackFactoryFunction<E, R>(
        name: string, callbackFactory: aws.lambda.CallbackFactory<E, R>,
        data: AwsCallbackData<any>, opts?: pulumi.ResourceOptions): aws.lambda.CallbackFunction<E, R> {

    const args = createCallbackFunctionArgs(data);
    args.callbackFactory = callbackFactory;
    return new aws.lambda.CallbackFunction(name, args, opts);
}

export function getOrCreateAwsCallbackData<T extends Function>(callback: AwsCallback<T>): AwsCallbackData<T> {
    if (callback instanceof Function) {
        const data = createCallbackData(callback);
        return data;
    }

    // Already in AwsCallbackData form.
    return callback;
}

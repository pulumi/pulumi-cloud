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
import { functionIncludePackages, functionIncludePaths, functionMemorySize } from "./config";
import { getComputeIAMRolePolicies, getOrCreateNetwork, runLambdaInVPC } from "./shared";

export function createFunction(
        name: string, handler: aws.lambda.Callback<any,any>, opts?: pulumi.ResourceOptions): Function {
    return new Function(name, handler, /*isFactoryFunction*/ false, opts);
}

export function createFactoryFunction(
        name: string, handler: aws.lambda.CallbackFactory<any,any>, opts?: pulumi.ResourceOptions): Function {
    return new Function(name, handler, /*isFactoryFunction*/ true, opts);
}

export function createCallbackFunction(
        name: string,
        handler: aws.lambda.Callback<any,any> | aws.lambda.CallbackFactory<any,any>,
        isFactoryFunction: boolean,
        opts?: pulumi.ResourceOptions): aws.lambda.CallbackFunction<any, any> {

    const policies = [...getComputeIAMRolePolicies()];
    let vpcConfig: aws.lambda.CallbackFunctionArgs<any, any>["vpcConfig"];

    if (runLambdaInVPC) {
        const network = getOrCreateNetwork();
        // TODO[terraform-providers/terraform-provider-aws#1507]: Updates which cause existing Lambdas to need to
        //     add VPC access will currently fail due to an issue in the Terraform provider.
        policies.push(aws.iam.ManagedPolicies.AWSLambdaVPCAccessExecutionRole);
        vpcConfig = {
            securityGroupIds: pulumi.output(network).securityGroupIds,
            subnetIds: pulumi.output(network).subnetIds,
        };
    }

    // First allocate a function.
    const args: aws.lambda.CallbackFunctionArgs<any, any> = {
        policies,
        vpcConfig,
        memorySize: functionMemorySize,
        codePathOptions: {
            extraIncludePaths: functionIncludePaths,
            extraIncludePackages: functionIncludePackages,
        },
        callback: isFactoryFunction ? undefined : <aws.lambda.Callback<any,any>>handler,
        callbackFactory: isFactoryFunction ? <aws.lambda.CallbackFactory<any,any>>handler : undefined,
    };

    return new aws.lambda.CallbackFunction(name, args, opts);
}

// Function is a wrapper over aws.lambda.CallbackFunction which configures policies and VPC settings based on
// `@pulumi/cloud` configuration.
export class Function extends pulumi.ComponentResource {
    public readonly handler: aws.lambda.Callback<any,any> | aws.lambda.CallbackFactory<any,any>;
    public readonly lambda: aws.lambda.Function;

    constructor(name: string,
                handler: aws.lambda.Callback<any,any> | aws.lambda.CallbackFactory<any,any>,
                isFactoryFunction: boolean,
                opts?: pulumi.ResourceOptions) {
        super("cloud:function:Function", name, { }, opts);

        this.handler = handler;
        this.lambda = createCallbackFunction(name, handler, isFactoryFunction, { parent: this });

        this.registerOutputs({
            handler: this.handler,
            lambda: this.lambda,
        });
    }
}

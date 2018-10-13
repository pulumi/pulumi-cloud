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
        name: string, handler: aws.serverless.Handler, opts?: pulumi.ResourceOptions): Function {
    return new Function(name, handler, /*isFactoryFunction*/ false, opts);
}

export function createFactoryFunction(
        name: string, handler: aws.serverless.HandlerFactory, opts?: pulumi.ResourceOptions): Function {
    return new Function(name, handler, /*isFactoryFunction*/ true, opts);
}

export function createCallbackFunction(
        name: string,
        handler: aws.serverless.Handler | aws.serverless.HandlerFactory,
        isFactoryFunction: boolean,
        opts?: pulumi.ResourceOptions): aws.lambda.CallbackFunction<any, any> {

    const policies = [...getComputeIAMRolePolicies()];
    let vpcConfig: aws.serverless.FunctionOptions["vpcConfig"];

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
    const args: aws.lambda.CallbackFunctionArgs<any, any> = {
        policies,
        vpcConfig,
        memorySize: functionMemorySize,
        codePathOptions: {
            extraIncludePaths: functionIncludePaths,
            extraIncludePackages: functionIncludePackages,
        },
        callback: isFactoryFunction ? undefined : <aws.serverless.Handler>handler,
        callbackFactory: isFactoryFunction ? <aws.serverless.HandlerFactory>handler : undefined,
    };

    return new aws.lambda.CallbackFunction(name, args, opts);
}

// Function is a wrapper over aws.serverless.Function which configures policies and VPC settings based on
// `@pulumi/cloud` configuration.
export class Function extends pulumi.ComponentResource {
    public readonly handler: aws.serverless.Handler;
    public readonly lambda: aws.lambda.Function;

    constructor(name: string,
                handler: aws.serverless.Handler | aws.serverless.HandlerFactory,
                isFactoryFunction: boolean,
                opts?: pulumi.ResourceOptions) {
        super("cloud:function:Function", name, { handler: handler }, opts);

        this.lambda = createCallbackFunction(name, handler, isFactoryFunction, { parent: this });

        this.registerOutputs({
            lambda: this.lambda,
        });
    }
}

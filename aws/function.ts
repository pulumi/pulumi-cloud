// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as pulumi from "pulumi";
import { functionMemorySize } from "./config";
import { Network } from "./infrastructure/network";
import { getLogCollector } from "./logCollector";
import { computePolicies, getNetwork, runLambdaInVPC } from "./shared";
import { getUnhandledErrorTopic } from "./unhandledError";

export { Context, Handler } from "@pulumi/aws/serverless";

// Function is a wrapper over aws.serverless.Function which applies a single shared
// log collected across all functions in the application, allowing all application logs
// to be read from a single place.
export class Function extends pulumi.ComponentResource {
    public readonly handler: aws.serverless.Handler;
    public readonly lambda: aws.lambda.Function;

    constructor(name: string, handler: aws.serverless.Handler,
                parent?: pulumi.Resource, dependsOn?: pulumi.Resource[]) {
        super("cloud:function:Function", name, { handler: handler }, parent, dependsOn);

        // First allocate a function.
        const options: aws.serverless.FunctionOptions = {
            policies: [...computePolicies],
            deadLetterConfig: {
                targetArn: getUnhandledErrorTopic().arn,
            },
            memorySize: functionMemorySize,
        };
        if (runLambdaInVPC) {
            const network: Network | undefined = getNetwork();
            // TODO[terraform-providers/terraform-provider-aws#1507]: Updates which cause existing Lambdas to need to
            //     add VPC access will currently fail due to an issue in the Terraform provider.
            options.policies.push(aws.iam.AWSLambdaVPCAccessExecutionRole);
            options.vpcConfig = {
                securityGroupIds: network!.securityGroupIds,
                subnetIds: network!.subnetIds,
            };
        }
        this.lambda = new aws.serverless.Function(name, options, handler, this).lambda;

        // And then a log group and subscription filter for that lambda.
        const _ = new aws.cloudwatch.LogSubscriptionFilter(name, {
            logGroup: new aws.cloudwatch.LogGroup(name, {
                name: this.lambda.name.then((n: string | undefined) => n && ("/aws/lambda/" + n)),
                retentionInDays: 1,
            }),
            destinationArn: getLogCollector().arn,
            filterPattern: "",
        }, this);
    }
}

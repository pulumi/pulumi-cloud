// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as pulumi from "pulumi";
import { functionMemorySize } from "./config";
import { getLogCollector } from "./logCollector";
import { network, runLambdaInVPC } from "./network";
import { getUnhandledErrorTopic } from "./unhandledError";

export { Context, Handler } from "@pulumi/aws/serverless";

// Function is a wrapper over aws.serverless.Function which applies a single shared
// log collected across all functions in the application, allowing all application logs
// to be read from a single place.
export class Function extends pulumi.ComponentResource {
    public readonly handler: aws.serverless.Handler;
    public readonly lambda: aws.lambda.Function;

    constructor(name: string, handler: aws.serverless.Handler) {
        let lambda: aws.lambda.Function | undefined;
        super(
            "cloud:function:Function",
            name,
            {
                handler: handler,
            },
            () => {
                // First allocate a function.
                const options: aws.serverless.FunctionOptions = {
                    policies: [
                        aws.iam.AWSLambdaFullAccess,
                        aws.iam.AmazonEC2ContainerServiceFullAccess,
                    ],
                    deadLetterConfig: {
                        targetArn: getUnhandledErrorTopic().arn,
                    },
                    memorySize: functionMemorySize,
                };
                if (runLambdaInVPC) {
                    // TODO[terraform-providers/terraform-provider-aws#1507]:
                    // Updates which cause existing Lambdas to need to add VPC
                    // access will currently fail due to an issue in the
                    // Terraform provider.
                    options.policies.push(aws.iam.AWSLambdaVPCAccessExecutionRole);
                    options.vpcConfig = {
                        securityGroupIds: network!.securityGroupIds,
                        subnetIds: network!.subnetIds,
                    };
                }
                lambda = new aws.serverless.Function(name, options, handler).lambda;

                // And then a log group and subscription filter for that lambda.
                const _ = new aws.cloudwatch.LogSubscriptionFilter(name, {
                    logGroup: new aws.cloudwatch.LogGroup(`${name}-func-logs`, {
                        name: lambda.name.then((n: string | undefined) => n && ("/aws/lambda/" + n)),
                        retentionInDays: 1,
                    }),
                    destinationArn: getLogCollector().arn,
                    filterPattern: "",
                });
            },
        );
        this.lambda = lambda!;
    }
}


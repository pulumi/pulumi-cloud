// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as pulumi from "pulumi";
import { getLogCollector } from "./logCollector";
import { getUnhandledErrorTopic } from "./unhandledError";

export { Context, Handler } from "@pulumi/aws/serverless";

// LoggedFunction is a wrapper over aws.serverless.Function which applies a single shared
// log collected across all functions in the application, allowing all application logs
// to be read from a single place.
export class LoggedFunction extends pulumi.Resource {
    public readonly func: aws.serverless.Handler;
    public readonly lambda: aws.lambda.Function;
    public readonly role: aws.iam.Role;

    constructor(name: string, func: aws.serverless.Handler) {
        super();

        const policies = [
            aws.iam.AWSLambdaFullAccess,
            aws.iam.AmazonEC2ContainerServiceFullAccess,
        ];
        const options = {
            policies: policies,
            deadLetterConfig: {
                targetArn: getUnhandledErrorTopic().arn,
            },
        };

        const lambda = new aws.serverless.Function(name, options, func);
        this.adopt(lambda);

        this.lambda = lambda.lambda;
        this.role = lambda.role;

        const logGroup = new aws.cloudwatch.LogGroup(name, {
            name: this.lambda.name.then((n: string | undefined) => n && ("/aws/lambda/" + n)),
            retentionInDays: 1,
        });
        this.adopt(logGroup);
        const subscription = new aws.cloudwatch.LogSubscriptionFilter(name, {
            logGroup: logGroup,
            destinationArn: getLogCollector().arn,
            filterPattern: "",
        });
        this.adopt(subscription);

        this.register("cloud:function:LoggedFunction", name, false, {
            func: func,
        });
    }
}

// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import { getLogCollector } from "./logCollector";
import { getUnhandledErrorTopic } from "./unhandledError";

export { Context, Handler } from "@pulumi/aws/serverless";

// LoggedFunction is a wrapper over aws.serverless.Function which applies a single shared
// log collected across all functions in the application, allowing all application logs
// to be read from a single place.
export class LoggedFunction {
    public lambda: aws.lambda.Function;
    public role: aws.iam.Role;

    constructor(name: string, policies: aws.ARN[], func: aws.serverless.Handler) {
        let options = {
            policies: policies,
            deadLetterConfig: {
                targetArn: getUnhandledErrorTopic().arn,
            },
        };

        let lambda = new aws.serverless.Function(name, options, func);
        this.lambda = lambda.lambda;
        this.role = lambda.role;

        let loggroup = new aws.cloudwatch.LogGroup(name, {
            name: this.lambda.name.then((n: string | undefined) => n && ("/aws/lambda/" + n)),
            retentionInDays: 1,
        });
        let subscription = new aws.cloudwatch.LogSubscriptionFilter(name, {
            logGroup: loggroup,
            destinationArn: getLogCollector().arn,
            filterPattern: "",
        });
    }
}

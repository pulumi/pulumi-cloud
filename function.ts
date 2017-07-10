// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@lumi/aws";
import { getLogCollector } from "./logCollector";
import { getUnhandledErrorTopic } from "./unhandledError";

class Buffer {
    constructor(data: string, encoding: string) { return; }
    toString(kind: string): string { return ""; }
}

export { Context, Handler } from "@lumi/aws/serverless";

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
                target: getUnhandledErrorTopic(),
            },
        };
        let lambda = new aws.serverless.Function(name, options, func);
        this.lambda = lambda.lambda;
        this.role = lambda.role;
        let lambdaLogGroupName = "/aws/lambda/" + this.lambda.functionName;

        let loggroup = new aws.cloudwatch.LogGroup(name, {
            logGroupName: lambdaLogGroupName,
            retentionInDays: 1,
        });
        let subscription = new aws.cloudwatch.LogSubscriptionFilter(name, {
            logGroupName: loggroup.logGroupName!,
            destinationArn: getLogCollector().arn,
            filterPattern: "",
        });
    }
}

// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@lumi/aws";
import * as serverless from "@lumi/aws-serverless";
import { getLogCollector } from "./logCollector";
import { getUnhandledErrorTopic } from "./unhandledError";

class Buffer {
    constructor(data: string, encoding: string) { return; }
    toString(kind: string): string { return ""; }
}

export { Context, Handler } from "@lumi/aws-serverless";

// LoggedFunction is a wrapper over aws.serverless.Function which applies a single shared
// log collected across all functions in the application, allowing all application logs
// to be read from a single place.
export class LoggedFunction {
    public lambda: aws.lambda.Function;
    public role: aws.iam.Role;
    constructor(name: string, policies: aws.ARN[], func: serverless.Handler) {
        let options = {
            policies: policies,
            deadLetterConfig: {
                targetArn: getUnhandledErrorTopic().arn,
            },
        };
        let lambda = new serverless.Function(name, options, func);
        this.lambda = lambda.lambda;
        this.role = lambda.role;
        let lambdaLogGroupName = "/aws/lambda/" + this.lambda.functionName;

        let loggroup = new aws.cloudwatch.LogGroup(name, {
            logGroupName: lambdaLogGroupName,
            retentionInDays: 1,
        });
        let subscription = new aws.cloudwatch.LogSubscriptionFilter(name, {
            logGroup: loggroup,
            destinationArn: getLogCollector().arn,
            filterPattern: "",
        });
    }
}

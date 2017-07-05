// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

/*tslint:disable:no-require-imports*/
import * as aws from "@lumi/aws";
declare let require: any;
declare let JSON: any;
class Buffer {
    constructor(data: string, encoding: string) { return; }
    toString(kind: string): string { return ""; }
}

let logCollectorName = "pulumi-app-log-collector";
let region = aws.config.requireRegion();
let logCollector: aws.serverless.Function | undefined;

export { Context, Handler } from "@lumi/aws/serverless";

// LoggedFunction is a wrapper over aws.serverless.Function which applies a single shared
// log collected across all functions in the application, allowing all application logs
// to be read from a single place.
export class LoggedFunction {
    public lambda: aws.lambda.Function;
    public role: aws.iam.Role;
    constructor(name: string, policies: aws.ARN[], func: aws.serverless.Handler) {
        let lambda = new aws.serverless.Function(name, policies, func);
        this.lambda = lambda.lambda;
        this.role = lambda.role;
        let lambdaLogGroupName = "/aws/lambda/" + this.lambda.functionName;
        if (logCollector === undefined) {
            // Lazily construct the application logCollector lambda
            logCollector = new aws.serverless.Function(
                logCollectorName,
                [ aws.iam.AWSLambdaFullAccess ],
                (ev, ctx, cb) => {
                    let zlib = require("zlib");
                    let payload = new Buffer(ev.awslogs.data, "base64");
                    zlib.gunzip(payload, (err: any, result: Buffer) => {
                        if (err !== undefined && err !== null) {
                            cb(err, null);
                        } else {
                            result = JSON.parse(result.toString("ascii"));
                            console.log(`[${name}]: ${JSON.stringify(result)}`);
                            cb(null, {});
                        }
                    });
                },
            );
            let permission = new aws.lambda.Permission(logCollectorName, {
                action: "lambda:invokeFunction",
                function: logCollector.lambda,
                principal: "logs." + region + ".amazonaws.com",
            });
        }
        let loggroup = new aws.cloudwatch.LogGroup(name, {
            logGroupName: lambdaLogGroupName,
            retentionInDays: 1,
        });
        let subscription = new aws.cloudwatch.LogSubscriptionFilter(name, {
            logGroupName: loggroup.logGroupName!,
            destinationArn: logCollector!.lambda.arn,
            filterPattern: "",
        });
    }
}

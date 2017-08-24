// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

/*tslint:disable:no-require-imports*/
import * as aws from "@lumi/aws";
import * as serverless from "@lumi/aws/serverless";
declare let require: any;
class Buffer {
    constructor(data: string, encoding: string) { return; }
    toString(kind: string): string { return ""; }
}
declare let JSON: any;

let region = aws.config.requireRegion();

// logCollector is a shared and lazily created Function resource which
// is wired up as a listener on the cloud watch logs for all users functions
// created and managed by the Pulumi framework.

let logCollectorName = "pulumi-app-log-collector";
let logCollector: serverless.Function | undefined;
export function getLogCollector(): aws.lambda.Function {
    if (logCollector === undefined) {
        // Lazily construct the application logCollector lambda
        logCollector = new serverless.Function(
            logCollectorName,
            { policies: [ aws.iam.AWSLambdaFullAccess ] },
            (ev, ctx, cb) => {
                let zlib = require("zlib");
                let payload = new Buffer(ev.awslogs.data, "base64");
                zlib.gunzip(payload, (err: any, result: Buffer) => {
                    if (err !== undefined && err !== null) {
                        cb(err, null);
                    } else {
                        console.log(result.toString("utf8"));
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
    return logCollector.lambda;
}

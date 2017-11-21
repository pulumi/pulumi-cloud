// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as pulumi from "pulumi";
import { commonPrefix } from "./shared";

// For type-safety purposes, we want to be able to mark some of our types with typing information
// from other libraries.  However, we don't want to actually import those libraries, causing those
// module to load and run doing pulumi planning time.  so we just do an "import + require" and we
// note that this imported variable should only be used in 'type' (and not value) positions.  The ts
// compiler will then elide this actual declaration when compiling.
import _zlibTypesOnly = require("zlib");

const logCollectorName = `${commonPrefix}-log-collector`;

// LogCollector is a shared and lazily created Function resource which
// is wired up as a listener on the cloud watch logs for all users functions
// created and managed by the Pulumi framework.
class LogCollector extends pulumi.ComponentResource {
    public readonly lambda: aws.lambda.Function;
    constructor(name: string) {
        let lambda: aws.lambda.Function | undefined;
        super(
            "cloud:logCollector:LogCollector",
            name,
            {},
            () => {
                const collector = new aws.serverless.Function(
                    name,
                    { policies: [ aws.iam.AWSLambdaFullAccess ] },
                    (ev: any, ctx: aws.serverless.Context, cb: (error: any, result: any) => void) => {
                        const zlib: typeof _zlibTypesOnly = require("zlib");
                        const payload = new Buffer(ev.awslogs.data, "base64");
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
                lambda = collector.lambda;
                const region = aws.config.requireRegion();
                const permission = new aws.lambda.Permission(name, {
                    action: "lambda:invokeFunction",
                    function: lambda,
                    principal: "logs." + region + ".amazonaws.com",
                });
            },
        );
        this.lambda = lambda!;
    }
}

let logCollector: LogCollector | undefined;
export function getLogCollector(): aws.lambda.Function {
    if (logCollector === undefined) {
        // Lazily construct the application logCollector lambda; do it in a scope where we don't have a parent,
        // so the logCollector doesn't get falsely attributed to the caller.
        logCollector = pulumi.Resource.runInParentlessScope(() =>
            new LogCollector(logCollectorName),
        );
    }
    return logCollector.lambda;
}

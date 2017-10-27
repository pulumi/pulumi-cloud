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

const region = aws.config.requireRegion();

// logCollector is a shared and lazily created Function resource which
// is wired up as a listener on the cloud watch logs for all users functions
// created and managed by the Pulumi framework.

const logCollectorName = `${commonPrefix}-log-collector`;
let logCollector: aws.serverless.Function | undefined;

export function getLogCollector(): aws.lambda.Function {
    if (logCollector === undefined) {
        // Lazily construct the application logCollector lambda; do it in a scope where we don't have a parent,
        // so the logCollector doesn't get falsely attributed to the caller.
        logCollector = pulumi.Resource.runInParentlessScope(() =>
            new aws.serverless.Function(
                logCollectorName,
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
            ),
        );
        const permission = new aws.lambda.Permission(logCollectorName, {
            action: "lambda:invokeFunction",
            function: logCollector.lambda,
            principal: "logs." + region + ".amazonaws.com",
        });
    }
    return logCollector.lambda;
}

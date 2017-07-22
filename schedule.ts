// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@lumi/aws";
import {LoggedFunction as Function} from "./function";

export interface ScheduleOptions {
    // The rate at which to invoke the handler - e.g. "1 hour", "5 minutes", "7 days"
    rate?: string;
    // A condition for invoking the handler.  Format is:
    //     Minutes Hours Day-of-month Month Day-of-week Year
    // For example - to invoke every 10 mins Monday-Friday:
    //     0/10 * ? * MON-FRI *
    cron?: string;
}

// onSchedule registers a handler to be called on a regular schedule, defined
// by the provided schedule options.
export function onSchedule(name: string, options: ScheduleOptions, handler: () => Promise<void>) {
    let scheduleExpression = "";
    if (options.rate !== undefined) {
        let rate = options.rate;
        scheduleExpression = `rate(${rate})`;
    } else if (options.cron === undefined) {
        let cron = options.cron;
        scheduleExpression = `cron(${cron})`;
    } else {
        throw new Error("Expected exactly one of 'rate' and 'cron' properties on ScheduleOptions to be set.");
    }
    let f = new Function(name, [aws.iam.AWSLambdaFullAccess], (ev, ctx, cb) => {
        (<any>handler()).then(() => { cb(null, null); }).catch((err: any) => { cb(err, null); });
    });
    let rule = new aws.cloudwatch.EventRule(name, {
        scheduleExpression: scheduleExpression,
    });
    let target = new aws.cloudwatch.EventTarget(name, {
        rule: rule.eventRuleName!,
        arn: f.lambda.arn,
    });
    let permission = new aws.lambda.Permission(name, {
        action: "lambda:invokeFunction",
        function: f.lambda,
        principal: "events.amazonaws.com",
        sourceArn: rule.arn,
    });
}

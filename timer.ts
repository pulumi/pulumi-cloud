// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import { LoggedFunction } from "./function";

// IntervalRate describes how often to invoke an interval timer.
export interface IntervalRate {
    minutes?: number;
    hours?: number;
    days?: number;
}

export interface DailySchedule {
    hourUTC?: number;
    minuteUTC?: number;
}

// interval invokes handler at a regular rate defined by the interval options.
export function interval(name: string, options: IntervalRate, handler: () => Promise<void>) {
    let rateMinutes = 0;
    if (options.minutes) {
        rateMinutes += options.minutes;
    }
    if (options.hours) {
        rateMinutes += options.hours * 60;
    }
    if (options.days) {
        rateMinutes += options.days * 60 * 24;
    }
    let unit = "minutes";
    if (rateMinutes < 1) {
        throw new Error("Interval must be at least 1 minute");
    }
    if (rateMinutes === 1) {
        unit = "minute";
    }
    createScheduledEvent(name, `rate(${rateMinutes} ${unit})`, handler);
}

// cron invokes handler on a custom scheduled based on a Cron tab defintion.  See http://crontab.org/ for details.
export function cron(name: string, cronTab: string, handler: () => Promise<void>) {
    createScheduledEvent(name, `cron(${cronTab})`, handler);
}

// daily invokes handler every day at the specified UTC hour and minute
export function daily(name: string, schedule: DailySchedule, handler: () => Promise<void>) {
    let hour = schedule.hourUTC || 0;
    let minute = schedule.minuteUTC || 0;
    cron(name, `${minute} ${hour} * * ? *`, handler);
}

function createScheduledEvent(name: string, scheduleExpression: string, handler: () => Promise<void>) {
    let func = new LoggedFunction(
        name,
        [ aws.iam.AWSLambdaFullAccess ],
        (ev: any, ctx: aws.serverless.Context, cb: (error: any, result: any) => void) => {
            handler().then(() => {
                cb(null, null);
            }).catch((err: any) => {
                cb(err, null);
            });
        },
    );
    let rule = new aws.cloudwatch.EventRule(name, {
        scheduleExpression: scheduleExpression,
    });
    let target = new aws.cloudwatch.EventTarget(name, {
        rule: rule.name,
        arn: func.lambda.arn,
        targetId: name,
    });
    let permission = new aws.lambda.Permission(name, {
        action: "lambda:invokeFunction",
        function: func.lambda,
        principal: "events.amazonaws.com",
        sourceArn: rule.arn,
    });
}

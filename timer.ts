// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@lumi/aws";
import * as lumirt from "@lumi/lumirt";
import {LoggedFunction as Function} from "./function";

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
    if (options.minutes !== undefined) {
        rateMinutes += options.minutes;
    }
    if (options.hours !== undefined) {
        rateMinutes += options.hours * 60;
    }
    if (options.days !== undefined) {
        rateMinutes += options.days * 60 * 24;
    }
    let unit = "minutes";
    if (rateMinutes < 1) {
        throw new Error("Interval must be at least 1 minute");
    }
    if (rateMinutes === 1) {
        unit = "minute";
    }
    createScheduledEvent(name, `rate(${lumirt.toString(rateMinutes)} ${unit})`, handler);
}

// cron invokes handler on a custom scheduled based on a Cron tab defintion.  See http://crontab.org/ for details.
export function cron(name: string, cronTab: string, handler: () => Promise<void>) {
    createScheduledEvent(name, `cron(${cronTab})`, handler);
}

// daily invokes handler every day at the specified UTC hour and minute
export function daily(name: string, schedule: DailySchedule, handler: () => Promise<void>) {
    let hour = "0";
    if (schedule.hourUTC !== undefined) {
        hour = lumirt.toString(schedule.hourUTC);
    }
    let minute = "0";
    if (schedule.minuteUTC !== undefined) {
        minute = lumirt.toString(schedule.minuteUTC);
    }
    cron(name, `${minute} ${hour} * * ? *`, handler);
}

function createScheduledEvent(name: string, scheduleExpression: string, handler: () => Promise<void>) {
    let f = new Function(name, [aws.iam.AWSLambdaFullAccess], (ev, ctx, cb) => {
        (<any>handler()).then(() => { cb(null, null); }).catch((err: any) => { cb(err, null); });
    });
    let rule = new aws.cloudwatch.EventRule(name, {
        scheduleExpression: scheduleExpression,
    });
    let target = new aws.cloudwatch.EventTarget(name, {
        rule: rule.eventRuleName!,
        arn: f.lambda.arn,
        targetId: name,
    });
    let permission = new aws.lambda.Permission(name, {
        action: "lambda:invokeFunction",
        function: f.lambda,
        principal: "events.amazonaws.com",
        sourceArn: rule.arn,
    });
}

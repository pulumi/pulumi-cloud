// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import { timer } from "@pulumi/cloud";
import { LoggedFunction } from "./function";

export function interval(name: string, options: timer.IntervalRate, handler: timer.Action): void {
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

export function cron(name: string, cronTab: string, handler: timer.Action): void {
    createScheduledEvent(name, `cron(${cronTab})`, handler);
}

export function daily(name: string,
                      scheduleOrHandler: timer.DailySchedule | timer.Action, handler?: timer.Action): void {
    let hour: number;
    let minute: number;
    if (typeof scheduleOrHandler === "function") {
        handler = scheduleOrHandler as timer.Action;
        hour = 0;
        minute = 0;
    }
    else if (!handler) {
        throw new Error("Missing required timer handler function");
    }
    else {
        hour = scheduleOrHandler.hourUTC || 0;
        minute = scheduleOrHandler.minuteUTC || 0;
    }
    cron(name, `${minute} ${hour} * * ? *`, handler);
}

export function hourly(name: string,
                       scheduleOrHandler: timer.HourlySchedule | timer.Action, handler?: timer.Action): void {
    let minute: number;
    if (typeof scheduleOrHandler === "function") {
        handler = scheduleOrHandler as timer.Action;
        minute = 0;
    }
    else if (!handler) {
        throw new Error("Missing required timer handler function");
    }
    else {
        minute = scheduleOrHandler.minuteUTC || 0;
    }
    cron(name, `${minute} * * * ? *`, handler);
}

function createScheduledEvent(name: string, scheduleExpression: string, handler: timer.Action) {
    const func = new LoggedFunction(
        name,
        (ev: any, ctx: aws.serverless.Context, cb: (error: any, result: any) => void) => {
            handler().then(() => {
                cb(null, null);
            }).catch((err: any) => {
                cb(err, null);
            });
        },
    );
    const rule = new aws.cloudwatch.EventRule(name, {
        scheduleExpression: scheduleExpression,
    });
    const target = new aws.cloudwatch.EventTarget(name, {
        rule: rule.name,
        arn: func.lambda.arn,
        targetId: name,
    });
    const permission = new aws.lambda.Permission(name, {
        action: "lambda:invokeFunction",
        function: func.lambda,
        principal: "events.amazonaws.com",
        sourceArn: rule.arn,
    });
}

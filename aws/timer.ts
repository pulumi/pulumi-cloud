// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import { timer } from "@pulumi/cloud";
import * as pulumi from "pulumi";
import { Function } from "./function";

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

class Timer extends pulumi.Resource {
    private readonly name: string;
    private readonly scheduleExpression: string;
    private readonly handler: timer.Action;
    private readonly func: Function;
    private readonly rule: aws.cloudwatch.EventRule;
    private readonly target: aws.cloudwatch.EventTarget;
    private readonly permission: aws.lambda.Permission;

    constructor(name: string, scheduleExpression: string, handler: timer.Action) {
        super();

        this.func = new Function(
            name,
            (ev: any, ctx: aws.serverless.Context, cb: (error: any, result: any) => void) => {
                handler().then(() => {
                    cb(null, null);
                }).catch((err: any) => {
                    cb(err, null);
                });
            },
        );
        this.adopt(this.func);

        this.rule = new aws.cloudwatch.EventRule(name, {
            scheduleExpression: scheduleExpression,
        });
        this.adopt(this.rule);

        this.target = new aws.cloudwatch.EventTarget(name, {
            rule: this.rule.name,
            arn: this.func.lambda.arn,
            targetId: name,
        });
        this.adopt(this.target);

        this.permission = new aws.lambda.Permission(name, {
            action: "lambda:invokeFunction",
            function: this.func.lambda,
            principal: "events.amazonaws.com",
            sourceArn: this.rule.arn,
        });
        this.adopt(this.permission);

        this.register("cloud:timer:Timer", name, false, {
            scheduleExpression: scheduleExpression,
            handler: handler,
        });
    }
}

function createScheduledEvent(name: string, scheduleExpression: string, handler: timer.Action) {
    const _ = new Timer(name, scheduleExpression, handler);
}


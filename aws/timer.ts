// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import { timer } from "@pulumi/cloud";
import * as pulumi from "pulumi";
import { Function } from "./function";

export function interval(name: string, options: timer.IntervalRate, handler: timer.Action,
                         opts?: pulumi.ResourceOptions): void {
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

    createScheduledEvent(name, `rate(${rateMinutes} ${unit})`, handler, opts);
}

export function cron(name: string, cronTab: string, handler: timer.Action,
                     opts?: pulumi.ResourceOptions): void {
    createScheduledEvent(name, `cron(${cronTab})`, handler, opts);
}

export function daily(name: string,
                      scheduleOrHandler: timer.DailySchedule | timer.Action,
                      handlerOrOptions?: timer.Action | pulumi.ResourceOptions,
                      opts?: pulumi.ResourceOptions): void {
    let hour: number;
    let minute: number;
    let handler: timer.Action;
    if (typeof scheduleOrHandler === "function") {
        hour = 0;
        minute = 0;
        handler = scheduleOrHandler as timer.Action;
        opts = handlerOrOptions as pulumi.ResourceOptions | undefined;
    }
    else if (!scheduleOrHandler) {
        throw new Error("Missing required timer handler function");
    }
    else {
        hour = scheduleOrHandler.hourUTC || 0;
        minute = scheduleOrHandler.minuteUTC || 0;
        handler = handlerOrOptions as timer.Action;
    }
    cron(name, `${minute} ${hour} * * ? *`, handler, opts);
}

export function hourly(name: string,
                       scheduleOrHandler: timer.HourlySchedule | timer.Action,
                       handlerOrOptions?: timer.Action | pulumi.ResourceOptions,
                       opts?: pulumi.ResourceOptions): void {
    let minute: number;
    let handler: timer.Action;
    if (typeof scheduleOrHandler === "function") {
        minute = 0;
        handler = scheduleOrHandler as timer.Action;
        opts = handlerOrOptions as pulumi.ResourceOptions | undefined;
    }
    else if (!scheduleOrHandler) {
        throw new Error("Missing required timer handler function");
    }
    else {
        minute = scheduleOrHandler.minuteUTC || 0;
        handler = handlerOrOptions as timer.Action;
    }
    cron(name, `${minute} * * * ? *`, handler, opts);
}

class Timer extends pulumi.ComponentResource {
    public readonly scheduleExpression: string;
    public readonly rule: aws.cloudwatch.EventRule;
    public readonly target: aws.cloudwatch.EventTarget;
    public readonly function: Function;

    constructor(name: string, scheduleExpression: string, handler: timer.Action, opts?: pulumi.ResourceOptions) {
        super("cloud:timer:Timer", name, {
            scheduleExpression: scheduleExpression,
        }, opts);

        this.scheduleExpression = scheduleExpression;

        this.function = new Function(
            name,
            (ev: any, ctx: aws.serverless.Context, cb: (error: any, result: any) => void) => {
                handler().then(() => {
                    cb(null, null);
                }).catch((err: any) => {
                    cb(err, null);
                });
            },
            { parent: this },
        );

        this.rule = new aws.cloudwatch.EventRule(name, {
            scheduleExpression: scheduleExpression,
        }, { parent: this });
        this.target = new aws.cloudwatch.EventTarget(name, {
            rule: this.rule.name,
            arn: this.function.lambda.arn,
            targetId: name,
        }, { parent: this });
        const permission = new aws.lambda.Permission(name, {
            action: "lambda:invokeFunction",
            function: this.function.lambda,
            principal: "events.amazonaws.com",
            sourceArn: this.rule.arn,
        }, { parent: this });

        this.scheduleExpression = scheduleExpression;
    }
}

function createScheduledEvent(name: string, scheduleExpression: string, handler: timer.Action,
                              opts?: pulumi.ResourceOptions): void {
    const t = new Timer(name, scheduleExpression, handler, opts);
}

// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import { timer } from "@pulumi/cloud";
import * as pulumi from "pulumi";
import { Function } from "./function";

export function interval(name: string, options: timer.IntervalRate, handler: timer.Action,
                         parent?: pulumi.Resource, dependsOn?: pulumi.Resource[]): void {
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

    createScheduledEvent(name, `rate(${rateMinutes} ${unit})`, handler, parent, dependsOn);
}

export function cron(name: string, cronTab: string, handler: timer.Action,
                     parent?: pulumi.Resource, dependsOn?: pulumi.Resource[]): void {
    createScheduledEvent(name, `cron(${cronTab})`, handler, parent, dependsOn);
}

export function daily(name: string,
                      scheduleOrHandler: timer.DailySchedule | timer.Action,
                      handlerOrParent?: timer.Action | pulumi.Resource,
                      parentOrDependsOn?: pulumi.Resource | pulumi.Resource[],
                      dependsOn?: pulumi.Resource[]): void {
    let hour: number;
    let minute: number;
    let handler: timer.Action;
    let parent: pulumi.Resource | undefined;
    if (typeof scheduleOrHandler === "function") {
        hour = 0;
        minute = 0;
        handler = scheduleOrHandler as timer.Action;
        parent = handlerOrParent as pulumi.Resource | undefined;
        dependsOn = parentOrDependsOn as pulumi.Resource[] | undefined;
    }
    else if (!scheduleOrHandler) {
        throw new Error("Missing required timer handler function");
    }
    else {
        hour = scheduleOrHandler.hourUTC || 0;
        minute = scheduleOrHandler.minuteUTC || 0;
        handler = handlerOrParent as timer.Action;
        parent = parentOrDependsOn as pulumi.Resource | undefined;
    }
    cron(name, `${minute} ${hour} * * ? *`, handler, parent, dependsOn);
}

export function hourly(name: string,
                       scheduleOrHandler: timer.HourlySchedule | timer.Action,
                       handlerOrParent?: timer.Action | pulumi.Resource,
                       parentOrDependsOn?: pulumi.Resource | pulumi.Resource[],
                       dependsOn?: pulumi.Resource[]): void {
    let minute: number;
    let handler: timer.Action;
    let parent: pulumi.Resource | undefined;
    if (typeof scheduleOrHandler === "function") {
        minute = 0;
        handler = scheduleOrHandler as timer.Action;
        parent = handlerOrParent as pulumi.Resource | undefined;
        dependsOn = parentOrDependsOn as pulumi.Resource[] | undefined;
    }
    else if (!scheduleOrHandler) {
        throw new Error("Missing required timer handler function");
    }
    else {
        minute = scheduleOrHandler.minuteUTC || 0;
        handler = handlerOrParent as timer.Action;
        parent = parentOrDependsOn as pulumi.Resource | undefined;
    }
    cron(name, `${minute} * * * ? *`, handler, parent, dependsOn);
}

class Timer extends pulumi.ComponentResource {
    public readonly scheduleExpression: string;

    constructor(name: string, scheduleExpression: string, handler: timer.Action,
                parent?: pulumi.Resource, dependsOn?: pulumi.Resource[]) {
        super("cloud:timer:Timer", name, {
            scheduleExpression: scheduleExpression,
        }, parent, dependsOn);

        const func = new Function(
            name,
            (ev: any, ctx: aws.serverless.Context, cb: (error: any, result: any) => void) => {
                handler().then(() => {
                    cb(null, null);
                }).catch((err: any) => {
                    cb(err, null);
                });
            },
            this,
        );

        const rule = new aws.cloudwatch.EventRule(name, {
            scheduleExpression: scheduleExpression,
        }, this);
        const target = new aws.cloudwatch.EventTarget(name, {
            rule: rule.name,
            arn: func.lambda.arn,
            targetId: name,
        }, this);
        const permission = new aws.lambda.Permission(name, {
            action: "lambda:invokeFunction",
            function: func.lambda,
            principal: "events.amazonaws.com",
            sourceArn: rule.arn,
        }, this);

        this.scheduleExpression = scheduleExpression;
    }
}

function createScheduledEvent(name: string, scheduleExpression: string, handler: timer.Action,
                              parent?: pulumi.Resource, dependsOn?: pulumi.Resource[]): void {
    const t = new Timer(name, scheduleExpression, handler, parent, dependsOn);
}

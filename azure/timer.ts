// Copyright 2016-2018, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as azure from "@pulumi/azure";
import { timer } from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";
// import { Function } from "./function";

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
        throw new RunError("Interval must be at least 1 minute");
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
        throw new RunError("Missing required timer handler function");
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
        throw new RunError("Missing required timer handler function");
    }
    else {
        minute = scheduleOrHandler.minuteUTC || 0;
        handler = handlerOrOptions as timer.Action;
    }
    cron(name, `${minute} * * * ? *`, handler, opts);
}

class Timer extends pulumi.ComponentResource {
    constructor(name: string, scheduleExpression: string, handler: timer.Action, opts?: pulumi.ResourceOptions) {
        super("cloud:timer:Timer", name, {
            scheduleExpression: scheduleExpression,
        }, opts);

        throw new Error("Method not implemented");
    }
}

function createScheduledEvent(name: string, scheduleExpression: string, handler: timer.Action,
                              opts?: pulumi.ResourceOptions): void {
    const t = new Timer(name, scheduleExpression, handler, opts);
}

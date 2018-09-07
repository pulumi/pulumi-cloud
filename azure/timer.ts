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

import * as subscription from "@pulumi/azure-serverless/subscription";
import { timer } from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";
import * as shared from "./shared";

export function interval(name: string, options: timer.IntervalRate, handler: timer.Action,
                         opts?: pulumi.ResourceOptions): void {

    if (options.days !== undefined) {
        if (options.days !== 0) {
            // Yes.  This is strange.  But it is how Azure interprets things:
            // https://docs.microsoft.com/en-us/azure/azure-functions/functions-bindings-timer#timespan
            checkRange("options.days", options.days, 24, 100);
        }
    }

    if (options.minutes !== undefined) {
        checkRange("options.minutes", options.minutes, 0, 60);
    }

    if (options.hours !== undefined) {
        checkRange("options.hours", options.hours, 0, 24);
    }

    const timeSpan = options.days !== undefined
        ? `${pad(options.days)}:${pad(options.hours)}:${pad(options.minutes)}`
        : `${pad(options.hours)}:${pad(options.minutes)}:00`;

    createScheduledEvent(name, timeSpan, handler, opts);
}

function pad(val: number | undefined): string {
    if (val === undefined) {
        return "00";
    }

    if (val < 10) {
        return "0" + val;
    }

    return val.toString();
}

function checkIntegral(name: string, val: number) {
    if (!Number.isInteger(val)) {
        throw new Error(`[${name}] must be an integer.`);
    }
}

function checkRange(name: string, val: number, lowInclusive: number, highExclusive: number) {
    checkIntegral(name, val);

    if (val < lowInclusive || val >= highExclusive) {
        throw new Error(`[${name}] must be in the range [${lowInclusive}, ${highExclusive}).`);
    }
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

export function cron(name: string, cronTab: string, handler: timer.Action,
                     opts?: pulumi.ResourceOptions): void {
    createScheduledEvent(name, cronTab, handler, opts);
}

function createScheduledEvent(name: string, scheduleExpression: string, handler: timer.Action,
                              opts?: pulumi.ResourceOptions): void {
    const t = new Timer(name, scheduleExpression, handler, opts);
}

interface TimerBinder extends subscription.Binding {
    schedule: string;
    name: string;
    type: "timerTrigger";
    direction: "in";
}

class Timer extends pulumi.ComponentResource {
    public readonly subscription: subscription.EventSubscription<subscription.Context, any>;

    constructor(name: string, scheduleExpression: string, handler: timer.Action, opts?: pulumi.ResourceOptions) {
        super("cloud:timer:Timer", name, {
            scheduleExpression: scheduleExpression,
        }, opts);

        const binding: TimerBinder = {
            schedule: scheduleExpression,
            name: "timer",
            type: "timerTrigger",
            direction: "in",
        };

        this.subscription = new subscription.EventSubscription<subscription.Context, any>(
            "cloud:timer:EventSubscription", name, [binding], {
                ...shared.defaultSubscriptionArgs,
                resourceGroup: shared.globalResourceGroup,
                func: (context, data) => {
                    handler().then(() => context.done());
                },
            }, { parent: this });
    }
}

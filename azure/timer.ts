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
import * as appservice from "@pulumi/azure/appservice";
import { timer } from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";
import * as callback from "./callback";
import * as shared from "./shared";

const secondsInOneMinute = 60;
const secondsInOneHour =  secondsInOneMinute * 60;

const minutesInOneHour = 60;
const minutesInOneDay = minutesInOneHour * 24;

// yes, this is weird.  However, the 24 day interval is important to azure.  See comments below.
const minutesIn24Days = 24 * minutesInOneDay;

export type Action = callback.AzureCallback<() => Promise<void>>;

export function interval(name: string, options: timer.IntervalRate, handler: Action,
                         opts?: pulumi.ResourceOptions): void {

    let minutes = 0;
    if (options.minutes) {
        minutes += options.minutes;
    }
    if (options.hours) {
        minutes += options.hours * minutesInOneHour;
    }
    if (options.days) {
        minutes += options.days * minutesInOneDay;
    }

    if (minutes < 1) {
        throw new Error("Interval must be at least 1 minute");
    }

    let timeSpan: string;
    if (minutes >= minutesIn24Days) {
        timeSpan = ConvertMinutesToDD_HH_MM(minutes);
    }
    else if (minutes < minutesInOneDay) {
        timeSpan = ConvertSecondsToHH_MM_SS(minutes * secondsInOneMinute);
    }
    else {
        // Yes.  This is strange.  But it is how Azure interprets things:
        // https://docs.microsoft.com/en-us/azure/azure-functions/functions-bindings-timer#timespan
        throw new Error("Azure only supports intervals less than 24 hours, or intervals greater than 24 days.");
    }

    const t = new Timer(name, timeSpan, /*isTimeSpan:*/ true, handler, opts);
}

function ConvertMinutesToDD_HH_MM(minutes: number) {
    // Ensure we're working with an integral number of minutes.  We're returning dd:hh:mm
    // so we can't handle fractional minutes.
    minutes = Math.floor(minutes);

    const days = Math.floor(minutes / minutesInOneDay);
    minutes = minutes % minutesInOneDay;

    const hours = Math.floor(minutes / minutesInOneHour);
    minutes = minutes % minutesInOneHour;

    return `${pad(days)}:${pad(hours)}:${pad(minutes)}`;
}

function ConvertSecondsToHH_MM_SS(seconds: number) {
    // Ensure we're working with an integral number of seconds.  We're returning hh:mm:ss
    // so we can't handle fractional seconds.
    seconds = Math.floor(seconds);

    const hours = Math.floor(seconds / secondsInOneHour);
    seconds = seconds % secondsInOneHour;

    const minutes = Math.floor(seconds / secondsInOneMinute);
    seconds = seconds % secondsInOneMinute;

    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
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

export function daily(name: string, handler: Action, opts?: pulumi.ResourceOptions): void;
export function daily(name: string, schedule: timer.DailySchedule, handler: Action, opts?: pulumi.ResourceOptions): void;
export function daily(name: string,
                      scheduleOrHandler: timer.DailySchedule | Action,
                      handlerOrOptions?: Action | pulumi.ResourceOptions,
                      opts?: pulumi.ResourceOptions): void {
    let hour: number;
    let minute: number;
    let handler: Action;
    if (isAction(scheduleOrHandler)) {
        hour = 0;
        minute = 0;
        handler = scheduleOrHandler as Action;
        opts = handlerOrOptions as pulumi.ResourceOptions | undefined;
    }
    else if (!scheduleOrHandler) {
        throw new RunError("Missing required timer handler function");
    }
    else {
        hour = scheduleOrHandler.hourUTC || 0;
        minute = scheduleOrHandler.minuteUTC || 0;
        handler = handlerOrOptions as Action;
    }
    cron(name, `${minute} ${hour} * * ? *`, handler, opts);
}

export function hourly(name: string, handler: Action, opts?: pulumi.ResourceOptions): void;
export function hourly(name: string, schedule: timer.HourlySchedule, handler: Action, opts?: pulumi.ResourceOptions): void;
export function hourly(name: string,
                       scheduleOrHandler: timer.HourlySchedule | Action,
                       handlerOrOptions?: Action | pulumi.ResourceOptions,
                       opts?: pulumi.ResourceOptions): void {
    let minute: number;
    let handler: Action;
    if (isAction(scheduleOrHandler)) {
        minute = 0;
        handler = scheduleOrHandler as Action;
        opts = handlerOrOptions as pulumi.ResourceOptions | undefined;
    }
    else if (!scheduleOrHandler) {
        throw new RunError("Missing required timer handler function");
    }
    else {
        minute = scheduleOrHandler.minuteUTC || 0;
        handler = handlerOrOptions as Action;
    }
    cron(name, `${minute} * * * ? *`, handler, opts);
}

function isAction(val: any): val is Action {
    return val instanceof Function || !!(<callback.AzureCallbackData<any>>val).function;
}

export function cron(name: string, cronTab: string, handler: Action,
                     opts?: pulumi.ResourceOptions): void {
    const t = new Timer(name, cronTab, /*isTimeSpan:*/ false, handler, opts);
}

interface TimerBinder extends subscription.Binding {
    schedule: string;
    name: string;
    type: "timerTrigger";
    direction: "in";
}

class Timer extends pulumi.ComponentResource {
    public readonly subscription: subscription.EventSubscription<subscription.Context, any>;

    constructor(name: string, scheduleExpression: string, isTimeSpan: boolean,
                handler: Action, opts?: pulumi.ResourceOptions) {
        super("cloud:timer:Timer", name, {
            scheduleExpression: scheduleExpression,
        }, opts);

        const binding: TimerBinder = {
            schedule: scheduleExpression,
            name: "timer",
            type: "timerTrigger",
            direction: "in",
        };

        let appServicePlanId = shared.defaultSubscriptionArgs.appServicePlanId;
        let siteConfig: subscription.EventSubscriptionArgs<subscription.Context, any>["siteConfig"] | undefined;

        if (isTimeSpan) {
            // https://docs.microsoft.com/en-us/azure/azure-functions/functions-bindings-timer#timespan
            // TimeSpan expression are only supported under non-consumption plans.
            const plan = new appservice.Plan(name, {
                resourceGroupName: shared.defaultSubscriptionArgs.resourceGroupName,
                location: shared.defaultSubscriptionArgs.location,

                kind: "App",

                sku: {
                    tier: "Standard",
                    size: "S1",
                },
            }, { parent: this });
            appServicePlanId = plan.id;

            // https://github.com/Azure/azure-functions-host/wiki/Investigating-and-reporting-issues-with-timer-triggered-functions-not-firing
            // For a TimeSpan timer, the FunctionApp must be 'always on' to work.
            siteConfig = {
                alwaysOn: true,
            };
        }

        const data = callback.getOrCreateAzureCallbackData(handler);
        const handlerFunc = data.function;

        // Wrap the cloud handler with an appropriate Azure FunctionApp entrypoint.
        function entryPoint(context: subscription.Context, val: any)  {
            handlerFunc().then(() => context.done(), err => context.done(err));
        }

        const subscriptionArgs = callback.createCallbackEventSubscriptionArgs(entryPoint, data);

        this.subscription = new subscription.EventSubscription<subscription.Context, any>(
            "cloud:timer:EventSubscription", name, [binding], {
                ...subscriptionArgs,
                appServicePlanId: appServicePlanId,
                siteConfig: siteConfig,
            }, { parent: this });
    }
}

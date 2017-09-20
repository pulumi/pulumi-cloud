// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import { LoggedFunction } from "./function";
import { timer } from "./../api/types"

/**
 * IntervalRate describes the rate at which a timer will fire.
 *
 * At least one of [[minutes]], [[hours]] or [[days]] must be provided.
 */
// IntervalRate describes how often to invoke an interval timer.
// export interface IntervalRate {
//     /**
//      * The number of minutes in the interval.  Must be a positive integer.
//      */
//     minutes?: number;
//     /**
//      * The number of hours in the interval.  Must be a positive integer.
//      */
//     hours?: number;
//     /**
//      * The number of days in the interval.  Must be a positive integer.
//      */
//     days?: number;
// }

/**
 * DailySchedule describes a time of day ([[hourUTC]] and [[minuteUTC]])
 * at which a timer should fire.
 */
export interface DailySchedule {
    /**
     * The hour, in UTC, that the time should fire.
     */
    hourUTC?: number;
    /**
     * The minute, in UTC, that the time should fire.
     */
    minuteUTC?: number;
}

/**
 * An interval timer, which fires on a regular time interval.
 *
 * @param name The name of this timer.
 * @param options The interval between firing events on the timer.
 * @param handler A handler to invoke when the timer fires.
 */
export function interval(name: string, options: timer.IntervalRate, handler: () => Promise<void>) {
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

/**
 * A cron timer, which fires on based on a specificied cron schedule.
 *
 * @see http://crontab.org/
 *
 * @param name The name of this timer.
 * @param cronTab A cronTab that specifies that times at which the timer will fire.
 * @param handler A handler to invoke when the timer fires.
 */
export function cron(name: string, cronTab: string, handler: () => Promise<void>) {
    createScheduledEvent(name, `cron(${cronTab})`, handler);
}

/**
 * A daily timer, firing at the specified UTC hour and minute each day.
 *
 * @param name The name of this timer.
 * @param schedule The UTC hour and minute at which to fire each day.
 * @param handler A handler to invoke when the timer fires.
 */
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

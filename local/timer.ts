// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as node_cron from "cron";
import { timer } from "./../api/types";

/**
 * An interval timer, which fires on a regular time interval.
 *
 * @param name The name of this timer.
 * @param options The interval between firing events on the timer.
 * @param handler A handler to invoke when the timer fires.
 */
export function interval(name: string, options: timer.IntervalRate, handler: () => Promise<void>): void {
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
    if (rateMinutes < 1) {
        throw new Error("Interval must be at least 1 minute");
    }

    const rateMS = rateMinutes * 60 * 1000;
    setInterval(handler, rateMS);
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
export function cron(name: string, cronTab: string, handler: () => Promise<void>): void {
    const job = new node_cron.CronJob(cronTab, handler);
    job.start();
}

/**
 * A daily timer, firing at the specified UTC hour and minute each day.
 *
 * @param name The name of this timer.
 * @param schedule The UTC hour and minute at which to fire each day.
 * @param handler A handler to invoke when the timer fires.
 */
export function daily(name: string, schedule: timer.DailySchedule, handler: () => Promise<void>): void {
    const hour = schedule.hourUTC || 0;
    const minute = schedule.minuteUTC || 0;
    cron(name, `${minute} ${hour} * * ? *`, handler);
}

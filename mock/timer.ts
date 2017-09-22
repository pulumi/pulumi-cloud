// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import { timer } from "@pulumi/cloud";
import * as node_cron from "cron";

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

export function cron(name: string, cronTab: string, handler: () => Promise<void>): void {
    const job = new node_cron.CronJob(cronTab, handler);
    job.start();
}

export function daily(name: string, schedule: timer.DailySchedule, handler: () => Promise<void>): void {
    const hour = schedule.hourUTC || 0;
    const minute = schedule.minuteUTC || 0;
    cron(name, `${minute} ${hour} * * ? *`, handler);
}

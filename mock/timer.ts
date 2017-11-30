// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import { timer } from "@pulumi/cloud";
import * as node_cron from "cron";
import * as pulumi from "pulumi";
import * as utils from "./utils";

const usedNames: { [name: string]: string } = Object.create(null);

export function interval(name: string, options: timer.IntervalRate, handler: () => Promise<void>,
                         parent?: pulumi.Resource, dependsOn?: pulumi.Resource[]): void {
    utils.ensureUnique(usedNames, name, "Timer");

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

    // Run the handler very quickly, then set it up to run and the requested interval after that.
    // This way the user doesn't have to wait up to a minute to see the first interval fire.
    setTimeout(() => {
        handler();
        setInterval(handler, rateMS);
    }, 5);
}

export function cron(name: string, cronTab: string, handler: () => Promise<void>,
                     parent?: pulumi.Resource, dependsOn?: pulumi.Resource[]): void {
    utils.ensureUnique(usedNames, name, "Timer");

    const job = new node_cron.CronJob(cronTab, handler);
    job.start();
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
    else if (!handlerOrParent) {
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
    else if (!handlerOrParent) {
        throw new Error("Missing required timer handler function");
    }
    else {
        minute = scheduleOrHandler.minuteUTC || 0;
        handler = handlerOrParent as timer.Action;
        parent = parentOrDependsOn as pulumi.Resource | undefined;
    }
    cron(name, `${minute} * * * ? *`, handler);
}

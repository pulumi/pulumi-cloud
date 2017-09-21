// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

/**
 * IntervalRate describes the rate at which a timer will fire.
 *
 * At least one of [[minutes]], [[hours]] or [[days]] must be provided.
 */
// IntervalRate describes how often to invoke an interval timer.
export interface IntervalRate {
    /**
     * The number of minutes in the interval.  Must be a positive integer.
     */
    minutes?: number;
    /**
     * The number of hours in the interval.  Must be a positive integer.
     */
    hours?: number;
    /**
     * The number of days in the interval.  Must be a positive integer.
     */
    days?: number;
}

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
export let interval: { (name: string, options: IntervalRate, handler: () => Promise<void>): void };

/**
 * A cron timer, which fires on based on a specificied cron schedule.
 *
 * @see http://crontab.org/
 *
 * @param name The name of this timer.
 * @param cronTab A cronTab that specifies that times at which the timer will fire.
 * @param handler A handler to invoke when the timer fires.
 */
export let cron: { (name: string, cronTab: string, handler: () => Promise<void>): void };

/**
 * A daily timer, firing at the specified UTC hour and minute each day.
 *
 * @param name The name of this timer.
 * @param schedule The UTC hour and minute at which to fire each day.
 * @param handler A handler to invoke when the timer fires.
 */
export let daily: { (name: string, schedule: DailySchedule, handler: () => Promise<void>): void };

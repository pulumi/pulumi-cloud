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

import * as pulumi from "@pulumi/pulumi";
import { Callback } from "./callback";

/**
 * Action is a handler that performs an action in response to a timer firing.
 */
export type Action = Callback<() => Promise<void>>;

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
 * DailySchedule describes a time of day ([[hourUTC]] and [[minuteUTC]]) at which a daily timer should fire.
 */
export interface DailySchedule {
    /**
     * The hour, in UTC, that the timer should fire.
     */
    hourUTC?: number;
    /**
     * The minute, in UTC, that the timer should fire.
     */
    minuteUTC?: number;
}

/**
 * HourlySchedule describes a time of the hour ([[minuteUTC]]) at which an hourly timer should fire.
 */
export interface HourlySchedule {
    /**
     * The minute, in UTC, that the timer should fire.
     */
    minuteUTC?: number;
}

/**
 * An interval timer, which fires on a regular time interval.
 *
 * @param name The name of this timer.
 * @param options The interval between firing events on the timer.
 * @param handler A handler to invoke when the timer fires.
 * @param opts A bag of options that controls how this resource behaves.
 */
export declare function interval(name: string, options: IntervalRate, handler: Action,
                                 opts?: pulumi.ResourceOptions): void;

/**
 * A cron timer, which fires on based on a specificied cron schedule.
 *
 * @see http://crontab.org/
 *
 * @param name The name of this timer.
 * @param cronTab A cronTab that specifies that times at which the timer will fire.
 * @param handler A handler to invoke when the timer fires.
 * @param opts A bag of options that controls how this resource behaves.
 */
export declare function cron(name: string, cronTab: string, handler: Action,
                             opts?: pulumi.ResourceOptions): void;

/**
 * A daily timer, firing each day, on the day (at UTC midnight).
 *
 * @param name The name of this timer.
 * @param schedule The UTC hour and minute at which to fire each day.
 * @param handler A handler to invoke when the timer fires.
 * @param opts A bag of options that controls how this resource behaves.
 */
export declare function daily(name: string, handler: Action,
                              opts?: pulumi.ResourceOptions): void;

/**
 * A daily timer, firing at the specified UTC hour and minute each day.
 *
 * @param name The name of this timer.
 * @param schedule The UTC hour and minute at which to fire each day.
 * @param handler A handler to invoke when the timer fires.
 * @param opts A bag of options that controls how this resource behaves.
 */
export declare function daily(name: string, schedule: DailySchedule, handler: Action,
                              opts?: pulumi.ResourceOptions): void;

/**
 * An hourly timer, firing each hour, on the hour.
 *
 * @param name The name of this timer.
 * @param handler A handler to invoke when the timer fires.
 * @param opts A bag of options that controls how this resource behaves.
 */
export declare function hourly(name: string, handler: Action,
                               opts?: pulumi.ResourceOptions): void;

/**
 * An hourly timer, firing at the specified UTC minute each hour.
 *
 * @param name The name of this timer.
 * @param schedule The UTC minute at which to fire each day.
 * @param handler A handler to invoke when the timer fires.
 * @param opts A bag of options that controls how this resource behaves.
 */
export declare function hourly(name: string, schedule: HourlySchedule, handler: Action,
                               opts?: pulumi.ResourceOptions): void;

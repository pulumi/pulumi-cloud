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

/** @deprecated [@pulumi/cloud] has been deprecated.  Please migrate your code to [@pulumi/aws] or [@pulumi/azure] */
export type Action = () => Promise<void>;

/** @deprecated [@pulumi/cloud] has been deprecated.  Please migrate your code to [@pulumi/aws] or [@pulumi/azure] */
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

/** @deprecated [@pulumi/cloud] has been deprecated.  Please migrate your code to [@pulumi/aws] or [@pulumi/azure] */
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

/** @deprecated [@pulumi/cloud] has been deprecated.  Please migrate your code to [@pulumi/aws] or [@pulumi/azure] */
export interface HourlySchedule {
    /**
     * The minute, in UTC, that the timer should fire.
     */
    minuteUTC?: number;
}

/** @deprecated [@pulumi/cloud] has been deprecated.  Please migrate your code to [@pulumi/aws] or [@pulumi/azure] */
export declare function interval(name: string, options: IntervalRate, handler: Action,
                                 opts?: pulumi.ResourceOptions): void;

/** @deprecated [@pulumi/cloud] has been deprecated.  Please migrate your code to [@pulumi/aws] or [@pulumi/azure] */
export declare function cron(name: string, cronTab: string, handler: Action,
                             opts?: pulumi.ResourceOptions): void;

/** @deprecated [@pulumi/cloud] has been deprecated.  Please migrate your code to [@pulumi/aws] or [@pulumi/azure] */
export declare function daily(name: string, handler: Action,
                              opts?: pulumi.ResourceOptions): void;

/** @deprecated [@pulumi/cloud] has been deprecated.  Please migrate your code to [@pulumi/aws] or [@pulumi/azure] */
export declare function daily(name: string, schedule: DailySchedule, handler: Action,
                              opts?: pulumi.ResourceOptions): void;

/** @deprecated [@pulumi/cloud] has been deprecated.  Please migrate your code to [@pulumi/aws] or [@pulumi/azure] */
export declare function hourly(name: string, handler: Action,
                               opts?: pulumi.ResourceOptions): void;

/** @deprecated [@pulumi/cloud] has been deprecated.  Please migrate your code to [@pulumi/aws] or [@pulumi/azure] */
export declare function hourly(name: string, schedule: HourlySchedule, handler: Action,
                               opts?: pulumi.ResourceOptions): void;

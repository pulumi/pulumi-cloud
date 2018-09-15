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

import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";

let config = new pulumi.Config("timers:config");
let message = config.require("message");

cloud.timer.interval("examples-test-interval1", { minutes: 1 }, async () => {
    console.log(`test-interval[${Date.now()}]: ${message}`);
});

cloud.timer.interval("examples-test-interval2", { minutes: 59 }, async () => {
    console.log(`test-interval[${Date.now()}]: ${message}`);
});

cloud.timer.interval("examples-test-interval3", { minutes: 120 }, async () => {
    console.log(`test-interval[${Date.now()}]: ${message}`);
});

cloud.timer.interval("examples-test-interval4", { minutes: 120, hours: 2 }, async () => {
    console.log(`test-interval[${Date.now()}]: ${message}`);
});

cloud.timer.interval("examples-test-interval5", { days: 24 }, async () => {
    console.log(`test-interval[${Date.now()}]: ${message}`);
});

cloud.timer.interval("examples-test-interval6", { days: 24, hours: 15, minutes: 15 }, async () => {
    console.log(`test-interval[${Date.now()}]: ${message}`);
});

cloud.timer.interval("examples-test-interval7", { hours: 23, minutes: 59 }, async () => {
    console.log(`test-interval[${Date.now()}]: ${message}`);
});

cloud.timer.cron("examples-test-cron", "* * * * ? *", async () => {
    console.log(`test-cron[${Date.now()}]: ${message}`);
});

cloud.timer.daily("examples-test-daily", { hourUTC: 7, minuteUTC: 30 }, async () => {
    console.log(`test-daily[${Date.now()}]: ${message}`);
});

cloud.timer.hourly("examples-test-hourly", { minuteUTC: 45 }, async () => {
    console.log(`test-hourly[${Date.now()}]: ${message}`);
});


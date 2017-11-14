// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";

let config = new pulumi.Config("examples:timers:config");
let message = config.require("message");

cloud.timer.interval("examples:test-interval", { minutes: 1 }, async () => {
    console.log(`test-interval[${Date.now()}]: ${message}`);
});

cloud.timer.cron("examples:test-cron", "* * * * ? *", async () => {
    console.log(`test-cron[${Date.now()}]: ${message}`);
});

cloud.timer.daily("examples:test-daily", { hourUTC: 7, minuteUTC: 30 }, async () => {
    console.log(`test-daily[${Date.now()}]: ${message}`);
});

cloud.timer.hourly("examples:test-hourly", { minuteUTC: 45 }, async () => {
    console.log(`test-hourly[${Date.now()}]: ${message}`);
});


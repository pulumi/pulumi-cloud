// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";

let countDown = new pulumi.Topic<number>("countDown");

countDown.subscribe("watcher", async (num) => {
    console.log(num);
    if (num > 0) {
        await countDown.publish(num - 1);
    }
});

pulumi.timer.interval("heartbeat", {minutes: 5}, async () => {
    await countDown.publish(25);
});

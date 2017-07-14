// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as platform from "@lumi/platform";

let countDown = new platform.Topic<number>("countDown");
countDown.subscribe("watcher", async (num) => {
    console.log(num);
    if (num > 0) {
        await countDown.publish(num - 1);
    }
});

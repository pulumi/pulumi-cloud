// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as platform from "@lumi/platform";
import * as topic from "./topic";
let q = topic.q;
declare let JSON: any;

let countDown = new platform.Topic<number>("countDown");
countDown.subscribe("watcher", async (num) => {
    console.log(num);
    if (num > 0) {
        await q(countDown).publish(num - 1);
    }
});

// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as platform from "@lumi/platform";
import * as queue from "./queue";
let q = queue.q;
declare let JSON: any;

let countDown = new platform.Queue("queue");
countDown.forEach("watcher", async (item) => {
    let num = JSON.parse(item);
    console.log(num);
    if (num > 0) {
        await q(countDown).push(JSON.stringify(num - 1));
    }
});

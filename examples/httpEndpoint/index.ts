// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import { Dependency } from "pulumi";

const endpoint = new cloud.HttpEndpoint("examples-test");
endpoint.get("/test1.txt", (req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end("You got test1");
});
endpoint.proxy("/google", "http://www.google.com/")

export let url: Dependency<string> = endpoint.publish().url;

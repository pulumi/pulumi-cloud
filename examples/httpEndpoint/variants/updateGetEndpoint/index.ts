// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";

const endpoint = new cloud.HttpEndpoint("examples:test");
endpoint.get("/test2.txt", (req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end("You got test2");
});

endpoint.publish();

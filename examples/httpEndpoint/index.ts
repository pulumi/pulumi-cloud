// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";

const endpoint = new cloud.HttpEndpoint("test");
endpoint.get("/test1.txt", (req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end("You got test1");
});

endpoint.publish();

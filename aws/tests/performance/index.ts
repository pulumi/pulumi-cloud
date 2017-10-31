// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";

const endpoint = new cloud.HttpEndpoint("performance");
endpoint.get("/performance", (req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.end("You got test1");
});

endpoint.publish();

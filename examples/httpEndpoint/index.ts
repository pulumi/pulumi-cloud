// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";

const endpoint = new cloud.HttpEndpoint("endpoint1");
endpoint.get("/test1.txt", (req, res) => {
    res.end("You got test1");
});

endpoint.publish();

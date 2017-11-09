// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.
// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as harness from "./harness";
import * as tableTests from "./tableTests";

const endpoint = new cloud.HttpEndpoint("unittests");

const testFunctions = [tableTests.runAllTests];

endpoint.get("/unittests", async (req, res) => {
    await harness.testModules(testFunctions);
});

const deployment = endpoint.publish();
deployment.url.then(u => console.log("Serving at: " + u));

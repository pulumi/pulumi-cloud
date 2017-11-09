// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as harness from "./harness";
import * as tableTests from "./tableTests";

const endpoint = new cloud.HttpEndpoint("unittests");

const testFunctions = [tableTests.runAllTests];

endpoint.get("/unittests", async (req, res) => {
    try {
        const [passed, json] = await harness.testModules(testFunctions);
        if (passed) {
            res.json(json);
        }
        else {
            res.status(500).json(json);
        }
    } catch (err) {
        res.status(500).json(harness.errorJSON(err));
    }
});

const deployment = endpoint.publish();
deployment.url.then(u => console.log("Serving at: " + u));

// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import * as harness from "./harness";
import * as httpEndpointTests from "./httpEndpointTests";
import * as serviceTests from "./serviceTests";
import * as tableTests from "./tableTests";

const endpoint = new cloud.HttpEndpoint("tests-unittests");

const testFunctions = [
    tableTests.runAllTests,
    httpEndpointTests.runAllTests,
    serviceTests.runAllTests,
];

endpoint.get("/unittests", async (req, res) => {
    const localHarness = require("./bin/harness");
    await localHarness.testModules(res, testFunctions);
});

const deployment = endpoint.publish();
export let url: pulumi.Output<string> = deployment.url;

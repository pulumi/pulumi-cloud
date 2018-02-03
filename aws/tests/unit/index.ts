// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import { Dependency } from "pulumi";
import * as harness from "./harness";
import * as httpEndpointTests from "./httpEndpointTests";
import * as tableTests from "./tableTests";
import * as serviceTests from "./serviceTests";

const endpoint = new cloud.HttpEndpoint("tests-unittests");

const testFunctions = [
    tableTests.runAllTests,
    httpEndpointTests.runAllTests,
    serviceTests.runAllTests,
];

endpoint.get("/unittests", async (req, res) => {
    await harness.testModules(res, testFunctions);
});

const deployment = endpoint.publish();
export let url = deployment.url;

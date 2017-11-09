// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as supertest from "supertest";
import * as harness from "./harness";

namespace updateProgramTests {
    const endpoint1 = new cloud.HttpEndpoint("persistent_endpoint");
    // in v2 change the path we're on.
    endpoint1.get("/available", async (req, res) => {
        res.json({ version: 2 });
    });
    const deployment1 = endpoint1.publish();

    export async function testInitialGet() {
        const address = await deployment1.url;
        await supertest(address).get("stage/").expect(403);
        await supertest(address).get("stage/available").expect(200, { version: "2" });
    }
}

const endpoint = new cloud.HttpEndpoint("unittests");

endpoint.get("/unittests", async (req, res) => {
    await harness.runUnitTests(res, {
        ["httpEndpointTests.updateProgramTests"]: updateProgramTests,
    });
});

const deployment = endpoint.publish();
deployment.url.then(u => console.log("Serving at: " + u));

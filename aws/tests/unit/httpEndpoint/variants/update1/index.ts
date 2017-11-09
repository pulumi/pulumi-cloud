// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as supertest from "supertest";
import * as harness from "./harness";

namespace updateProgramTests {
    const endpoint1 = new cloud.HttpEndpoint("persistent_endpoint");
    endpoint1.get("/", async (req, res) => {
        // in v1 change the message we report.
        res.json({ version: 1 });
    });
    const deployment1 = endpoint1.publish();

    export async function testInitialGet() {
        const address = await deployment1.url;
        await supertest(address).get("stage/").expect(200, { version: "1" });
        await supertest(address).get("stage/available").expect(403);
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

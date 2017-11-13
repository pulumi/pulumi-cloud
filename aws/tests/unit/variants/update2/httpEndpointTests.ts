// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as supertest from "supertest";
import * as harness from "./harness";

const endpoint = new cloud.HttpEndpoint("unittests_endpoint");

namespace updateProgramTests {
    // in v2 change the path we're on.
    endpoint.get("/persistent1/available", async (req, res) => {
        res.json({ version: 2 });
    });

    export async function testInitialGet() {
        const address = await deployment.url;
        await supertest(address).get("stage/persistent1/").expect(403);
        await supertest(address).get("stage/persistent1/available").expect(200, { version: "2" });
    }
}

const deployment = endpoint.publish();

export async function runAllTests(result: any): Promise<boolean>{
    return await harness.testModule(result, {
        ["httpEndpointTests.updateProgramTests"]: updateProgramTests,
    });
}

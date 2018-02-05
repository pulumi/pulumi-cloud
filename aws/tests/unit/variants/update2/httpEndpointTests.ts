// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as supertest from "supertest";
import * as harness from "./harness";

const endpoint = new cloud.HttpEndpoint("tests-endpoint");

namespace updateProgramTests {
    // in v2 change the path we're on.
    endpoint.get("/persistent2", async (req, res) => {
        res.json({ version: 2 });
    });

    export async function testInitialGet() {
        const address = deployment.url.get();
        await supertest(address).get("/persistent1").expect(404);
        await supertest(address).get("/persistent2").expect(200, { version: "2" });
    }
}

const deployment = endpoint.publish();

export async function runAllTests(result: any): Promise<boolean>{
    return await harness.testModule(result, {
        ["httpEndpointTests.updateProgramTests"]: updateProgramTests,
    });
}

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


    const endpoint2 = new cloud.HttpEndpoint("persistent_endpoint_2");
    endpoint2.static("/", "www");
    const deployment2 = endpoint2.publish();

    export async function testStaticGet() {
        const address = await deployment2.url;
        await supertest(address).get("stage/file2.txt").expect(200, "contents2\n");
        await supertest(address).get("stage/file1.txt").expect(400);
    }
}

export async function runAllTests(result: any): Promise<boolean>{
    return await harness.testModule(result, {
        ["httpEndpointTests.updateProgramTests"]: updateProgramTests,
    });
}

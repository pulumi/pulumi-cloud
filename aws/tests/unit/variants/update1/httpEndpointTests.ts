// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as supertest from "supertest";
import * as harness from "./harness";

const endpoint = new cloud.HttpEndpoint("tests-endpoint");

namespace updateProgramTests {
    endpoint.get("/persistent1", async (req, res) => {
        // in v1 change the message we report.
        res.json({ version: 1 });
    });

    export async function testInitialGet() {
        const address = deployment.url.get();
        await supertest(address).get("/persistent1").expect(200, { version: "1" });
        await supertest(address).get("/persistent2").expect(404);
    }


    endpoint.static("/persistent3/", "www");

    export async function testStaticGet() {
        const address = deployment.url.get();
        await supertest(address).get("/persistent3/file2.txt").expect(200, "contents2\n");
        await supertest(address).get("/persistent3/file1.txt").expect(400);
    }
}

const deployment = endpoint.publish();

export async function runAllTests(result: any): Promise<boolean>{
    return await harness.testModule(result, {
        ["httpEndpointTests.updateProgramTests"]: updateProgramTests,
    });
}

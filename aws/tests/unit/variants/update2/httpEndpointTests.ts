// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";

import * as assertModule from "assert";
import * as supertestModule from "supertest";
import * as harnessModule from "./harness";

export type TestArgs = {
    assert: typeof assertModule,
    harness: typeof harnessModule,
    supertest: typeof supertestModule,
};

const endpoint = new cloud.HttpEndpoint("tests-endpoint");

namespace updateProgramTests {
    // in v2 change the path we're on.
    endpoint.get("/persistent2", async (req, res) => {
        res.json({ version: 2 });
    });

    export async function testInitialGet(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/persistent1").expect(404);
        await args.supertest(address).get("/persistent2").expect(200, { version: "2" });
    }
}

const deployment = endpoint.publish();

export async function runAllTests(args: TestArgs, result: any): Promise<boolean>{
    return await args.harness.testModule(args, result, {
        ["httpEndpointTests.updateProgramTests"]: updateProgramTests,
    });
}

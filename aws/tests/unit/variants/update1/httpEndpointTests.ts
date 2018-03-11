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
    endpoint.get("/persistent1", async (req, res) => {
        // in v1 change the message we report.
        res.json({ version: 1 });
    });

    export async function testInitialGet(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/persistent1").expect(200, { version: "1" });
        await args.supertest(address).get("/persistent2").expect(404);
    }


    endpoint.static("/persistent3/", "www");

    export async function testStaticGet(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/persistent3/file2.txt").expect(200, "contents2\n");
        await args.supertest(address).get("/persistent3/file1.txt").expect(400);
    }
}

const deployment = endpoint.publish();

export async function runAllTests(args: TestArgs, result: any): Promise<boolean>{
    return await args.harness.testModule(args, result, {
        ["httpEndpointTests.updateProgramTests"]: updateProgramTests,
    });
}

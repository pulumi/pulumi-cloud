// Copyright 2016-2018, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as cloud from "@pulumi/cloud";

import * as assertModule from "assert";
import * as supertestModule from "supertest";
import * as harnessModule from "./harness";

export type TestArgs = {
    assert: typeof assertModule,
    harness: typeof harnessModule,
    supertest: typeof supertestModule,
};

const endpoint = new cloud.API("tests-endpoint");

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
        ["apiTests.updateProgramTests"]: updateProgramTests,
    });
}

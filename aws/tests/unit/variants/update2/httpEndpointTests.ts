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

const endpoint = new cloud.HttpEndpoint("tests-endpoint");

namespace updateProgramTests {
    // in v2 change the path we're on.
    endpoint.get("/persistent2", async (req, res) => {
        res.json({ version: 2 });
    });

    export async function testInitialGet(args: TestArgs) {
        const address = deployment.url.get();
        // TODO[pulumi/pulumi-cloud#444]: At least in `us-east-1`, this has been failing returning a 500 instead of 404.
        // Disabling until we can identify the root cause in API Gateway or the provider.
        //
        // await args.supertest(address).get("/persistent1").expect(404);
        // await args.supertest(address).get("/persistent2").expect(200, { version: "2" });
    }
}

const deployment = endpoint.publish();

export async function runAllTests(args: TestArgs, result: any): Promise<boolean>{
    return await args.harness.testModule(args, result, {
        ["httpEndpointTests.updateProgramTests"]: updateProgramTests,
    });
}

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
import * as pulumi from "@pulumi/pulumi";

import * as assertModule from "assert";
import * as harnessModule from "./harness";

import * as apiTests from "./apiTests";
import * as tableTests from "./tableTests";

const endpoint = new cloud.API("tests-unittests");

const testFunctions = [
    tableTests.runAllTests,
    apiTests.runAllTests,
];

// Run each of the `testFunction`s in parallel, each writing their results into `result.
async function testModules(res: cloud.Response) {
    try {
        const assert: typeof assertModule = require("assert");
        const harness: typeof harnessModule = require("./bin/harness");
        const supertest = require("supertest");

        const arg = { assert, harness, supertest };
        const [passed, json] = await harness.testModulesWorker(testFunctions, arg);
        if (passed) {
            res.json(json);
        }
        else {
            res.status(500).json(json);
        }
    } catch (err) {
        res.status(500).json(errorJSON(err));
    }
}

endpoint.get("/unittests", async (req, res) => {
    // console.log();
    try {
        await testModules(res);
    }
    catch (err) {
        res.status(500).json(errorJSON(err));
    }
});

function errorJSON(err: any) {
    const result: any = Object.create(null);
    Object.getOwnPropertyNames(err).forEach(key => result[key] = err[key]);
    return result;
}

const deployment = endpoint.publish();
export let url: pulumi.Output<string> = deployment.url;

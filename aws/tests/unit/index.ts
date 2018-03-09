// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";

import * as assertModule from "assert";
import * as harnessModule from "./harness";

import * as httpEndpointTests from "./httpEndpointTests";
import * as tableTests from "./tableTests";
//  import * as serviceTests from "./serviceTests";

const endpoint = new cloud.HttpEndpoint("tests-unittests");

const testFunctions = [
    tableTests.runAllTests,
    httpEndpointTests.runAllTests,
    // serviceTests.runAllTests,
];

async function testModulesWorker(arg: any): Promise<[boolean, any]> {
    let passed = true;
    const result: any = Object.create(null);

    await Promise.all(testFunctions.map(async (testFn) => {
        passed = await testFn(arg, result) && passed;
    }));

    return [passed, result];
}

// Run each of the `testFunction`s in parallel, each writing their results into `result.
async function testModules(res: cloud.Response) {
    try {
        const assert = require("assert");
        const harness = require("./bin/harness");
        const supertest = require("supertest");

        const arg = { assert, harness, supertest };
        const [passed, json] = await testModulesWorker(arg);
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

// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as supertest from "supertest";
import * as harness from "harness";

let uniqueId = 0;
namespace getApiTests {
    const endpoint1 = new cloud.HttpEndpoint("endpoint" + uniqueId++);
    endpoint1.get("/", async (req, res) => {
        res.json({ success: true });
    });
    const deployment1 = endpoint1.publish();

    export async function testGetOfExistingPath() {
        const address = await deployment1.url;
        await supertest(address).get("stage/").expect(200, { success: true });
    }

    export async function testGetOfNonExistingPath() {
        const address = await deployment1.url;
        await supertest(address).get("stage/unavailable").expect(403);
    }


    const endpoint2 = new cloud.HttpEndpoint("endpoint" + uniqueId++);
    endpoint2.get("/", async (req, res) => {
        try {
            const result = Object.create(null);
            for (const param of Object.keys(req.query)) {
                result[param] = req.query[param];
            }

            res.json(result);
        } catch (err) {
            res.json(errorJSON(err));
        }
    });
    const deployment2 = endpoint2.publish();
    export async function testGetWithQuery() {
        const address = await deployment2.url;
        await supertest(address).get("stage/")
                                .query({ param1: 0, param2: 1 })
                                .expect(200, { param1: "0", param2: "1" });
    }
}


namespace postApiTests {
    const endpoint1 = new cloud.HttpEndpoint("endpoint" + uniqueId++);
    endpoint1.post("/", async (req, res) => {
        res.json(JSON.parse(req.body.toString()));
    });
    const deployment1 = endpoint1.publish();

    export async function testPostOfExistingPath() {
        const address = await deployment1.url;
        await supertest(address).post("stage/")
                                .send({ param1: "0", param2: "1" })
                                .expect(200, { param1: "0", param2: "1" });
    }

    export async function testPostOfNonExistingPath() {
        const address = await deployment1.url;
        await supertest(address).post("stage/unavailable").expect(403);
    }
}

namespace updateProgramTests {
    const endpoint1 = new cloud.HttpEndpoint("persistent_endpoint");
    endpoint1.get("/", async (req, res) => {
        res.json({ version: 0 });
    });
    const deployment1 = endpoint1.publish();

    export async function testInitialGet() {
        const address = await deployment1.url;
        await supertest(address).get("stage/").expect(200, { version: "0" });
        await supertest(address).get("stage/available").expect(403);
    }
}

const endpoint = new cloud.HttpEndpoint("unittests");

endpoint.get("/unittests", async (req, res) => {
    try {
        const [passed, json] = await runAllTests();
        if (passed) {
            res.json(json);
        }
        else {
            res.status(500).json(json);
        }
    } catch (err) {
        res.status(500).json(errorJSON(err));
    }
});

const deployment = endpoint.publish();
deployment.url.then(u => console.log("Serving at: " + u));

function errorJSON(err: any) {
    const result: any = Object.create(null);
    Object.getOwnPropertyNames(err).forEach(key => result[key] = err[key]);
    return result;
}

async function runAllTests(): Promise<[boolean, any]> {
    let passed = true;
    const result: any = Object.create(null);

    passed = await runTests("httpEndpointTests.getApiTests", getApiTests, result) && passed;
    passed = await runTests("httpEndpointTests.postApiTests", postApiTests, result) && passed;
    passed = await runTests("httpEndpointTests.updateProgramTests", updateProgramTests, result) && passed;

    return [passed, result];
}

async function runTests(moduleName: string, module: any, result: any) {
    let passed = true;
    for (const name of Object.keys(module)) {
        if (!name.startsWith("test")) {
            continue;
        }

        const fullName = `${moduleName}.${name}`;
        try {
            await module[name]();
            result[fullName] = "passed";
        }
        catch (err) {
            passed = false;
            result[fullName] = errorJSON(err);
        }
    }

    return passed;
}

async function assertThrowsAsync(body: () => Promise<void>): Promise<void> {
    try {
        await body();
    }
    catch (err) {
        return;
    }

    throw new Error("Expected error to be thrown");
}

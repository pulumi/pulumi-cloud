// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as supertest from "supertest";

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

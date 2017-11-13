// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as supertest from "supertest";
import * as harness from "./harness";

let uniqueId = 0;
namespace getApiTests {
    const endpoint1 = new cloud.HttpEndpoint("endpoint" + uniqueId++);
    endpoint1.get("/", async (req, res) => {
        res.json({ success: true });
    });
    const deployment1 = endpoint1.publish();

    export async function testGetOfExistingPath() {
        const address = await deployment1.url;
        try {
            await supertest(address).get("stage/").expect(200, { success: true });
        }
        catch (err) {
            err.address = "address";
            err.getUrl = "stage/";
            err.originalStack = err.stack;
            err.originalMessage = err.message;
            throw err;
        }
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
            res.json(harness.errorJSON(err));
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

namespace deleteApiTests {
    const endpoint1 = new cloud.HttpEndpoint("endpoint" + uniqueId++);
    endpoint1.delete("/", async (req, res) => {
        res.json({ success: true });
    });
    const deployment1 = endpoint1.publish();

    export async function testDeleteOfExistingPath() {
        const address = await deployment1.url;
        await supertest(address).delete("stage/")
                                .expect(200, { success: true });
    }

    export async function testDeleteOfNonExistingPath() {
        const address = await deployment1.url;
        await supertest(address).delete("stage/unavailable").expect(403);
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

namespace staticApiTests {
    const endpoint1 = new cloud.HttpEndpoint("endpoint" + uniqueId++);
    endpoint1.static("/", "www");
    const deployment1 = endpoint1.publish();

    export async function testIndexHtmlGetsMappedToRoot() {
        const address = await deployment1.url;
        await supertest(address).get("stage/").expect(200, "<html></html>\n");
    }

    export async function testIndexHtmlGetsServedDirectly_1() {
        const address = await deployment1.url;
        await supertest(address).get("stage/index.html").expect(200, "<html></html>\n");
    }

    export async function testSubFileServedDirectly() {
        const address = await deployment1.url;
        await supertest(address).get("stage/sub/file1.txt").expect(200, "othercontents1\n");
    }


    const endpoint2 = new cloud.HttpEndpoint("endpoint" + uniqueId++);
    endpoint2.static("/", "www", { index: false });
    const deployment2 = endpoint2.publish();

    export async function testIndexHtmlDoesNotGetMappedToRoot_1() {
        const address = await deployment2.url;
        await supertest(address).get("stage/").expect(403);
    }

    export async function testIndexHtmlGetsServedDirectly_2() {
        const address = await deployment2.url;
        await supertest(address).get("stage/index.html").expect(200, "<html></html>\n");
    }


    const endpoint3 = new cloud.HttpEndpoint("endpoint" + uniqueId++);
    endpoint3.static("/", "www", { index: "file1.txt" });
    const deployment3 = endpoint3.publish();

    export async function testIndexHtmlDoesNotGetMappedToRoot_2() {
        const address = await deployment3.url;
        await supertest(address).get("stage/").expect("Content-Type", "text/plain")
                                              .expect(200, "contents1\n");
    }

    export async function testIndexHtmlGetsServedDirectly_3() {
        const address = await deployment3.url;
        await supertest(address).get("stage/index.html").expect(200, "<html></html>\n");
    }

    export async function testFileGetsServedDirectlyEvenWhenIndex() {
        const address = await deployment3.url;
        await supertest(address).get("stage/file1.txt").expect(200, "contents1\n");
    }


    const endpoint4 = new cloud.HttpEndpoint("endpoint" + uniqueId++);
    endpoint4.static("/", "www/file1.txt", { contentType: "text/html" });
    const deployment4 = endpoint4.publish();

    export async function testSpecifiedContentType() {
        const address = await deployment4.url;
        await supertest(address).get("stage/").expect(200, "contents1\n");
        await supertest(address).get("stage/").expect("Content-Type", "text/html");
    }
}


namespace updateProgramTests {
    const endpoint1 = new cloud.HttpEndpoint("persistent_endpoint_1");
    endpoint1.get("/", async (req, res) => {
        res.json({ version: 0 });
    });
    const deployment1 = endpoint1.publish();

    export async function testInitialGet() {
        const address = await deployment1.url;
        await supertest(address).get("stage/").expect(200, { version: "0" });
        await supertest(address).get("stage/available").expect(403);
    }


    const endpoint2 = new cloud.HttpEndpoint("persistent_endpoint_2");
    endpoint2.static("/", "www");
    const deployment2 = endpoint2.publish();

    export async function testStaticGet() {
        const address = await deployment2.url;
        await supertest(address).get("stage/file1.txt").expect(200, "contents1\n");
        await supertest(address).get("stage/file2.txt").expect(400);
    }
}

export async function runAllTests(result: any): Promise<boolean>{
    return await harness.testModule(result, {
        ["httpEndpointTests.getApiTests"]: getApiTests,
        ["httpEndpointTests.deleteApiTests"]: deleteApiTests,
        ["httpEndpointTests.postApiTests"]: postApiTests,
        ["httpEndpointTests.staticApiTests"]: staticApiTests,
        ["httpEndpointTests.updateProgramTests"]: updateProgramTests,
    });
}

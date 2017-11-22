// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as supertest from "supertest";
import * as harness from "./harness";


const endpoint = new cloud.HttpEndpoint("tests-endpoint");

namespace getApiTests {
    endpoint.get("/get1", async (req, res) => {
        res.json({ success: true });
    });

    export async function testGetOfExistingPath() {
        const address = await deployment.url;
        try {
            await supertest(address).get("/get1").expect(200, { success: true });
        }
        catch (err) {
            err.address = address;
            err.getUrl1 = "/get1";
            throw err;
        }
    }

    export async function testGetOfNonExistingPath() {
        const address = await deployment.url;
        await supertest(address).get("unavailable").expect(404);
    }


    endpoint.get("/get2", async (req, res) => {
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

    export async function testGetWithQuery() {
        const address = await deployment.url;
        await supertest(address).get("/get2")
                                .query({ param1: 0, param2: 1 })
                                .expect(200, { param1: "0", param2: "1" });
    }
}

namespace deleteApiTests {
    endpoint.delete("/delete1", async (req, res) => {
        res.json({ success: true });
    });

    export async function testDeleteOfExistingPath() {
        const address = await deployment.url;
        await supertest(address).delete("/delete1")
                                .expect(200, { success: true });
    }

    export async function testDeleteOfNonExistingPath() {
        const address = await deployment.url;
        await supertest(address).delete("/unavailable").expect(404);
    }
}

namespace postApiTests {
    endpoint.post("/post1", async (req, res) => {
        res.json(JSON.parse(req.body.toString()));
    });

    export async function testPostOfExistingPath() {
        const address = await deployment.url;
        await supertest(address).post("/post1")
                                .send({ param1: "0", param2: "1" })
                                .expect(200, { param1: "0", param2: "1" });
    }

    export async function testPostOfNonExistingPath() {
        const address = await deployment.url;
        await supertest(address).post("/unavailable").expect(404);
    }
}

namespace staticApiTests {
    endpoint.static("/static1/", "www");

    export async function testIndexHtmlGetsMappedToRoot() {
        const address = await deployment.url;
        await supertest(address).get("/static1/").expect(200, "<html></html>\n");
    }

    export async function testIndexHtmlGetsServedDirectly_1() {
        const address = await deployment.url;
        await supertest(address).get("/static1/index.html").expect(200, "<html></html>\n");
    }

    export async function testSubFileServedDirectly() {
        const address = await deployment.url;
        await supertest(address).get("/static1/sub/file1.txt").expect(200, "othercontents1\n");
    }


    endpoint.static("/static2/", "www", { index: false });

    export async function testIndexHtmlDoesNotGetMappedToRoot_1() {
        const address = await deployment.url;
        await supertest(address).get("/static2/").expect(404);
    }

    export async function testIndexHtmlGetsServedDirectly_2() {
        const address = await deployment.url;
        await supertest(address).get("/static2/index.html").expect(200, "<html></html>\n");
    }


    endpoint.static("/static3/", "www", { index: "file1.txt" });

    export async function testIndexHtmlDoesNotGetMappedToRoot_2() {
        const address = await deployment.url;
        await supertest(address).get("/static3/").expect("Content-Type", "text/plain")
                                              .expect(200, "contents1\n");
    }

    export async function testIndexHtmlGetsServedDirectly_3() {
        const address = await deployment.url;
        await supertest(address).get("/static3/index.html").expect(200, "<html></html>\n");
    }

    export async function testFileGetsServedDirectlyEvenWhenIndex() {
        const address = await deployment.url;
        await supertest(address).get("/static3/file1.txt").expect(200, "contents1\n");
    }


    endpoint.static("/static4/", "www/file1.txt", { contentType: "text/html" });

    export async function testSpecifiedContentType() {
        const address = await deployment.url;
        await supertest(address).get("/static4/").expect(200, "contents1\n");
        await supertest(address).get("/static4/").expect("Content-Type", "text/html");
    }
}

namespace updateProgramTests {
    endpoint.get("/persistent1", async (req, res) => {
        res.json({ version: 0 });
    });

    export async function testInitialGet() {
        const address = await deployment.url;
        await supertest(address).get("/persistent1").expect(200, { version: "0" });
        await supertest(address).get("/persistent2").expect(404);
    }


    endpoint.static("/persistent3/", "www");

    export async function testStaticGet() {
        const address = await deployment.url;
        await supertest(address).get("/persistent3/file1.txt").expect(200, "contents1\n");
        await supertest(address).get("/persistent3/file2.txt").expect(400);
    }
}

const deployment = endpoint.publish();

export async function runAllTests(result: any): Promise<boolean>{
    return await harness.testModule(result, {
        ["httpEndpointTests.getApiTests"]: getApiTests,
        ["httpEndpointTests.deleteApiTests"]: deleteApiTests,
        ["httpEndpointTests.postApiTests"]: postApiTests,
        ["httpEndpointTests.staticApiTests"]: staticApiTests,
        ["httpEndpointTests.updateProgramTests"]: updateProgramTests,
    });
}

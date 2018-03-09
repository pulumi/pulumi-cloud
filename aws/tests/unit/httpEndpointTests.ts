// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";

import * as assertModule from "assert";
export type AssertType = typeof assertModule;

import * as harnessModule from "./harness";
export type HarnessType = typeof harnessModule;

import * as supertestModule from "supertest";
export type SupertestType = typeof supertestModule;

export type TestArgs = { assert: AssertType, harness: HarnessType, supertest: SupertestType };

const endpoint = new cloud.HttpEndpoint("tests-endpoint");

namespace getApiTests {
    endpoint.get("/get1", async (req, res) => {
        res.json({ success: true });
    });

    export async function testGetOfExistingPath(args: TestArgs) {
        const address = deployment.url.get();
        try {
            await args.supertest(address).get("/get1").expect(200, { success: true });
        }
        catch (err) {
            err.address = address;
            err.getUrl1 = "/get1";
            throw err;
        }
    }

    export async function testGetOfNonExistingPath(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/unavailable").expect(404);
    }

    endpoint.get("/get2", async (req, res) => {
        try {
            const result = Object.create(null);
            for (const param of Object.keys(req.query)) {
                result[param] = req.query[param];
            }

            res.json(result);
        } catch (err) {
            const localHarness = require("./bin/harness");
            res.json(localHarness.errorJSON(err));
        }
    });

    export async function testGetWithQuery(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/get2")
                                .query({ param1: 0, param2: 1 })
                                .expect(200, { param1: "0", param2: "1" });
    }
}

namespace deleteApiTests {
    endpoint.delete("/delete1", async (req, res) => {
        res.json({ success: true });
    });

    export async function testDeleteOfExistingPath(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).delete("/delete1")
                                .expect(200, { success: true });
    }

    export async function testDeleteOfNonExistingPath(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).delete("/unavailable").expect(404);
    }
}

namespace postApiTests {
    endpoint.post("/post1", async (req, res) => {
        res.json(JSON.parse(req.body.toString()));
    });

    export async function testPostOfExistingPath(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).post("/post1")
                                .send({ param1: "0", param2: "1" })
                                .expect(200, { param1: "0", param2: "1" });
    }

    export async function testPostOfNonExistingPath(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).post("/unavailable").expect(404);
    }
}

namespace staticApiTests {
    endpoint.static("/static1/", "www");

    export async function testIndexHtmlGetsMappedToRoot(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/static1/").expect(200, "<html></html>\n");
    }

    export async function testIndexHtmlGetsServedDirectly_1(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/static1/index.html").expect(200, "<html></html>\n");
    }

    export async function testSubFileServedDirectly(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/static1/sub/file1.txt").expect(200, "othercontents1\n");
    }


    endpoint.static("/static2/", "www", { index: false });

    export async function testIndexHtmlDoesNotGetMappedToRoot_1(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/static2/").expect(404);
    }

    export async function testIndexHtmlGetsServedDirectly_2(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/static2/index.html").expect(200, "<html></html>\n");
    }


    endpoint.static("/static3/", "www", { index: "file1.txt" });

    export async function testIndexHtmlDoesNotGetMappedToRoot_2(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/static3/").expect("Content-Type", "text/plain")
                                                 .expect(200, "contents1\n");
    }

    export async function testIndexHtmlGetsServedDirectly_3(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/static3/index.html").expect(200, "<html></html>\n");
    }

    export async function testFileGetsServedDirectlyEvenWhenIndex(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/static3/file1.txt").expect(200, "contents1\n");
    }


    endpoint.static("/static4/", "www/file1.txt", { contentType: "text/html" });

    export async function testSpecifiedContentType(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/static4/").expect(200, "contents1\n");
        await args.supertest(address).get("/static4/").expect("Content-Type", "text/html");
    }
}

namespace proxyApiTests {
    endpoint.proxy("/google", "http://www.google.com");

    export async function testGoogle1(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/google").expect(200);
    }

    export async function testGoogle2(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/google/").expect(200);
    }

    export async function testGoogle3(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/google/about").expect(301);
    }

    endpoint.proxy("/google", "http://www.google.com/");

    export async function testGoogleSlash1(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/google").expect(200);
    }

    export async function testGoogleSlash2(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/google/").expect(200);
    }

    export async function testGoogleSlash3(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/google/about").expect(301);
    }

}

namespace updateProgramTests {
    endpoint.get("/persistent1", async (req, res) => {
        res.json({ version: 0 });
    });

    export async function testInitialGet(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/persistent1").expect(200, { version: "0" });
        await args.supertest(address).get("/persistent2").expect(404);
    }


    endpoint.static("/persistent3/", "www");

    export async function testStaticGet(args: TestArgs) {
        const address = deployment.url.get();
        await args.supertest(address).get("/persistent3/file1.txt").expect(200, "contents1\n");
        await args.supertest(address).get("/persistent3/file2.txt").expect(400);
    }
}

const deployment = endpoint.publish();

export async function runAllTests(args: TestArgs, result: any): Promise<boolean>{
    args.supertest = require("supertest");

    return await args.harness.testModule(args, result, {
        ["httpEndpointTests.getApiTests"]: getApiTests,
        ["httpEndpointTests.deleteApiTests"]: deleteApiTests,
        ["httpEndpointTests.postApiTests"]: postApiTests,
        ["httpEndpointTests.staticApiTests"]: staticApiTests,
        ["httpEndpointTests.proxyApiTests"]: proxyApiTests,
        ["httpEndpointTests.updateProgramTests"]: updateProgramTests,
    });
}

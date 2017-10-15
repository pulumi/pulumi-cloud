// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";
pulumi.runtime.setConfig("cloud:config:provider", "mock");

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as chai from "chai";
import * as supertest from "supertest";

declare module "assert" {
    function throwsAsync(body: () => Promise<void>): Promise<void>;
}

(<any>assert).throwsAsync = async function(body: () => Promise<void>): Promise<void> {
    try {
        await body();
    }
    catch (err) {
        return;
    }

    throw new Error("Expected error to be thrown");
};

describe("HttpEndpoint", () => {
    let uniqueId = 0;

    describe("#new()", () => {
        it("should-throw-when-name-is-already-in-use", () => {
            const app = new cloud.HttpEndpoint("");
            assert.throws(() => new cloud.HttpEndpoint(""));
        });
    });

    describe("#get()", () => {
        it("Is get method", async function () {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.get("/", function (req, res) {
                assert.equal(req.method, "GET");
                res.status(200).write("ok").end();
            });

            const address = await app.publish().url;
            await supertest(address).get("/").expect(200);
        });

        it("Responds to /", async function () {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.get("/", function (req, res) {
                res.status(200).write("ok").end();
            });

            const address = await app.publish().url;
            await supertest(address).get("/").expect(200);
        });

        it("404 for anything else", async () => {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.get("/", function (req, res) {
                res.status(200).write("ok").end();
            });

            const address = await app.publish().url;
            await supertest(address).get("/frob").expect(404);
        });

        it("Does not call second handler unless requested", async () => {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.get("/", function (req, res, next) {
                res.status(200).write("ok").end();
            },
            function (req, res) {
                throw new Error("Should not have been called");
            });

            const address = await app.publish().url;
            await supertest(address).get("/").expect(200);
        });

        it("Does call second handler when requested", async () => {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.get("/", function (req, res, next) {
                next();
            },
            function (req, res) {
                res.status(200).write("ok").end();
            });

            const address = await app.publish().url;
            await supertest(address).get("/").expect(200);
        });

        it("Can call into default handler", async () => {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.get("/", function (req, res, next) {
                res.status(200).write("ok").end();
                next();
            });

            const address = await app.publish().url;
            await supertest(address).get("/").expect(200);
        });

        it("Can get parameters", async () => {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.get("/goo", function (req, res, next) {
                assert.equal(req.query.name, "baz");
                assert.equal(req.query.color, "purple");
                res.status(200).write("ok").end();
            });

            const address = await app.publish().url;
            await supertest(address).get("/goo?name=baz&color=purple").expect(200);
        });

        it("Can get array parameters", async () => {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.get("/goo", function (req, res, next) {
                assert.deepEqual(req.query["name"], ["baz", "quux"]);
                res.status(200).write("ok").end();
            });

            const address = await app.publish().url;
            await supertest(address).get("/goo?name[]=baz&name[]=quux").expect(200);
        });

        it("Can get body", async () => {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.get("/", function (req, res, next) {
                res.status(200).write("ok").end();
            });

            const address = await app.publish().url;
            await supertest(address).get("/").expect("ok");
        });

        it("Can get headers", async () => {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.get("/", function (req, res, next) {
                assert.equal(req.headers.customheader, "value");
                res.status(200).write("ok").end();
            });

            const address = await app.publish().url;
            await supertest(address).get("/").set({ customheader: "value" }).expect(200);
        });
    });

    describe("#post()", () => {
        it ("Is post method", async () => {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.post("/", function (req, res, next) {
                assert.equal(req.method, "POST");
                res.status(200).write("ok").end();
            });

            const address = await app.publish().url;
            await supertest(address).post("/").send("body-content").expect(200);
        });

        it ("Can get post body", async () => {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.post("/", function (req, res, next) {
                assert.equal(req.body.toString(), "body-content");
                res.status(200).write("ok").end();
            });

            const address = await app.publish().url;
            await supertest(address).post("/").send("body-content").expect(200);
        });
    });

    describe("#delete()", () => {
        it ("Is delete method", async () => {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.delete("/", function (req, res, next) {
                assert.equal(req.method, "DELETE");
                res.status(200).write("ok").end();
            });

            const address = await app.publish().url;
            await supertest(address).delete("/").expect(200);
        });
    });

    describe("#put()", () => {
        it ("Is put method", async () => {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.put("/", function (req, res, next) {
                assert.equal(req.method, "PUT");
                res.status(200).write("ok").end();
            });

            const address = await app.publish().url;
            await supertest(address).put("/").expect(200);
        });

        it ("Can get put body", async () => {
            const app = new cloud.HttpEndpoint("" + uniqueId++);
            app.put("/", function (req, res, next) {
                assert.equal(req.body.toString(), "body-content");
                res.status(200).write("ok").end();
            });

            const address = await app.publish().url;
            await supertest(address).put("/").send("body-content").expect(200);
        });
    });
});

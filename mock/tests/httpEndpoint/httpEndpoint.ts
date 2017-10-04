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
    describe("#get()", () => {
        it("Is get method", async function () {
            let app = new cloud.HttpEndpoint("_");
            app.get("/", function (req, res) {
                assert.equal(req.method, "GET");
                res.status(200).write("ok").end();
            });

            let address = await app.publish();
            await supertest(address).get("/").expect(200);
        });

        it("Responds to /", async function () {
            let app = new cloud.HttpEndpoint("_");
            app.get("/", function (req, res) {
                res.status(200).write("ok").end();
            });

            let address = await app.publish();
            await supertest(address).get("/").expect(200);
        });

        it("404 for anything else", async () => {
            let app = new cloud.HttpEndpoint("_");
            app.get("/", function (req, res) {
                res.status(200).write("ok").end();
            });

            let address = await app.publish();
            await supertest(address).get("/frob").expect(404);
        });

        it("Does not call second handler unless requested", async () => {
            let app = new cloud.HttpEndpoint("_");
            app.get("/", function (req, res, next) {
                res.status(200).write("ok").end();
            },
            function (req, res) {
                throw new Error("Should not have been called");
            });

            let address = await app.publish();
            await supertest(address).get("/").expect(200);
        });

        it("Does call second handler when requested", async () => {
            let app = new cloud.HttpEndpoint("_");
            app.get("/", function (req, res, next) {
                next();
            },
            function (req, res) {
                res.status(200).write("ok").end();
            });

            let address = await app.publish();
            await supertest(address).get("/").expect(200);
        });

        it("Can call into default handler", async () => {
            let app = new cloud.HttpEndpoint("_");
            app.get("/", function (req, res, next) {
                res.status(200).write("ok").end();
                next();
            });

            let address = await app.publish();
            await supertest(address).get("/").expect(200);
        });

        it("Can get parameters", async () => {
            let app = new cloud.HttpEndpoint("_");
            app.get("/goo", function (req, res, next) {
                assert.equal(req.query.name, "baz");
                assert.equal(req.query.color, "purple");
                res.status(200).write("ok").end();
            });

            let address = await app.publish();
            await supertest(address).get("/goo?name=baz&color=purple").expect(200);
        });

        it("Can get array parameters", async () => {
            let app = new cloud.HttpEndpoint("_");
            app.get("/goo", function (req, res, next) {
                assert.deepEqual(req.query["name"], ["baz", "quux"]);
                res.status(200).write("ok").end();
            });

            let address = await app.publish();
            await supertest(address).get("/goo?name[]=baz&name[]=quux").expect(200);
        });

        it("Can get body", async () => {
            let app = new cloud.HttpEndpoint("_");
            app.get("/", function (req, res, next) {
                res.status(200).write("ok").end();
            });

            let address = await app.publish();
            await supertest(address).get("/").expect("ok");
        });

        it("Can get headers", async () => {
            let app = new cloud.HttpEndpoint("_");
            app.get("/", function (req, res, next) {
                assert.equal(req.headers.customheader, "value");
                res.status(200).write("ok").end();
            });

            let address = await app.publish();
            await supertest(address).get("/").set({ customheader: "value" }).expect(200);
        });
    });

    describe("#post()", () => {
        it ("Is post method", async () => {
            let app = new cloud.HttpEndpoint("_");
            app.post("/", function (req, res, next) {
                assert.equal(req.method, "POST");
                res.status(200).write("ok").end();
            });

            let address = await app.publish();
            await supertest(address).post("/").send("body-content").expect(200);
        });

        it ("Can get post body", async () => {
            let app = new cloud.HttpEndpoint("_");
            app.post("/", function (req, res, next) {
                assert.equal(req.body.toString(), "body-content");
                res.status(200).write("ok").end();
            });

            let address = await app.publish();
            await supertest(address).post("/").send("body-content").expect(200);
        });
    });

    describe("#delete()", () => {
        it ("Is delete method", async () => {
            let app = new cloud.HttpEndpoint("_");
            app.delete("/", function (req, res, next) {
                assert.equal(req.method, "DELETE");
                res.status(200).write("ok").end();
            });

            let address = await app.publish();
            await supertest(address).delete("/").expect(200);
        });
    });

    describe("#put()", () => {
        it ("Is put method", async () => {
            let app = new cloud.HttpEndpoint("_");
            app.put("/", function (req, res, next) {
                assert.equal(req.method, "PUT");
                res.status(200).write("ok").end();
            });

            let address = await app.publish();
            await supertest(address).put("/").expect(200);
        });

        it ("Can get put body", async () => {
            let app = new cloud.HttpEndpoint("_");
            app.put("/", function (req, res, next) {
                assert.equal(req.body.toString(), "body-content");
                res.status(200).write("ok").end();
            });

            let address = await app.publish();
            await supertest(address).put("/").send("body-content").expect(200);
        });
    });
});

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
    describe("#get", () => {
        it("responds to /", async function () {
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
    });
});

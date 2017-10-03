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
        console.log("Start");
        await body();
    }
    catch (err) {
        console.log("Threw error");
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
    });
});

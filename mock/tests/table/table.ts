// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";
pulumi.runtime.setConfig("cloud:config:provider", "mock");

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as chai from "chai";

describe("Table", () => {
    describe("#get()", () => {

        it("should-throw-with-no-primary-key", async () => {
            let table = new cloud.Table("");
            try {
                await table.get({});
            }
            catch (err) {
                return;
            }

            throw new Error("Expected error to be thrown");
        });

        it("should-throw-with-primary-key-not-present", async () => {
            let table = new cloud.Table("");
            try {
                await table.get({[table.primaryKey]: "val"});
            }
            catch (err) {
                return;
            }

            throw new Error("Expected error to be thrown");
        });

        it("should-find-inserted-value", async () => {
            let table = new cloud.Table("");
            await table.insert({[table.primaryKey]: "val", value: 1});
            assert.equal((await table.get({[table.primaryKey]: "val"})).value, 1);
        });
    });
});

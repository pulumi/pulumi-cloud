// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";
pulumi.runtime.setConfig("cloud:config:provider", "mock");

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as chai from "chai";

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
}

describe("Table", () => {
    let uniqueId = 0;

    describe("#get()", () => {
        it("should-throw-with-no-primary-key", async () => {
            let table = new cloud.Table("table" + uniqueId++);
            await assert.throwsAsync(async () => await table.get({}));
        });

        it("should-throw-with-primary-key-not-present", async () => {
            let table = new cloud.Table("table" + uniqueId++);
            await assert.throwsAsync(async () => await table.get({[table.primaryKey]: "val"}));
        });

        it("should-find-inserted-value", async () => {
            let table = new cloud.Table("table" + uniqueId++);
            await table.insert({[table.primaryKey]: "val", value: 1});
            assert.equal((await table.get({[table.primaryKey]: "val"})).value, 1);
        });

        it("should-not-be-affected-by-query-data", async () => {
            let table = new cloud.Table("table" + uniqueId++);
            await table.insert({[table.primaryKey]: "val", value: 1});
            assert.equal((await table.get({[table.primaryKey]: "val", value: 2})).value, 1);
        });

        it("should-see-second insert", async () => {
            let table = new cloud.Table("table" + uniqueId++);
            await table.insert({[table.primaryKey]: "val", value: 1});
            await table.insert({[table.primaryKey]: "val", value: 2});
            assert.equal((await table.get({[table.primaryKey]: "val", value: 3})).value, 2);
        });

        it("should-not-see-deleted-value", async () => {
            let table = new cloud.Table("table" + uniqueId++);
            await table.insert({[table.primaryKey]: "val", value: 1});
            await table.delete({[table.primaryKey]: "val" });
            await assert.throwsAsync(async () => await table.get({[table.primaryKey]: "val"}));
        });

        it("should-not-see-inserts-to-other-table", async () => {
            let table1 = new cloud.Table("table" + uniqueId++);
            let table2 = new cloud.Table("table" + uniqueId++);

            await table1.insert({[table1.primaryKey]: "val", value: 1});
            await assert.throwsAsync(async () => await table2.get({[table2.primaryKey]: "val"}));
        });
    });

    describe("#update()", () => {
        it("should-only-update-provided-keys", async () => {
            let table = new cloud.Table("table" + uniqueId++);
            await table.insert({[table.primaryKey]: "val", value1: 1, value2: "2"});
            await table.update({[table.primaryKey]: "val" }, {value1: 3});

            assert.equal((await table.get({[table.primaryKey]: "val"})).value1, 3);
            assert.equal((await table.get({[table.primaryKey]: "val"})).value2, "2");
        });
    });

    describe("#scan()", () => {
        it("returns-all-values", async () => {
            let table = new cloud.Table("table" + uniqueId++);
            await table.insert({[table.primaryKey]: "val1", value1: 1, value2: "1"});
            await table.insert({[table.primaryKey]: "val2", value1: 2, value2: "2"});

            let values = await table.scan();
            assert.equal(values.length, 2);

            let value1 = values.find(v => v[table.primaryKey] == "val1");
            let value2 = values.find(v => v[table.primaryKey] == "val2");

            assert.notEqual(value1, value2);
            assert.equal(value1.value1, 1);
            assert.equal(value2.value1, 2);
        });

        it("does-not-return-deleted-value", async () => {
            let table = new cloud.Table("table" + uniqueId++);
            await table.insert({[table.primaryKey]: "val1", value1: 1, value2: "1"});
            await table.insert({[table.primaryKey]: "val2", value1: 2, value2: "2"});
            await table.delete({[table.primaryKey]: "val1"});

            let values = await table.scan();
            assert.equal(values.length, 1);

            let value = values[0];

            assert.equal(value.value1, 2);
        });
    });
});

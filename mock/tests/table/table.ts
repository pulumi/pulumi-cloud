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
        await body();
    }
    catch (err) {
        return;
    }

    throw new Error("Expected error to be thrown");
};

describe("Table", () => {
    let uniqueId = 0;

    describe("#new()", () => {
        it("should-throw-when-name-is-already-in-use", () => {
            const table = new cloud.Table("table");
            assert.throws(() => new cloud.Table("table"));
        });
    });

    describe("#get()", () => {
        it("should-throw-with-no-primary-key", async () => {
            const table = new cloud.Table("table" + uniqueId++);
            await assert.throwsAsync(async () => await table.get({}));
        });

        it("should-return-undefined-with-primary-key-not-present", async () => {
            const table = new cloud.Table("table" + uniqueId++);
            const val = await table.get({[table.primaryKey]: "val"});
            assert.strictEqual(val, undefined);
        });

        it("should-find-inserted-value", async () => {
            const table = new cloud.Table("table" + uniqueId++);
            await table.insert({[table.primaryKey]: "val", value: 1});
            assert.equal((await table.get({[table.primaryKey]: "val"})).value, 1);
        });

        it("should-throw-if-query-does-not-match-schema", async () => {
            const table = new cloud.Table("table" + uniqueId++);
            await table.insert({[table.primaryKey]: "val", value: 1});
            await assert.throwsAsync(async () => await table.get({[table.primaryKey]: "val", value: 2}));
        });

        it("should-see-second insert", async () => {
            const table = new cloud.Table("table" + uniqueId++);
            await table.insert({[table.primaryKey]: "val", value: 1});
            await table.insert({[table.primaryKey]: "val", value: 2});
            assert.equal((await table.get({[table.primaryKey]: "val" })).value, 2);
        });

        it("should-not-see-deleted-value", async () => {
            const table = new cloud.Table("table" + uniqueId++);
            await table.insert({[table.primaryKey]: "val", value: 1});
            await table.delete({[table.primaryKey]: "val" });

            const val = await table.get({[table.primaryKey]: "val"});
            assert.strictEqual(val, undefined);
        });

        it("should-not-see-inserts-to-other-table", async () => {
            const table1 = new cloud.Table("table" + uniqueId++);
            const table2 = new cloud.Table("table" + uniqueId++);

            await table1.insert({[table1.primaryKey]: "val", value: 1});

            const val = await table2.get({[table2.primaryKey]: "val"});
            assert.strictEqual(val, undefined);
        });
    });

    describe("#update()", () => {
        it("should-only-update-provided-keys", async () => {
            const table = new cloud.Table("table" + uniqueId++);
            await table.insert({[table.primaryKey]: "val", value1: 1, value2: "2"});
            await table.update({[table.primaryKey]: "val" }, {value1: 3});

            assert.equal((await table.get({[table.primaryKey]: "val"})).value1, 3);
            assert.equal((await table.get({[table.primaryKey]: "val"})).value2, "2");
        });
    });

    describe("#scan()", () => {
        it("returns-all-values", async () => {
            const table = new cloud.Table("table" + uniqueId++);
            await table.insert({[table.primaryKey]: "val1", value1: 1, value2: "1"});
            await table.insert({[table.primaryKey]: "val2", value1: 2, value2: "2"});

            const values = await table.scan();
            assert.equal(values.length, 2);

            const value1 = values.find(v => v[table.primaryKey] === "val1");
            const value2 = values.find(v => v[table.primaryKey] === "val2");

            assert.notEqual(value1, value2);
            assert.equal(value1.value1, 1);
            assert.equal(value2.value1, 2);
        });

        it("does-not-return-deleted-value", async () => {
            const table = new cloud.Table("table" + uniqueId++);
            await table.insert({[table.primaryKey]: "val1", value1: 1, value2: "1"});
            await table.insert({[table.primaryKey]: "val2", value1: 2, value2: "2"});
            await table.delete({[table.primaryKey]: "val1"});

            const values = await table.scan();
            assert.equal(values.length, 1);

            const value = values[0];

            assert.equal(value.value1, 2);
        });
    });
});

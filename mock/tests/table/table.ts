// Copyright 2016-2018, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as pulumi from "@pulumi/pulumi";
pulumi.runtime.setConfig("cloud:provider", "mock");

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
            const name = "table" + uniqueId++;
            const table = new cloud.Table(name);
            await assert.throwsAsync(async () => await table.get({}));
        });

        it("should-return-undefined-with-primary-key-not-present", async () => {
            const name = "table" + uniqueId++;
            const table = new cloud.Table(name);
            const val = await table.get({id: "val"});
            assert.strictEqual(val, undefined);
        });

        it("should-find-inserted-value", async () => {
            const name = "table" + uniqueId++;
            const table = new cloud.Table(name);
            await table.insert({id: "val", value: 1});
            assert.equal((await table.get({id: "val"})).value, 1);
        });

        it("should-throw-if-query-does-not-match-schema", async () => {
            const name = "table" + uniqueId++;
            const table = new cloud.Table(name);
            await table.insert({id: "val", value: 1});
            await assert.throwsAsync(async () => await table.get({id: "val", value: 2}));
        });

        it("should-see-second insert", async () => {
            const name = "table" + uniqueId++;
            const table = new cloud.Table(name);
            await table.insert({id: "val", value: 1});
            await table.insert({id: "val", value: 2});
            assert.equal((await table.get({id: "val" })).value, 2);
        });

        it("should-not-see-deleted-value", async () => {
            const name = "table" + uniqueId++;
            const table = new cloud.Table(name);
            await table.insert({id: "val", value: 1});
            await table.delete({id: "val" });

            const val = await table.get({id: "val"});
            assert.strictEqual(val, undefined);
        });

        it("should-not-see-inserts-to-other-table", async () => {
            const name1 = "table" + uniqueId++;
            const name2 = "table" + uniqueId++;
            const table1 = new cloud.Table(name1);
            const table2 = new cloud.Table(name2);

            await table1.insert({id: "val", value: 1});

            const val = await table2.get({id: "val"});
            assert.strictEqual(val, undefined);
        });
    });

    describe("#update()", () => {
        it("should-only-update-provided-keys", async () => {
            const name = "table" + uniqueId++;
            const table = new cloud.Table(name);
            await table.insert({id: "val", value1: 1, value2: "2"});
            await table.update({id: "val" }, {value1: 3});

            assert.equal((await table.get({id: "val"})).value1, 3);
            assert.equal((await table.get({id: "val"})).value2, "2");
        });
    });

    describe("#scan()", () => {
        it("returns-all-values", async () => {
            const name = "table" + uniqueId++;
            const table = new cloud.Table(name);
            await table.insert({id: "val1", value1: 1, value2: "1"});
            await table.insert({id: "val2", value1: 2, value2: "2"});

            const values = await table.scan();
            assert.equal(values.length, 2);

            const value1 = values.find(v => v.id === "val1");
            const value2 = values.find(v => v.id === "val2");

            assert.notEqual(value1, value2);
            assert.equal(value1.value1, 1);
            assert.equal(value2.value1, 2);
        });

        it("does-not-return-deleted-value", async () => {
            const name = "table" + uniqueId++;
            const table = new cloud.Table(name);
            await table.insert({id: "val1", value1: 1, value2: "1"});
            await table.insert({id: "val2", value1: 2, value2: "2"});
            await table.delete({id: "val1"});

            const values = await table.scan();
            assert.equal(values.length, 1);

            const value = values[0];

            assert.equal(value.value1, 2);
        });
    });
});

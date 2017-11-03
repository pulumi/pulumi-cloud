// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";

namespace tableTests {
    let uniqueId = 0;
    const table1 = new cloud.Table("tab" + uniqueId++);
    export async function testShouldThrowWithNoPrimaryKey() {
        await assertThrowsAsync(async () => await table1.get({}));
    }

    const table2 = new cloud.Table("tab" + uniqueId++);
    export async function testShouldReturnUndefinedWithPrimaryKeyNotPresent() {
        const val = await table2.get({[table2.primaryKey]: "val"});
        assert.strictEqual(val, undefined);
    }

    const table3 = new cloud.Table("tab" + uniqueId++);
    export async function testShouldFindInsertedValue() {
        await table3.insert({[table3.primaryKey]: "val", value: 1});
        assert.equal((await table3.get({[table3.primaryKey]: "val"})).value, 1);
    }

    const table4 = new cloud.Table("tab" + uniqueId++);
    export async function testShouldThrowIfQueryDoesNotMatchSchema() {
        await table4.insert({[table4.primaryKey]: "val", value: 1});

        assertThrowsAsync(async () => await table4.get({[table4.primaryKey]: "val", value: 2}));
    }

    const table5 = new cloud.Table("tab" + uniqueId++);
    export async function testShouldSeeSecondInsert() {
        await table5.insert({[table5.primaryKey]: "val", value: 1});
        await table5.insert({[table5.primaryKey]: "val", value: 2});
        assert.equal((await table5.get({[table5.primaryKey]: "val" })).value, 2);
    }

    const table6 = new cloud.Table("tab" + uniqueId++);
    export async function testShouldNotSeeDeletedValue() {
        await table6.insert({[table6.primaryKey]: "val", value: 1});
        await table6.delete({[table6.primaryKey]: "val" });

        const val = await table6.get({[table6.primaryKey]: "val"});
        assert.strictEqual(val, undefined);
    }

//         it("should-not-see-inserts-to-other-table", async () => {
//             const table1 = new cloud.Table("table" + uniqueId++);
//             const table2 = new cloud.Table("table" + uniqueId++);

//             await table1.insert({[table1.primaryKey]: "val", value: 1});

//             const val = await table2.get({[table2.primaryKey]: "val"});
//             assert.strictEqual(val, undefined);
//         });
//     });

//     describe("#update()", () => {
//         it("should-only-update-provided-keys", async () => {
//             const table = new cloud.Table("table" + uniqueId++);
//             await table.insert({[table.primaryKey]: "val", value1: 1, value2: "2"});
//             await table.update({[table.primaryKey]: "val" }, {value1: 3});

//             assert.equal((await table.get({[table.primaryKey]: "val"})).value1, 3);
//             assert.equal((await table.get({[table.primaryKey]: "val"})).value2, "2");
//         });
//     });

//     describe("#scan()", () => {
//         it("returns-all-values", async () => {
//             const table = new cloud.Table("table" + uniqueId++);
//             await table.insert({[table.primaryKey]: "val1", value1: 1, value2: "1"});
//             await table.insert({[table.primaryKey]: "val2", value1: 2, value2: "2"});

//             const values = await table.scan();
//             assert.equal(values.length, 2);

//             const value1 = values.find(v => v[table.primaryKey] === "val1");
//             const value2 = values.find(v => v[table.primaryKey] === "val2");

//             assert.notEqual(value1, value2);
//             assert.equal(value1.value1, 1);
//             assert.equal(value2.value1, 2);
//         });

//         it("does-not-return-deleted-value", async () => {
//             const table = new cloud.Table("table" + uniqueId++);
//             await table.insert({[table.primaryKey]: "val1", value1: 1, value2: "1"});
//             await table.insert({[table.primaryKey]: "val2", value1: 2, value2: "2"});
//             await table.delete({[table.primaryKey]: "val1"});

//             const values = await table.scan();
//             assert.equal(values.length, 1);

//             const value = values[0];

//             assert.equal(value.value1, 2);
//         });
//     });
}


const endpoint = new cloud.HttpEndpoint("unittests");

endpoint.get("/unittests", async (req, res) => {
    try {
        const [passed, json] = await runAllTests();
        if (passed) {
            res.json(json);
        }
        else {
            res.status(500).json(json);
        }
    } catch (err) {
        res.status(500).json(errorJSON(err));
    }
});

const deployment = endpoint.publish();
deployment.url.then(u => console.log("Serving at: " + u));

function errorJSON(err: any) {
    const result: any = Object.create(null);
    Object.getOwnPropertyNames(err).forEach(key => result[key] = err[key]);
    return result;
}

async function runAllTests(): Promise<[boolean, any]> {
    let passed = true;
    const result: any = Object.create(null);

    passed = await runTests(tableTests, result) && passed;

    return [passed, result];
}

async function runTests(module: any, result: any) {
    let passed = true;
    for (const name of Object.keys(module)) {
        if (!name.startsWith("test")) {
            continue;
        }

        try {
            await module[name]();
            result[name] = "passed";
        }
        catch (err) {
            passed = false;
            result[name] = errorJSON(err);
        }
    }

    return passed;
}

async function assertThrowsAsync(body: () => Promise<void>): Promise<void> {
    try {
        await body();
    }
    catch (err) {
        return;
    }

    throw new Error("Expected error to be thrown");
}

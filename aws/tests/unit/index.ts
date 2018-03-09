// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as pulumi from "@pulumi/pulumi";
import * as assertModule from "assert";
type AssertType = typeof assertModule;

// import * as harness from "./harness";
// import * as httpEndpointTests from "./httpEndpointTests";
// import * as serviceTests from "./serviceTests";
// import * as tableTests from "./tableTests";

let uniqueId = 0;

namespace basicApiTests {
    const table1 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldThrowWithNoPrimaryKey() {
        await assertThrowsAsync(async () => await table1.get({}));
    }

    const table2 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldReturnUndefinedWithPrimaryKeyNotPresent(assert: AssertType) {
        const val = await table2.get({[table2.primaryKey.get()]: "val"});
        assert.strictEqual(val, undefined);
    }

    const table3 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldFindInsertedValue(assert: AssertType) {
        await table3.insert({[table3.primaryKey.get()]: "val", value: 1});
        assert.equal((await table3.get({[table3.primaryKey.get()]: "val"})).value, 1);
    }

    const table4 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldThrowIfQueryDoesNotMatchSchema() {
        await table4.insert({[table4.primaryKey.get()]: "val", value: 1});
        await assertThrowsAsync(
            async () => await table4.get({[table4.primaryKey.get()]: "val", value: 2}));
    }

    const table5 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldSeeSecondInsert(assert: AssertType) {
        await table5.insert({[table5.primaryKey.get()]: "val", value: 1});
        await table5.insert({[table5.primaryKey.get()]: "val", value: 2});
        assert.equal((await table5.get({[table5.primaryKey.get()]: "val" })).value, 2);
    }

    const table6 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldNotSeeDeletedValue(assert: AssertType) {
        await table6.insert({[table6.primaryKey.get()]: "val", value: 1});
        await table6.delete({[table6.primaryKey.get()]: "val" });

        const val = await table6.get({[table6.primaryKey.get()]: "val"});
        assert.strictEqual(val, undefined);
    }

    const table7 = new cloud.Table("tests-table" + uniqueId++);
    const table8 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldNotSeeInsertsToOtherTable(assert: AssertType) {
        await table7.insert({[table7.primaryKey.get()]: "val", value: 1});

        const val = await table8.get({[table8.primaryKey.get()]: "val"});
        assert.strictEqual(val, undefined);
    }
}

namespace updateApiTests {
    const table1 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldOnlyUpdateProvidedKeys(assert: AssertType) {
        await table1.insert({[table1.primaryKey.get()]: "val", value1: 1, value2: "2"});
        await table1.update({[table1.primaryKey.get()]: "val" }, {value1: 3});

        assert.equal((await table1.get({[table1.primaryKey.get()]: "val"})).value1, 3);
        assert.equal((await table1.get({[table1.primaryKey.get()]: "val"})).value2, "2");
    }
}

namespace scanApiTests {
    const table1 = new cloud.Table("tests-table" + uniqueId++);
    export async function testScanReturnsAllValues(assert: AssertType) {
        await table1.insert({[table1.primaryKey.get()]: "val1", value1: 1, value2: "1"});
        await table1.insert({[table1.primaryKey.get()]: "val2", value1: 2, value2: "2"});

        const values = await table1.scan();
        assert.equal(values.length, 2);

        const value1 = values.find(v => v[table1.primaryKey.get()] === "val1");
        const value2 = values.find(v => v[table1.primaryKey.get()] === "val2");

        assert.notEqual(value1, value2);
        assert.equal(value1.value1, 1);
        assert.equal(value2.value1, 2);
    }

    const table2 = new cloud.Table("tests-table" + uniqueId++);
    export async function testScanDoesNotReturnDeletedValues(assert: AssertType) {
        await table2.insert({[table2.primaryKey.get()]: "val1", value1: 1, value2: "1"});
        await table2.insert({[table2.primaryKey.get()]: "val2", value1: 2, value2: "2"});
        await table2.delete({[table2.primaryKey.get()]: "val1"});

        const values = await table2.scan();
        assert.equal(values.length, 1);

        const value = values[0];

        assert.equal(value.value1, 2);
    }
}

namespace updateProgramTests {
    const table1 = new cloud.Table("tests-persistent-table");
    export async function testPersistentTable() {
        // in v0 of the program we only add data to the table.
        for (let i = 0; i < 10; i++) {
            await table1.insert({[table1.primaryKey.get()]: "" + i, value1: i });
         }
    }
}

async function runAllTableTests(assert: AssertType, result: any): Promise<boolean> {
    return await testModule(assert, result, {
        ["tableTests.basicApiTests"]: basicApiTests,
        ["tableTests.updateApiTests"]: updateApiTests,
        ["tableTests.scanApiTests"]: scanApiTests,
        ["tableTests.updateProgramTests"]: updateProgramTests,
    });
}


const endpoint = new cloud.HttpEndpoint("tests-unittests");

const testFunctions = [
    runAllTableTests,
    // httpEndpointTests.runAllTests,
    // serviceTests.runAllTests,
];


async function testModulesWorker(assert: AssertType): Promise<[boolean, any]> {
    let passed = true;
    const result: any = Object.create(null);

    await Promise.all(testFunctions.map(async (testFn) => {
        passed = await testFn(assert, result) && passed;
    }));

    return [passed, result];
}

// Run each of the `testFunction`s in parallel, each writing their results into `result.
async function testModules(res: cloud.Response) {
    try {
        const assert = require("assert");
        const [passed, json] = await testModulesWorker(assert);
        if (passed) {
            res.json(json);
        }
        else {
            res.status(500).json(json);
        }
    } catch (err) {
        res.status(500).json(errorJSON(err));
    }
}

// Run tests in each submodule of `module` in parallel, writing results into `result`.
async function testModule(assert: AssertType, result: any, module: any): Promise<boolean> {
    let passed = true;

    await Promise.all(Object.keys(module).map(async (moduleName) => {
        passed = await runTests(assert, moduleName, module[moduleName], result) && passed;
    }));

    return passed;
}

// Run each exported test function on `module` sequentially, writing results into `result`.
async function runTests(assert: AssertType, moduleName: string, module: any, result: any) {
    let passed = true;
    for (const name of Object.keys(module)) {
        if (!name.startsWith("test")) {
            continue;
        }

        const fullName = `${moduleName}.${name}`;
        try {
            await module[name](assert);
            result[fullName] = "passed";
        }
        catch (err) {
            passed = false;
            result[fullName] = errorJSON(err);
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

endpoint.get("/unittests", async (req, res) => {
    // console.log();
    try {
        await testModules(res);
    }
    catch (err) {
        res.status(500).json(errorJSON(err));
    }
});

function errorJSON(err: any) {
    const result: any = Object.create(null);
    Object.getOwnPropertyNames(err).forEach(key => result[key] = err[key]);
    return result;
}

const deployment = endpoint.publish();
export let url: pulumi.Output<string> = deployment.url;

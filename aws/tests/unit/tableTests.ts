// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as harness from "./harness";

let uniqueId = 0;

namespace basicApiTests {
    const table1 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldThrowWithNoPrimaryKey() {
        await harness.assertThrowsAsync(async () => await table1.get({}));
    }

    const table2 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldReturnUndefinedWithPrimaryKeyNotPresent() {
        const val = await table2.get({[table2.primaryKey.get()]: "val"});
        assert.strictEqual(val, undefined);
    }

    const table3 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldFindInsertedValue() {
        await table3.insert({[table3.primaryKey.get()]: "val", value: 1});
        assert.equal((await table3.get({[table3.primaryKey.get()]: "val"})).value, 1);
    }

    const table4 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldThrowIfQueryDoesNotMatchSchema() {
        await table4.insert({[table4.primaryKey.get()]: "val", value: 1});

        await harness.assertThrowsAsync(async () => await table4.get({[table4.primaryKey.get()]: "val", value: 2}));
    }

    const table5 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldSeeSecondInsert() {
        await table5.insert({[table5.primaryKey.get()]: "val", value: 1});
        await table5.insert({[table5.primaryKey.get()]: "val", value: 2});
        assert.equal((await table5.get({[table5.primaryKey.get()]: "val" })).value, 2);
    }

    const table6 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldNotSeeDeletedValue() {
        await table6.insert({[table6.primaryKey.get()]: "val", value: 1});
        await table6.delete({[table6.primaryKey.get()]: "val" });

        const val = await table6.get({[table6.primaryKey.get()]: "val"});
        assert.strictEqual(val, undefined);
    }

    const table7 = new cloud.Table("tests-table" + uniqueId++);
    const table8 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldNotSeeInsertsToOtherTable() {
        await table7.insert({[table7.primaryKey.get()]: "val", value: 1});

        const val = await table8.get({[table8.primaryKey.get()]: "val"});
        assert.strictEqual(val, undefined);
    }
}

namespace updateApiTests {
    const table1 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldOnlyUpdateProvidedKeys() {
        await table1.insert({[table1.primaryKey.get()]: "val", value1: 1, value2: "2"});
        await table1.update({[table1.primaryKey.get()]: "val" }, {value1: 3});

        assert.equal((await table1.get({[table1.primaryKey.get()]: "val"})).value1, 3);
        assert.equal((await table1.get({[table1.primaryKey.get()]: "val"})).value2, "2");
    }
}

namespace scanApiTests {
    const table1 = new cloud.Table("tests-table" + uniqueId++);
    export async function testScanReturnsAllValues() {
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
    export async function testScanDoesNotReturnDeletedValues() {
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

export async function runAllTests(result: any): Promise<boolean>{
    return await harness.testModule(result, {
        ["tableTests.basicApiTests"]: basicApiTests,
        ["tableTests.updateApiTests"]: updateApiTests,
        ["tableTests.scanApiTests"]: scanApiTests,
        ["tableTests.updateProgramTests"]: updateProgramTests,
    });
}

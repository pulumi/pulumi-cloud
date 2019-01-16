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

import * as cloud from "@pulumi/cloud";

import * as assertModule from "assert";
import * as harnessModule from "./harness";
export type TestArgs = { assert: typeof assertModule, harness: typeof harnessModule };

let uniqueId = 0;

namespace basicApiTests {
    const table1 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldThrowWithNoPrimaryKey(args: TestArgs) {
        await args.harness.assertThrowsAsync(async () => await table1.get({}));
    }

    const table2 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldReturnUndefinedWithPrimaryKeyNotPresent(args: TestArgs) {
        if (table2 === undefined || table2 === null) {
            throw new Error("table2 was undefined");
        }

        if (table2.primaryKey === undefined || table2.primaryKey === null) {
            throw new Error("table2.primaryKey was undefined");
        }

        const val = await table2.get({[table2.primaryKey.get()]: "val"});
        args.assert.strictEqual(val, undefined);
    }

    const table3 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldFindInsertedValue(args: TestArgs) {
        await table3.insert({[table3.primaryKey.get()]: "val", value: 1});
        args.assert.equal((await table3.get({[table3.primaryKey.get()]: "val"})).value, 1);
    }

    const table4 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldThrowIfQueryDoesNotMatchSchema(args: TestArgs) {
        await table4.insert({[table4.primaryKey.get()]: "val", value: 1});
        await args.harness.assertThrowsAsync(
            async () => await table4.get({[table4.primaryKey.get()]: "val", value: 2}));
    }

    const table5 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldSeeSecondInsert(args: TestArgs) {
        await table5.insert({[table5.primaryKey.get()]: "val", value: 1});
        await table5.insert({[table5.primaryKey.get()]: "val", value: 2});
        args.assert.equal((await table5.get({[table5.primaryKey.get()]: "val" })).value, 2);
    }

    const table6 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldNotSeeDeletedValue(args: TestArgs) {
        await table6.insert({[table6.primaryKey.get()]: "val", value: 1});
        await table6.delete({[table6.primaryKey.get()]: "val" });

        const val = await table6.get({[table6.primaryKey.get()]: "val"});
        args.assert.strictEqual(val, undefined);
    }

    const table7 = new cloud.Table("tests-table" + uniqueId++);
    const table8 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldNotSeeInsertsToOtherTable(args: TestArgs) {
        await table7.insert({[table7.primaryKey.get()]: "val", value: 1});

        const val = await table8.get({[table8.primaryKey.get()]: "val"});
        args.assert.strictEqual(val, undefined);
    }
}

namespace updateApiTests {
    const table1 = new cloud.Table("tests-table" + uniqueId++);
    export async function testShouldOnlyUpdateProvidedKeys(args: TestArgs) {
        await table1.insert({[table1.primaryKey.get()]: "val", value1: 1, value2: "2"});
        await table1.update({[table1.primaryKey.get()]: "val" }, {value1: 3});

        args.assert.equal((await table1.get({[table1.primaryKey.get()]: "val"})).value1, 3);
        args.assert.equal((await table1.get({[table1.primaryKey.get()]: "val"})).value2, "2");
    }
}

namespace scanApiTests {
    const table1 = new cloud.Table("tests-table" + uniqueId++);
    export async function testScanReturnsAllValues(args: TestArgs) {
        await table1.insert({[table1.primaryKey.get()]: "val1", value1: 1, value2: "1"});
        await table1.insert({[table1.primaryKey.get()]: "val2", value1: 2, value2: "2"});

        const values = await table1.scan();
        args.assert.equal(values.length, 2);

        const value1 = values.find(v => v[table1.primaryKey.get()] === "val1");
        const value2 = values.find(v => v[table1.primaryKey.get()] === "val2");

        args.assert.notEqual(value1, value2);
        args.assert.equal(value1.value1, 1);
        args.assert.equal(value2.value1, 2);
    }

    const table2 = new cloud.Table("tests-table" + uniqueId++);
    export async function testScanDoesNotReturnDeletedValues(args: TestArgs) {
        await table2.insert({[table2.primaryKey.get()]: "val1", value1: 1, value2: "1"});
        await table2.insert({[table2.primaryKey.get()]: "val2", value1: 2, value2: "2"});
        await table2.delete({[table2.primaryKey.get()]: "val1"});

        const values = await table2.scan();
        args.assert.equal(values.length, 1);

        const value = values[0];

        args.assert.equal(value.value1, 2);
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

export async function runAllTests(args: TestArgs, result: any): Promise<boolean> {
    return await args.harness.testModule(args, result, {
        ["tableTests.basicApiTests"]: basicApiTests,
        ["tableTests.updateApiTests"]: updateApiTests,
        ["tableTests.scanApiTests"]: scanApiTests,
        ["tableTests.updateProgramTests"]: updateProgramTests,
    });
}

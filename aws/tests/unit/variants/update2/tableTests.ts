// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as harness from "./harness";

namespace updateProgramTests {
    const table1 = new cloud.Table("tests-persistent-table");
    export async function testPersistentTable() {
        // in v2 of the program make sure only half the data is still there.
        for (let i = 0; i < 10; i++) {
            const result = await table1.get({[table1.primaryKey.get()]: "" + i });
            if (i % 2 === 0) {
                assert.equal(undefined, result);
            }
            else {
                if (!result) {
                    throw new Error(`Didn't retrieve result.  PrimaryKey is '${table1.primaryKey.get()}' i='${i}'`)
                }
                assert.equal(result.value1, i);
            }
        }
    }
}

export async function runAllTests(result: any): Promise<boolean>{
    return await harness.testModule(result, {
        ["tableTests.updateProgramTests"]: updateProgramTests,
    });
}

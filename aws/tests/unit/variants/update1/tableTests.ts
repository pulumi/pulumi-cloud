// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as harness from "./harness";

namespace updateProgramTests {
    const table1 = new cloud.Table("tests:persistent-table");
    export async function testPersistentTable() {
        // in v1 of the program make sure the data is still there.
        for (let i = 0; i < 10; i++) {
            const result = await table1.get({[table1.primaryKey]: "" + i });
            assert.equal(result.value1, i);
        }

        // now delete half the data.
        for (let i = 0; i < 10; i += 2) {
            await table1.delete({[table1.primaryKey]: "" + i });
        }
    }
}

export async function runAllTests(result: any): Promise<boolean>{
    return await harness.testModule(result, {
        ["tableTests.updateProgramTests"]: updateProgramTests,
    });
}

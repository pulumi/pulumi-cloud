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

namespace updateProgramTests {
    const table1 = new cloud.Table("tests-persistent-table");
    export async function testPersistentTable(args: TestArgs) {
        // in v1 of the program make sure the data is still there.
        for (let i = 0; i < 10; i++) {
            const result = await table1.get({[table1.primaryKey.get()]: "" + i });
            if (!result) {
                throw new Error(`Didn't retrieve result.  PrimaryKey is '${table1.primaryKey.get()}' i='${i}'`)
            }
            args.assert.equal(result.value1, i);
        }

        // now delete half the data.
        for (let i = 0; i < 10; i += 2) {
            await table1.delete({[table1.primaryKey.get()]: "" + i });
        }
    }
}

export async function runAllTests(args: TestArgs, result: any): Promise<boolean>{
    return await args.harness.testModule(args, result, {
        ["tableTests.updateProgramTests"]: updateProgramTests,
    });
}

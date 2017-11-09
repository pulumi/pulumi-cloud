// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as harness from "./harness";

namespace updateProgramTests {
    const table1 = new cloud.Table("persistent_table");
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

const endpoint = new cloud.HttpEndpoint("unittests");

endpoint.get("/unittests", async (req, res) => {
    await harness.runUnitTests(res, {
        ["tableTests.updateProgramTests"]: updateProgramTests,
    });
});

const deployment = endpoint.publish();
deployment.url.then(u => console.log("Serving at: " + u));

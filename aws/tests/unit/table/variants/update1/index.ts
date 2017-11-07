// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";

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

    passed = await runTests("tableTests.updateProgramTests", updateProgramTests, result) && passed;

    return [passed, result];
}

async function runTests(moduleName: string, module: any, result: any) {
    let passed = true;
    for (const name of Object.keys(module)) {
        if (!name.startsWith("test")) {
            continue;
        }

        const fullName = `${moduleName}.${name}`;
        try {
            await module[name]();
            result[fullName] = "passed";
        }
        catch (err) {
            passed = false;
            result[fullName] = errorJSON(err);
        }
    }

    return passed;
}

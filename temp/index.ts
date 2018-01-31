// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import { ucs2 } from "punycode";

// const table1 = new cloud.Table("tests-persistent-table");
// export async function testPersistentTable() {
//     // in v0 of the program we only add data to the table.
//     for (let i = 0; i < 10; i++) {
//         await table1.insert({[table1.primaryKey.get()]: "" + i, value1: i });
//     }
//     return "original pass succeeded"
// }


// const table1 = new cloud.Table("tests-persistent-table");
// export async function testPersistentTable() {
//     // in v1 of the program make sure the data is still there.
//     for (let i = 0; i < 10; i++) {
//         const result = await table1.get({[table1.primaryKey.get()]: "" + i });
//         if (!result) {
//             throw new Error("Didn't get back result for: '" + table1.primaryKey.get() + "' - '" + i + "'");
//         }
//         if (result.value1 !== i) {
//             throw new Error("value mismatch");
//         }
//         // assert.equal(result.value1, i);
//     }

//     // now delete half the data.
//     for (let i = 0; i < 10; i += 2) {
//         await table1.delete({[table1.primaryKey.get()]: "" + i });
//     }
//      return "update 1 succeeded";
// }


const table1 = new cloud.Table("tests-persistent-table");
export async function testPersistentTable() {
    // in v2 of the program make sure only half the data is still there.
    for (let i = 0; i < 10; i++) {
        const result = await table1.get({[table1.primaryKey.get()]: "" + i });
        if (i % 2 === 0) {
            if (result !== undefined) {
                throw new Error("expected undefined, got: " + JSON.stringify(result));
            }
        }
        else {
            if (result === undefined) {
                throw new Error("got undefined for '" + table1.primaryKey.get() + "' - '" + i + "'");
            }

            if (result.value1 !== i) {
                throw new Error("value mismatch");
            }
        }
    }

    return "update2 succeeded";
}

export function errorJSON(err: any) {
    const result: any = Object.create(null);
    Object.getOwnPropertyNames(err).forEach(key => result[key] = err[key]);
    return result;
}

var ep = new cloud.HttpEndpoint("ep");
ep.get("/foo", async(req, res) => {
    try {
        const message = await testPersistentTable();
        res.status(200);
        res.json(message);
    } catch (err) {
        res.status(500).json(errorJSON(err));
    }
});
export let deployment: any = ep.publish().url

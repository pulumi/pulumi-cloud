// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";

const table1 = new cloud.Table("tests-persistent-table");
export async function testPersistentTable() {
    // in v0 of the program we only add data to the table.
    for (let i = 0; i < 10; i++) {
        await table1.insert({[table1.primaryKey.get()]: "" + i, value1: i });
    }
}

var ep = new cloud.HttpEndpoint("ep");
ep.get("/foo", async() => {
    await testPersistentTable();
});
ep.publish();

/*
    const table1 = new cloud.Table("tests-persistent-table");
    export async function testPersistentTable() {
        // in v1 of the program make sure the data is still there.
        for (let i = 0; i < 10; i++) {
            const result = await table1.get({[table1.primaryKey.get()]: "" + i });
            assert.equal(result.value1, i);
        }

        // now delete half the data.
        for (let i = 0; i < 10; i += 2) {
            await table1.delete({[table1.primaryKey.get()]: "" + i });
        }
    }
*/

/*
    const table1 = new cloud.Table("tests-persistent-table");
    export async function testPersistentTable() {
        // in v2 of the program make sure only half the data is still there.
        for (let i = 0; i < 10; i++) {
            const result = await table1.get({[table1.primaryKey.get()]: "" + i });
            if (i % 2 === 0) {
                assert.equal(undefined, result);
            }
            else {
                assert.equal(result.value1, i);
            }
        }
    }
*/

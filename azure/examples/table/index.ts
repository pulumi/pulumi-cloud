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
import * as pulumi from "@pulumi/pulumi";

const bucket = new cloud.Bucket("myBucket");
const table = new cloud.Table("myTable");

bucket.onPut("myPutHandler", async (args) => {
    console.log(JSON.stringify(args));

    await table.insert({ [table.primaryKey.get()]: "1", first: "James", last: "Smith", age: 21, enabled: false, now: new Date(), raw: new Buffer("raw1") });
    await table.insert({ [table.primaryKey.get()]: "2", first: "Maria", last: "Garcia", age: 25, enabled: true, then: new Date(0), raw: new Buffer("raw2") });

    const get1 = await table.get({ [table.primaryKey.get()]: "1" });
    console.log("Get1: " + JSON.stringify(get1));
    console.log("typeof first === 'string'      : " + (typeof get1.first === "string"));
    console.log("typeof last === 'string'       : " + (typeof get1.last === "string"));
    console.log("typeof age === 'number'        : " + (typeof get1.age === "number"));
    console.log("typeof enabled === 'boolean'   : " + (typeof get1.enabled === "boolean"));
    console.log("now instanceof Date            : " + (get1.now instanceof Date));
    console.log("Buffer.isBuffer(raw)           : " + Buffer.isBuffer(get1.raw));

    const get2 = await table.get({ [table.primaryKey.get()]: "1" });
    console.log("Get2: " + JSON.stringify(get2));

    await table.update({ [table.primaryKey.get()]: "1" }, { age: 30 });
    const get3 = await table.get({ [table.primaryKey.get()]: "1" });
    console.log("Get3: " + JSON.stringify(get3));

    const scan1 = await table.scan();
    console.log("Scan1: " + JSON.stringify(scan1));

    await table.delete({ [table.primaryKey.get()]: "1"});

    const scan2 = await table.scan();
    console.log("Scan2: " + JSON.stringify(scan2));

    let gotError = false;
    try {
        const get4 = await table.get({ [table.primaryKey.get()]: "1" });
    }
    catch (err) {
        console.log("get4 failed (this is good!)")
        gotError = true;
    }

    if (!gotError) {
        console.log("get4 did not fail (this is bad!)")
    }
});

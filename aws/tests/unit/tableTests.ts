// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as pulumi from "pulumi";

// describe("Table", () => {
//     let uniqueId = 0;

//     describe("#new()", () => {
//         it("should-throw-when-name-is-already-in-use", () => {
//             const table = new cloud.Table("table");
//             assert.throws(() => new cloud.Table("table"));
//         });
//     });

//     describe("#get()", () => {
//         it("should-throw-with-no-primary-key", async () => {
//             const table = new cloud.Table("table" + uniqueId++);
//             await assert.throwsAsync(async () => await table.get({}));
//         });


// });

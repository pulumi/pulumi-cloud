// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";

import * as assertModule from "assert";
import * as supertestModule from "supertest";
import * as harnessModule from "./harness";

export type TestArgs = {
    assert: typeof assertModule,
    harness: typeof harnessModule,
    supertest: typeof supertestModule,
};

let uniqueId = 0;

namespace basicTests {
    const str = "Hello 😀";

    const bucket1 = new cloud.Bucket("tests-bucket" + uniqueId++);
    export async function testGetAfterPut(args: TestArgs) {
        await bucket1.put("somekey", Buffer.from(str, "utf-8"));
        const buffer = await bucket1.get("somekey");
        args.assert.equal(buffer.toString("utf-8"), str);
        await bucket1.delete("somekey");
    }

    const bucket2 = new cloud.Bucket("tests-bucket" + uniqueId++);
    bucket2.onPut("handler", async (putEvent) => {
        // Write a new blob to the bucket with the putEvent data so that we can read and verify it.
        await bucket2.put("testcomplete.json", Buffer.from(JSON.stringify(putEvent)));
    }, {keyPrefix: "folder"});
    export async function testOnPut(args: TestArgs) {
        // Write an object to the bucket.
        await bucket2.put("folder/foo", Buffer.from(str, "utf-8"));
        
        // Wait for 10 seconds for the `onPut` handler to get invoked.
        await new Promise(resolve => setTimeout(resolve, 10000));
        
        // Read the testcomlete.json object created by the onPut handler
        const testCompleteBuffer = await pollBucket(bucket2, "testcomplete.json");
        const testCompleteJSON: cloud.BucketHandlerArgs = JSON.parse(testCompleteBuffer.toString("utf-8"));
        args.assert.equal(testCompleteJSON.key, "folder/foo");
        args.assert.equal(testCompleteJSON.size, Buffer.from(str, "utf-8").length);

        // Cleanup
        await bucket2.delete("folder/foo");
        await bucket2.delete("testcomplete.json");
    }

    // Poll a bucket for a given key.
    async function pollBucket(bucket: cloud.Bucket, key: string): Promise<Buffer> {
        let iteration = 0;
        for(;;) {
            try {
                let buf = await bucket.get(key);
                return buf;
            } catch(err) {
                // Sleep for 500ms, then increment iteration counter.
                await new Promise(resolve => setTimeout(resolve, 500));
                if (iteration++ > 10) {
                    throw err;
                }
            }
        }
    }

}
export async function runAllTests(args: TestArgs, result: any): Promise<boolean> {
    return await args.harness.testModule(args, result, {
        ["bucketTests.basicTests"]: basicTests,
    });
}

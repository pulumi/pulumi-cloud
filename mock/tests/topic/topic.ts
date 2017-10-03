// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";
pulumi.runtime.setConfig("cloud:config:provider", "mock");

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as chai from "chai";
// import { awaitOutstandingAsynchronousRequests } from "../../topic";

declare module "assert" {
    function throwsAsync(body: () => Promise<void>): Promise<void>;
}

(<any>assert).throwsAsync = async function(body: () => Promise<void>): Promise<void> {
    try {
        console.log("Start");
        await body();
    }
    catch (err) {
        console.log("Threw error");
        return;
    }

    throw new Error("Expected error to be thrown");
};

describe("Topic", () => {
    let uniqueId = 0;

    describe("#subscribe()", () => {
        it("should-see-published-value", async () => {
            let topic = new cloud.Topic<number>("topic" + uniqueId++);

            let numbers: number[] = [];
            let resolve: () => void;
            let promise = new Promise((res, reject) => resolve = res);

            topic.subscribe("", num => {
                numbers.push(num);
                resolve();
                return Promise.resolve();
            });

            topic.publish(10);
            await promise;

            assert.equal(1, numbers.length);
            assert.equal(10, numbers[0]);
        });
    });
});

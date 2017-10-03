// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";
pulumi.runtime.setConfig("cloud:config:provider", "mock");

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as chai from "chai";

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

        it("should-not-see-published-value-to-different-topic", async () => {
            let topic1 = new cloud.Topic<number>("topic" + uniqueId++);
            let topic2 = new cloud.Topic<number>("topic" + uniqueId++);

            let resolve: () => void;
            let promise = new Promise((res, reject) => resolve = res);

            topic1.subscribe("", num => {
                throw new Error("Should not get called");
            });

            topic2.subscribe("", num => {
                resolve();
                return Promise.resolve();
            });

            topic2.publish(10);
            await promise;
        });

        it("multiple-subscribers-should-all-see-published-value", async () => {
            let topic1 = new cloud.Topic<number>("topic" + uniqueId++);

            let numbers: number[] = [];
            let resolve1: () => void;
            let promise1 = new Promise((res, reject) => resolve1 = res);

            topic1.subscribe("", num => {
                numbers.push(num);
                resolve1();
                return Promise.resolve();
            });

            let resolve2: () => void;
            let promise2 = new Promise((res, reject) => resolve2 = res);

            topic1.subscribe("", num => {
                numbers.push(num);
                resolve2();
                return Promise.resolve();
            });

            topic1.publish(10);

            const allPromise = Promise.all([promise1, promise2]);
            await allPromise;

            assert.equal(2, numbers.length);
        });

        it("should-see-multiple-values-published", async () => {
            let topic = new cloud.Topic<number>("topic" + uniqueId++);

            let numbers: number[] = [];
            let resolve: () => void;
            let promise = new Promise((res, reject) => resolve = res);

            const count = 3;
            topic.subscribe("", num => {
                numbers.push(num);

                if (numbers.length === count) {
                    resolve();
                }

                return Promise.resolve();
            });

            for (let i = 0; i < count; i++) {
                topic.publish(i);
            }
            await promise;

            assert.equal(count, numbers.length);
            assert.deepEqual([0, 1, 2], numbers);
        });
    });
});

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

import * as pulumi from "@pulumi/pulumi";
pulumi.runtime.setConfig("cloud:provider", "mock");

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as chai from "chai";
// import { awaitOutstandingAsynchronousRequests } from "../../topic";

declare module "assert" {
    function throwsAsync(body: () => Promise<void>): Promise<void>;
}

(<any>assert).throwsAsync = async function(body: () => Promise<void>): Promise<void> {
    try {
        await body();
    }
    catch (err) {
        return;
    }

    throw new Error("Expected error to be thrown");
};

describe("Topic", () => {
    let uniqueId = 0;

    describe("#new()", () => {
        it("should-throw-when-name-is-already-in-use", () => {
            const topic = new cloud.Topic("topic");
            assert.throws(() => new cloud.Topic("topic"));
        });
    });

    describe("#subscribe()", () => {
        it("should-throw-when-name-is-already-in-use", () => {
            const topic = new cloud.Topic("topic" + uniqueId++);
            topic.subscribe("", x => Promise.resolve());
            assert.throws(() => topic.subscribe("", x => Promise.resolve()));
        });

        it("should-see-published-value", async () => {
            const topic = new cloud.Topic<number>("topic" + uniqueId++);

            const numbers: number[] = [];
            let resolve: () => void;
            const promise = new Promise((res, reject) => resolve = res);

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
            const topic1 = new cloud.Topic<number>("topic" + uniqueId++);
            const topic2 = new cloud.Topic<number>("topic" + uniqueId++);

            let resolve: () => void;
            const promise = new Promise((res, reject) => resolve = res);

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
            const topic1 = new cloud.Topic<number>("topic" + uniqueId++);

            const numbers: number[] = [];
            let resolve1: () => void;
            const promise1 = new Promise((res, reject) => resolve1 = res);

            topic1.subscribe("1", num => {
                numbers.push(num);
                resolve1();
                return Promise.resolve();
            });

            let resolve2: () => void;
            const promise2 = new Promise((res, reject) => resolve2 = res);

            topic1.subscribe("2", num => {
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
            const topic = new cloud.Topic<number>("topic" + uniqueId++);

            const numbers: number[] = [];
            let resolve: () => void;
            const promise = new Promise((res, reject) => resolve = res);

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

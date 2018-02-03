// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import { Dependency } from "pulumi";
import * as metrics from "datadog-metrics";

// Harness and tests for measuring perf of the @pulumi/cloud-aws implementation of the @pulumi/cloud
// api.  The harness works by exposing two http endpoints for our travis build to hit when running
// tests.  Because http endpoints only have 30 seconds to run, and because performance tests might
// need to run for far longer, we don't do the perf work in the first endpoint.  Instead, we use a
// topic to publish a set of tests to run.  These tests can then all run independently in AWS
// lambdas, getting up to 5 minutes to run each.  After publishing this work, the first endpoint can
// just return.  At that point, the testing harness can then poll the second endpoint
// /check-performance-tests to see if they have completed.
//
// Perf tests themselves are just pulumi application code that can run inside timer blocks
// (currently we use datadog-metrics to do the timing).  These timer blocks will then be reported to
// the monitoring service when the test finishes.  This provides us with avg, min, max, counts, and
// percentiles that we can then track and monitor for any metric we care about.

interface TestInfo { name: string; apiKey: string; appKey: string; }

// For any given test name, records if the test passed, and how long it took to run. The length of
// time is only recorded here to report back to the test runner on travis just so people can see the
// time there.  The full gamut of perf numbers recorded are sent to the monitoring service directly.
interface TestResults { [name: string]: [/*passed*/ boolean, /*testTime:*/ number]; }

// We use a table here to effectively store a single value containing the results of our tests
// runs.  this allows all our kicked off lambdas to record their results back to a central location
// so that /check-performance-tests can see if they've completed or not.
const testResultTable = new cloud.Table("tests-results");
const testResultKey = { id: "0" };

// A table used by the actual tests, not by the test harness itself.
const table = new cloud.Table("tests-table");

// The set of tests we want to run.  It maps from the name of the test to the test function to call
// and the number of times to call it.
const tests: {[name: string]: [(record: boolean) => Promise<number>, number]} = {
    tableTests: [testTablePerformance, /*repeat*/ 20],
    httpEndpointTests: [testHttpEndpointPerformance, /*repeat*/ 2],
};

// The topic we use to push all the tests we want to run to.  Each test will then run in its own
// AWS lambda.
const topic = new cloud.Topic<TestInfo>("tests-topic");
topic.subscribe("performance", async(info: TestInfo) => {
    // We've been asked to run a test.  Get the test function to call and the number of times to
    // call it.
    const testName = info.name;
    const testFunction = tests[testName][0];
    const repeat = tests[testName][1];

    // Initialize the metrics object that will collect the perf data.
    metrics.init({
        apiKey: info.apiKey,
        appKey: info.appKey,
        prefix: "perf-tests-",
    });

    // Warm things up first.
    await testFunction(false);

    let totalTime = 0;
    for (let i = 0; i < repeat; i++) {
        totalTime += await testFunction(true);
    }

    // Ensure all our perf metrics are uploaded.
    await new Promise((resolve, reject) => {
        metrics.flush(resolve, reject);
    });

    // Mark that this test is completed.
    testResultTable.update(testResultKey, { [testName]: [true, totalTime] });
});

async function recordAndReportTime(record: boolean, name: string, code: () => Promise<void>) {
    const start = process.hrtime();

    await code();

    const duration = process.hrtime(start);

    const ms = (duration[0] * 1000) + (duration[1] / 1000000);

    if (record) {
        metrics.histogram(name, ms);
    }

    return ms;
}

async function testTablePerformance(record: boolean) {
    return await recordAndReportTime(record, "table-all", async() => {
        await testTableInsertPerformance(record);
        await testTableGetPerformance(record);
        await testTableScanPerformance(record);
    });
}

async function testTableScanPerformance(record: boolean) {
    await recordAndReportTime(record, "table-scan", async() => {
        for (let i = 0; i < 20; i++) {
            await table.scan();
        }
    });
}

async function testTableInsertPerformance(record: boolean) {
    await recordAndReportTime(record, "table-insert", async() => {
        for (let i = 0; i < 20; i++) {
            await table.insert({id: "" + i, value: i});
        }
    });
}

async function testTableGetPerformance(record: boolean) {
    await recordAndReportTime(record, "table-get-existing", async() => {
        for (let i = 0; i < 20; i++) {
            await table.get({id: "" + i});
        }
    });

    await recordAndReportTime(record, "table-get-missing", async() => {
        for (let i = 0; i < 20; i++) {
            await table.get({id: "-1"});
        }
    });
}

async function testHttpEndpointPerformance(record: boolean) {
    // todo: actually provide http endpoint tests.
    return await recordAndReportTime(record, "httpEndpoint-all", () => Promise.resolve());
}

// Expose two endpoints for our test harness to interact with.  One to kick off the tests.
// The other to poll to see if tests are complete.
const endpoint = new cloud.HttpEndpoint("tests-performance");

endpoint.get("/start-performance-tests", async (req, res) => {
    try {
        // Initialize all test results to nothing.
        await testResultTable.insert(testResultKey);

        for (const testName of Object.keys(tests)) {
            await testResultTable.update(testResultKey, { [testName]: [false, 0] });
        }

        const apiKey = <string>req.query.DATADOG_API_KEY;
        const appKey = <string>req.query.DATADOG_APP_KEY;

        // Publish all tests to the topic.
        await Promise.all(
            Object.keys(tests).map(name => topic.publish({ name, apiKey, appKey })));

        res.setHeader("Content-Type", "text/html");
        res.end("Performance tests started.");
    }
    catch (err) {
        res.status(500).json(errorJSON(err));
    }
});

endpoint.get("/check-performance-tests", async (req, res) => {
    try {
        const testResults: TestResults = await testResultTable.get(testResultKey);
        const result = Object.create(null);

        for (const testName of Object.keys(tests)) {
            if (!testResults || !testResults[testName]) {
                result.status = result[testName] = "not started";
            }
            else if (!testResults[testName][0]) {
                result.status = result[testName] = "running";
            }
            else {
                result[testName] = testResults[testName][1];
            }
        }

        if (!result.status) {
            result.status = "complete";
        }

        res.json(result);
    }
    catch (err) {
        res.status(500).json(errorJSON(err));
    }
});

function errorJSON(err: any) {
    const result: any = Object.create(null);
    Object.getOwnPropertyNames(err).forEach(key => result[key] = err[key]);
    return result;
}

const deployment = endpoint.publish();
export let url = deployment.url;

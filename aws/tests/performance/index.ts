// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as metrics from "datadog-metrics";

interface TestInfo { name: string; apiKey: string; appKey: string; }
interface TestResults { [name: string]: [/*passed*/ boolean, /*testTime:*/ number]; }

const testResultTable = new cloud.Table("test-results");
const testResultKey = { id: "0" };

const topic = new cloud.Topic<TestInfo>("topic");
const table = new cloud.Table("table");

const tests: {[name: string]: [(record: boolean) => Promise<number>, number]} = {
    tableTests: [testTablePerformance, /*repeat*/ 20],
    httpEndpointTests: [testHttpEndpointPerformance, /*repeat*/ 2],
};

topic.subscribe("test-performance", async(info: TestInfo) => {
    const testName = info.name;
    const testFunction = tests[testName][0];
    const repeat = tests[testName][1];

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

async function testHttpEndpointPerformance(record: boolean) {
    return await recordAndReportTime(record, "httpEndpoint-all", () => Promise.resolve());
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
        await table.scan();
    });
}

async function testTableInsertPerformance(record: boolean) {
    await recordAndReportTime(record, "table-insert", async() => {
        await table.insert({id: "0", value: 0});
    });
}

async function testTableGetPerformance(record: boolean) {
    await recordAndReportTime(record, "table-get-existing", async() => {
        await table.get({id: "0"});
    });

    await recordAndReportTime(record, "table-get-missing", async() => {
        await table.get({id: "-1"});
    });
}


const endpoint = new cloud.HttpEndpoint("performance");

endpoint.get("/start-performance-tests", async (req, res) => {
    try {
        // Initialize all test results.
        await testResultTable.insert(testResultKey);

        for (const testName of Object.keys(tests)) {
            await testResultTable.update(testResultKey, { [testName]: [false, 0] });
        }

        const apiKey = <string>req.query.DATADOG_API_KEY;
        const appKey = <string>req.query.DATADOG_APP_KEY;

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
deployment.url.then(u => console.log("Serving at: " + u));

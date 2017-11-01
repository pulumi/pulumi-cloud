// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as metrics from "datadog-metrics";

const endpoint = new cloud.HttpEndpoint("performance");
const table = new cloud.Table("table");

endpoint.get("/performance", async (req, res) => {
    try {
        res.setHeader("Content-Type", "text/html");

        const apiKey = <string>req.query.DATADOG_API_KEY;
        const appKey = <string>req.query.DATADOG_APP_KEY;

        metrics.init({
            apiKey: apiKey,
            appKey: appKey,
            prefix: "perf-tests-",
        });

        let totalTime = 0;

        // warm things up first
        await testAll(false);

        for (let i = 0; i < 20; i++) {
            totalTime += await testAll(true);
        }

        // Ensure all our perf metrics are uploaded.
        await new Promise((resolve, reject) => {
            metrics.flush(resolve, reject);
        });

        res.end("Perf test completed successfully: " + totalTime);
    } catch (err) {
        res.end("Perf test failed: " + err + "\n" + err.stack);
    }
});

const deployment = endpoint.publish();
deployment.url.then(u => console.log("Serving at: " + u));

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

async function testAll(record: boolean) {
    return await recordAndReportTime(record, "all", async () => {
        await testTablePerformance(record);
    });
}

async function testTablePerformance(record: boolean) {
    await recordAndReportTime(record, "table-all", async() => {
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


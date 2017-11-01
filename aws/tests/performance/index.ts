// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as metricTypes from "datadog-metrics";
import * as debugTypes from "debug";
import * as util from "util";

const endpoint = new cloud.HttpEndpoint("performance");
const table = new cloud.Table("table");

endpoint.get("/performance", async (req, res) => {
    try {
        process.env.DEBUG = "metrics";
        const debug: typeof debugTypes = require("debug");

        let debugLog = "Log never called";
        (<any>debug).log = function () {
            const formatted = util.format.apply(util, eval("arguments")) + "\n";
            debugLog += formatted;
        };

        const metrics: typeof metricTypes = require("datadog-metrics");

        res.setHeader("Content-Type", "text/html");
        metrics.init({
            apiKey: "ff87b4efa3b161051bb2fa8d879e2597",
            appKey: "331ffc1f561a0732d16112a069b9d59f65e406f6",
            prefix: "perf-tests-",
        });

        const logger = new metrics.BufferedMetricsLogger({
            apiKey: "ff87b4efa3b161051bb2fa8d879e2597",
            appKey: "331ffc1f561a0732d16112a069b9d59f65e406f6",
            prefix: "perf-tests-",
            flushIntervalSeconds: 15
        });

        const totalTime = await recordAndReportTime("all", metrics, async () => {
            await testTablePerformance(metrics);
        });

        // Ensure all our perf metrics are uploaded.
        await new Promise((resolve, reject) => {
            metrics.flush(resolve, reject);
        });

        res.end("Perf test completed successfully: " + totalTime + ", " + debugLog);
    } catch (err) {
        res.end("Perf test failed: " + err + "\n" + err.stack);
    }
});

const deployment = endpoint.publish()
deployment.url.then(u => console.log("Serving at: " + u));

async function recordAndReportTime(name: string, metrics: typeof metricTypes, code: () => Promise<void>) {
    const start = process.hrtime();

    await code();

    const duration = process.hrtime(start);

    const ms = (duration[0] * 1000) + (duration[1] / 1000000);
    metrics.histogram(name, ms);

    return ms;
}

async function testTablePerformance(metrics: typeof metricTypes) {
    await recordAndReportTime("table-all", metrics, async() => {
        await testTableInsertPerformance(metrics);
    });
}

async function testTableInsertPerformance(metrics: typeof metricTypes) {
    await recordAndReportTime("table-insert", metrics, async() => {
        const promises: any[] = [];
        for (let i = 0; i < 10; i++) {
            promises.push(table.insert({id: i.toString(), value: i}));
        }

        await Promise.all(promises);
    });
}

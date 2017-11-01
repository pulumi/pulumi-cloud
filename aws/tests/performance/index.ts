// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as metrics from "datadog-metrics";

const endpoint = new cloud.HttpEndpoint("performance");
const table = new cloud.Table("table");
let currentTableId = 0;

endpoint.get("/performance", async (req, res) => {
    try {
        res.setHeader("Content-Type", "text/html");
        metrics.init({
            apiKey: "ff87b4efa3b161051bb2fa8d879e2597",
            appKey: "331ffc1f561a0732d16112a069b9d59f65e406f6",
            prefix: "perf-tests-",
        });

        const totalTime = await recordAndReportTime("all", async () => {
            await testTablePerformance();
        });

        // Ensure all our perf metrics are uploaded.
        await new Promise((resolve, reject) => {
            metrics.flush(resolve, reject);
        });

        res.end("Perf test completed successfully: " + totalTime);
    } catch (err) {
        res.end("Perf test failed: " + err + "\n" + err.stack);
    }
});

const deployment = endpoint.publish()
deployment.url.then(u => console.log("Serving at: " + u));

async function recordAndReportTime(name: string, code: () => Promise<void>) {
    const start = process.hrtime();

    await code();

    const duration = process.hrtime(start);

    const ms = (duration[0] * 1000) + (duration[1] / 1000000);
    metrics.histogram(name, ms);

    return ms;
}

async function testTablePerformance() {
    // warm things up first.
    {
        const promises: any[] = [];
        for (let i = 0; i < 10; i++, currentTableId++) {
            promises.push(table.insert({id: currentTableId.toString(), value: currentTableId}));
        }

        await Promise.all(promises);
    }

    await recordAndReportTime("table-all", async() => {
        await testTableInsertPerformance();
        await testTableGetPerformance();
        await testTableScanPerformance();
    });
}

async function testTableScanPerformance() {
    await recordAndReportTime("table-scan-sequential", async() => {
        for (let i = 0; i < 10; i++) {
            await table.scan();
        }
    });

    await recordAndReportTime("table-scan-parallel", async() => {
        const promises: any[] = [];
        for (let i = 0; i < 10; i++, currentTableId++) {
            promises.push(table.scan());
        }

        await Promise.all(promises);
    });
}

async function testTableInsertPerformance() {
    await recordAndReportTime("table-insert-sequential", async() => {
        for (let i = 0; i < 10; i++, currentTableId++) {
            await table.insert({id: currentTableId.toString(), value: currentTableId});
        }
    });

    await recordAndReportTime("table-insert-parallel", async() => {
        const promises: any[] = [];
        for (let i = 0; i < 10; i++, currentTableId++) {
            promises.push(table.insert({id: currentTableId.toString(), value: currentTableId}));
        }

        await Promise.all(promises);
    });
}

async function testTableGetPerformance() {
    await recordAndReportTime("table-get-sequential-existing", async() => {
        for (let i = 0; i < 10; i++) {
            await table.get({id: i.toString()});
        }
    });

    await recordAndReportTime("table-get-parallel-existing", async() => {
        const promises: any[] = [];
        for (let i = 0; i < 10; i++) {
            promises.push(table.get({id: i.toString()}));
        }

        await Promise.all(promises);
    });

    await recordAndReportTime("table-get-sequential-missing", async() => {
        for (let i = 0; i < 10; i++) {
            await table.get({id: "-1"});
        }
    });

    await recordAndReportTime("table-get-parallel-missing", async() => {
        const promises: any[] = [];
        for (let i = 0; i < 10; i++) {
            promises.push(table.get({id: "-1"}));
        }

        await Promise.all(promises);
    });
}


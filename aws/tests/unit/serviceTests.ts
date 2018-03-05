// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as assert from "assert";
import * as harness from "./harness";
import * as supertest from "supertest";

let uniqueId = 0;

namespace basicTests {
    // Use pre-built Dockerhub image
    const nginx = new cloud.Service("examples-nginx-" + uniqueId++, {
        image: "nginx",
        memory: 128,
        ports: [{ port: 80 }],
    }, {
        replicas: 2,
    });

    // Build and name the resulting image:
    const nginxBuilt = new cloud.Service("examples-pulumiNginx", {
        build: "./app",
        image: "pulumi/nginx",
        memory: 128,
        ports: [{ port: 80 }],
    }, {
        replicas: 2,
    });

    // build some images with custom dockerfiles/args/etc.
    const nginxBuilt2 = new cloud.Service("examples-pulumiNginx2", {
        build: {
            dockerfile: "./app2/Dockerfile-alt",
            args: { "FOO": "bar" },
        },
        memory: 128,
        ports: [{ port: 80 }],
    });

    // Use a pre-built nginx image, and expose it externally via an HTTP application load balancer.
    const nginxOverAppLB = new cloud.Service("examples-nginxOverAppLB", {
        image: "nginx",
        memory: 128,
        ports: [{ port: 80, external: true, protocol: "http" }],
    }, {
        replicas: 2,
    });

    const nginxs = [nginx, nginxBuilt, nginxOverAppLB];

    async function testEndpointShouldExistAndReturn200(endpoint: cloud.Endpoint) {
        console.log(`Testing endpoint at ${endpoint.hostname}:${endpoint.port}`);
        assert.notEqual(endpoint.hostname, undefined);
        assert.notEqual(endpoint.port, undefined);
        await supertest(`http://${endpoint.hostname}:${endpoint.port}/`).get("/").expect(200);
    }

    export async function testAllEndpoints() {
        await Promise.all(nginxs.map(async (naginx) => {
            const endpoint = await nginx.getEndpoint();
            await testEndpointShouldExistAndReturn200(endpoint);
        }));
    }

    const task = new cloud.Task("task-runfailure", {
        image: "nginx",
        memory: 100*1024, // Intentionaly ask for more memory than is available in the cluster to trigger error.
    });

    export async function testTaskRunFailure() {
        await harness.assertThrowsAsync(async () => await task.run());
    }

}

export async function runAllTests(result: any): Promise<boolean>{
    return await harness.testModule(result, {
        ["serviceTests.basicTests"]: basicTests,
    });
}

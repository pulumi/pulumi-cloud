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
    // Use pre-built Dockerhub image
    const nginx = new cloud.Service("examples-nginx-" + uniqueId++, {
        containers: {
            nginx: {
                image: "nginx",
                memory: 128,
                ports: [{ port: 80 }],
            },
        },
        replicas: 2,
    });

    // Build and name the resulting image:
    const nginxBuilt = new cloud.Service("examples-pulumiNginx", {
        containers: {
            nginx: {
                build: "./app",
                image: "pulumi/nginx",
                memory: 128,
                ports: [{ port: 80 }],
            },
        },
        replicas: 2,
    });

    // build some images with custom dockerfiles/args/etc.
    const nginxBuilt2 = new cloud.Service("examples-pulumiNginx2", {
        containers: {
            nginx: {
                build: {
                    dockerfile: "./app2/Dockerfile-alt",
                    args: { "FOO": "bar" },
                },
                memory: 128,
                ports: [{ port: 80 }],
            },
        },
    });

    // Use a pre-built nginx image, and expose it externally via an HTTP application load balancer.
    const nginxOverAppLB = new cloud.Service("examples-nginxOverAppLB", {
        containers: {
            nginx: {
                image: "nginx",
                memory: 128,
                ports: [{ port: 80, external: true, protocol: "http" }],
            },
        },
        replicas: 2,
    });

    const nginxs = [nginx, nginxBuilt, nginxOverAppLB];

    async function testEndpointShouldExistAndReturn200(args: TestArgs, endpoint: cloud.Endpoint) {
        console.log(`Testing endpoint at ${endpoint.hostname}:${endpoint.port}`);
        args.assert.notEqual(endpoint.hostname, undefined);
        args.assert.notEqual(endpoint.port, undefined);
        await args.supertest(`http://${endpoint.hostname}:${endpoint.port}/`).get("/").expect(200);
    }

    export async function testAllEndpoints(args: TestArgs) {
        await Promise.all(nginxs.map(async (naginx) => {
            const endpoint = await nginx.getEndpoint();
            await testEndpointShouldExistAndReturn200(args, endpoint);
        }));
    }

    const task = new cloud.Task("task-runfailure", {
        image: "nginx",
        memory: 100*1024, // Intentionaly ask for more memory than is available in the cluster to trigger error.
    });

    export async function testTaskRunFailure(args: TestArgs) {
        await args.harness.assertThrowsAsync(async () => await task.run());
    }

}

export async function runAllTests(args: TestArgs, result: any): Promise<boolean>{
    return await args.harness.testModule(args, result, {
        ["serviceTests.basicTests"]: basicTests,
    });
}

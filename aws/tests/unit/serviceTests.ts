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

}

export async function runAllTests(args: TestArgs, result: any): Promise<boolean> {
    return await args.harness.testModule(args, result, {
        ["serviceTests.basicTests"]: basicTests,
    });
}

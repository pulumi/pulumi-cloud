// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import { Output } from "@pulumi/pulumi";

// build an anonymous image:
let nginx = new cloud.Service("examples-nginx2", {
    containers: {
        nginx: {
            build: "./app",
            memory: 128,
            ports: [{ port: 80, protocol: "http" }],
        },
    },
    replicas: 2,
});

let cachedNginx = new cloud.Service("examples-cached-nginx", {
    containers: {
        nginx: {
            build: {
                context: "./app",
                cacheFrom: true,
            },
            memory: 128,
            ports: [{port: 80, protocol: "http" }],
        },
    },
    replicas: 2,
});

let multistageCachedNginx = new cloud.Service("examples-multistage-cached-nginx", {
    containers: {
        nginx: {
            build: {
                context: "./app",
                dockerfile: "./app/Dockerfile-multistage",
                cacheFrom: {stages: ["build"]},
            },
            memory: 128,
            ports: [{port: 80, protocol: "http" }],
        },
    },
    replicas: 2,
});


export let nginxEndpoint: Output<string> = nginx.defaultEndpoint.apply(ep => `http://${ep.hostname}:${ep.port}`);

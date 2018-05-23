// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import { Output } from "@pulumi/pulumi";

// build an anonymous image:
let nginx = new cloud.Service("examples-nginx2", {
    containers: {
        nginx: {
            build: "./app",
            memory: 128,
            ports: [{ port: 80 }],
        },
    },
    replicas: 2,
});

export let nginxEndpoint: Output<string> = nginx.defaultEndpoint.apply(ep => `http://${ep.hostname}:${ep.port}`);

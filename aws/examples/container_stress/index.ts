// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";

const config = new pulumi.Config("container-stress:config");
const serviceName: string = config.require("service");
const serviceDockerfile: string = config.require("dockerfile");
const servicePorts: { port: number }[] =
    (config.get("ports") || "").split(",").filter(p => p).map(p => ({ port: parseInt(p) }));
const service = new cloud.Service(serviceName, {
    containers: {
        [serviceName]: {
            build: serviceDockerfile,
            memory: 128,
            ports: servicePorts,
        },
    },
    replicas: 2,
});


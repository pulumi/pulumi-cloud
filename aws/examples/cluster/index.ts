// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as awsinfra from "@pulumi/cloud-aws/infrastructure";
import { Dependency } from "pulumi";

const prefix = "infratest";
const numAvailabilityZones = 2;
const instanceType = "t2.small";

let network = new awsinfra.Network(`${prefix}-net`, {
    numberOfAvailabilityZones: numAvailabilityZones, // Create subnets in many AZs
    privateSubnets: true,                            // Run compute inside private subnets in each AZ
});

const cluster = new awsinfra.Cluster(prefix, {
    minSize: numAvailabilityZones, // Ensure we keep at least one VM per AZ
    network: network,              // The network to provision this cluster inside
    addEFS: false,                 // Don't provision an EFS file system for this cluster
    instanceType: instanceType,    // Use a configured value for cluster VM sizes
});

// Export details of the network and cluster
export let vpcId = network.vpcId;
export let privateSubnetIds = Promise.all(network.subnetIds).then(ids => ids.join(","));
export let publicSubnetIds = Promise.all(network.publicSubnetIds).then(ids => ids.join(","));
export let securityGroupIds = Promise.all(network.securityGroupIds).then(ids => ids.join(","));
export let ecsClusterARN = cluster.ecsClusterARN;
export let ecsClusterSecurityGroup = cluster.securityGroupId;

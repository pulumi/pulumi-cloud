// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as config from "./config";
import { Cluster } from "./infrastructure/cluster";
import { Network } from "./infrastructure/network";

// Whether or not we should run lamabda-based compute in the private network
export let runLambdaInVPC: boolean = config.usePrivateNetwork;

// The network to use for container (and possibly lambda) compute or
// undefined if containers are unsupported and lambdas are being run outsie a
// VPC.
export let network: Network | undefined;

if (config.usePrivateNetwork || config.ecsAutoCluster) {
    // Create a new VPC for this private network or if an ECS cluster needs to be auto-provisioned
    network = new Network(`lukenet`, {
        numberOfAvailabilityZones: 1,
        privateSubnets: config.usePrivateNetwork,
    });
} else if (config.externalVpcId) {
    if (!config.externalSubnets || !config.externalSecurityGroups) {
        throw new Error("If providing 'externalVpcId', must provide 'externalSubnets' and 'externalSecurityGroups'");
    }
    // Use an exsting VPC for this private network
    network = {
        vpcId: Promise.resolve(config.externalVpcId),
        privateSubnets: config.usePrivateNetwork,
        subnetIds: config.externalSubnets.map(s => Promise.resolve(s)),
        publicSubnetIds: config.externalSubnets.map(s => Promise.resolve(s)), // TODO: Do we need separate config?
        securityGroupIds: config.externalSecurityGroups.map(s => Promise.resolve(s)),
    };
} else {
    // Else, we do not need to create a network.
    network = undefined;
}

// The cluster to use for container compute or undefined if containers are
// unsupported.
export let cluster: Cluster | undefined;

if (config.ecsAutoCluster) {
    // If we are asked to provision a cluster, then we will have created a network
    // above - create a cluster in that network.
    cluster = new Cluster(`lukecluster`, {
        network: network!,
        addEFS: true,
        instanceType: config.ecsAutoClusterInstanceType,
        minSize: config.ecsAutoClusterMinSize,
        maxSize: config.ecsAutoClusterMaxSize,
        publicKey: config.ecsAutoClusterPublicKey,
    });
} else if (config.ecsClusterARN) {
    // Else if we have an externally provided cluster and can use that.
    cluster = {
        ecsClusterARN: Promise.resolve(config.ecsClusterARN),
        efsMountPath: config.ecsClusterEfsMountPath,
    };
} else {
    // Else, we do not need to create a cluster.
    cluster = undefined;
}

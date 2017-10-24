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

if (config.usePrivateNetwork && !config.externalVpcId) {
    // Create a new VPC for this private network
    network = new Network(`lukenet`, {
        numberOfAvailabilityZones: 1,
        privateSubnets: true,
    });
} else if (config.externalVpcId && config.externalSubnets && config.externalSecurityGroups) {
    // Use an exsting VPC for this private network
    network = {
        vpcId: Promise.resolve(config.externalVpcId),
        privateSubnets: config.usePrivateNetwork,
        subnetIds: config.externalSubnets.map(s => Promise.resolve(s)),
        publicSubnetIds: config.externalSubnets.map(s => Promise.resolve(s)), // TODO: Do we need separate config?
        securityGroupIds: config.externalSecurityGroups.map(s => Promise.resolve(s)),
    };
} else {
    // Else, we don't use a private network
    network = undefined;
}

// The cluster to use for container compute or undefined if containers are
// unsupported.
export let cluster: Cluster | undefined;

if (!network ) {
    // If we did not get or create a network, then we cannot provide a Cluster
    // for container-based compute.
    cluster = undefined;
} else if (!config.ecsClusterARN) {
    // Else if we have a network, but not an externally provided ClusterARN,
    // create a new Cluster.
    cluster = new Cluster(`lukecluster`, {
        network: network,
    });
} else {
    // Else we have an externally provided cluster and can use that.
    cluster = {
        ecsClusterARN: Promise.resolve(config.ecsClusterARN),
    };
}

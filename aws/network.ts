// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import { externalSecurityGroups, externalSubnets, externalVpcId, usePrivateNetwork } from "./config";
import { Network } from "./infrastructure/network";

// Whether or not we should run lamabda-based compute in the private network
export let runLambdaInVPC: boolean = usePrivateNetwork;

// The network to use for container (and possibly lambda) compute or
// undefined if containers are unsupported and lambdas are being run outsie a
// VPC.
export let network: Network | undefined;

if (usePrivateNetwork && !externalVpcId) {
    // Create a new VPC for this private network
    network = new Network(`lukenet`, {
        numberOfAvailabilityZones: 1,
        privateSubnets: true,
    });
} else if (externalVpcId && externalSubnets && externalSecurityGroups) {
    // Use an exsting VPC for this private network
    network = {
        vpcId: externalVpcId,
        subnetIds: externalSubnets,
        securityGroupIds: externalSecurityGroups,
    };
} else {
    // Else, we don't use a private network
    network = undefined;
}

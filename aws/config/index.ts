// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";

const config = new pulumi.Config("cloud-aws:config");

// TODO[pulumi/pulumi-cloud#134]: We need to clean up the set of options available on `cloud-aws`
// and potentially reduce the dimentionality of the available configuration space.

// Optionally override the Lambda function memory size for all functions.
export let functionMemorySize = config.getNumber("functionMemorySize") || 128;
if (functionMemorySize % 64 !== 0 || functionMemorySize < 128 || functionMemorySize > 1536) {
    throw new Error("Lambda memory size in MiB must be a multiple of 64 between 128 and 1536.");
}

// Optional ECS cluster ARN, subnets and VPC.  If not provided, `Service`s and
// `Task`s are not available for the target environment.
export let ecsClusterARN = config.get("ecsClusterARN");

// Optional EFS mount path on the cluster hosts.  If not provided, `Volumes`
// cannot be used in `Service`s and `Task`s.
export let ecsClusterEfsMountPath = config.get("ecsClusterEfsMountPath");

// Optionally put all compute in a private network with no Internet ingress except
// via explicit HttpEndpoint.
export let usePrivateNetwork = config.getBoolean("usePrivateNetwork") || false;

// Use existing VPC.  If both `usePrivateNetwork` and `externalVpcId` are provided,
// the VPC must be configured to run all compute in private subnets with Internet egress
// enabled via NAT Gateways.
export let externalVpcId = config.get("externalVpcId");

// If using existing VPC, must provide subnets ids for the VPC as a comma-seperated string
const externalSubnetsString = config.get("externalSubnets");
export let externalSubnets: string[] | undefined = undefined;
if (externalSubnetsString) {
    externalSubnets = externalSubnetsString.split(",");
}

// If using existing VPC, must provide securityGroup ids for the VPC as a comma-seperated string
const externalSecurityGroupsString = config.get("externalSecurityGroups");
export let externalSecurityGroups: string[] | undefined = undefined;
if (externalSecurityGroupsString) {
    externalSecurityGroups = externalSecurityGroupsString.split(",");
}

if (externalVpcId && (!externalSubnets || !externalSecurityGroups)) {
    throw new Error(
        "Must configure 'cloud-aws:config:externalSubnets' and 'cloud-aws:config:externalSecurityGroups' " +
        "when setting 'cloud-asws:config:externalVpcId'",
    );
}

// Optionally configure whether to automatically provision an ECS Cluster, and if so, parameters for that cluster.
export let ecsAutoCluster = config.getBoolean("ecsAutoCluster") || false;
export let ecsAutoClusterInstanceType = config.get("ecsAutoClusterInstanceType");
export let ecsAutoClusterMinSize = config.getNumber("ecsAutoClusterMinSize");
export let ecsAutoClusterMaxSize = config.getNumber("ecsAutoClusterMaxSize");
export let ecsAutoClusterPublicKey = config.get("ecsAutoClusterPublicKey");

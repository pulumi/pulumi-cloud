// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as pulumi from "pulumi";
import * as config from "./config";
import { Cluster } from "./infrastructure/cluster";
import { Network } from "./infrastructure/network";

// nameWithStackInfo is the resource prefix we'll use for all resources we auto-provision.  In general,
// it's safe to use these for top-level components like Network and Cluster, because they suffix all
// internal resources they provision.
const nameWithStackInfo = `pulumi-${pulumi.getStack()}`;
export const commonPrefix = nameWithStackInfo;

export function createNameWithStackInfo(suffix: string, trimLength: number) {
    const result = nameWithStackInfo + suffix;
    if (trimLength < 0) {
        return result;
    }

    return result.substr(0, trimLength);
}

// Whether or not we should run lamabda-based compute in the private network
export let runLambdaInVPC: boolean = config.usePrivateNetwork;

// The IAM Role Policies to apply to compute for both Lambda and ECS
const defaultComputePolicies = [
    aws.iam.AWSLambdaFullAccess,                 // Provides wide access to "serverless" services (Dynamo, S3, etc.)
    aws.iam.AmazonEC2ContainerServiceFullAccess, // Required for lambda compute to be able to run Tasks
];
export let computePolicies: aws.ARN[] = config.computeIAMRolePolicyARNs
    ? config.computeIAMRolePolicyARNs.split(",")
    : defaultComputePolicies;

// The network to use for container (and possibly lambda) compute or undefined if containers are unsupported and
// lambdas are being run outsie a VPC.
let network: Network | undefined;
export function getNetwork(): Network | undefined {
    // If no network has been initialized, see if we must lazily allocate one.
    if (!network) {
        if (config.usePrivateNetwork || config.ecsAutoCluster) {
            // Create a new VPC for this private network or if an ECS cluster needs to be auto-provisioned.
            network = new Network(createNameWithStackInfo("-global", -1), {
                privateSubnets: config.usePrivateNetwork,
            });
        } else if (config.externalVpcId) {
            if (!config.externalSubnets || !config.externalSecurityGroups) {
                throw new Error(
                    "If providing 'externalVpcId', must provide 'externalSubnets' and 'externalSecurityGroups'");
            }
            // Use an exsting VPC for this private network
            network = {
                numberOfAvailabilityZones: config.externalSubnets.length,
                vpcId: Promise.resolve(config.externalVpcId),
                privateSubnets: config.usePrivateNetwork,
                subnetIds: config.externalSubnets.map(s => Promise.resolve(s)),
                // TODO: Do we need separate config?
                publicSubnetIds: config.externalSubnets.map(s => Promise.resolve(s)),
                securityGroupIds: config.externalSecurityGroups.map(s => Promise.resolve(s)),
            };
        }
    }
    return network;
}

// The cluster to use for container compute or undefined if containers are unsupported.
let cluster: Cluster | undefined;
export function getCluster(): Cluster | undefined {
    // If no ECS cluster has been initialized, see if we must lazily allocate one.
    if (!cluster) {
        if (config.ecsAutoCluster) {
            // Translate the comma-seperated list into an array or undefined.
            let instanceRolePolicyARNs;
            if  (config.ecsAutoClusterInstanceRolePolicyARNs) {
                instanceRolePolicyARNs = (config.ecsAutoClusterInstanceRolePolicyARNs || "").split(",");
            }
            // If we are asked to provision a cluster, then we will have created a network
            // above - create a cluster in that network.
            cluster = new Cluster(createNameWithStackInfo("-global", -1), {
                network: getNetwork()!,
                addEFS: config.ecsAutoClusterUseEFS === undefined ? true : config.ecsAutoClusterUseEFS,
                instanceType: config.ecsAutoClusterInstanceType,
                instanceRolePolicyARNs: instanceRolePolicyARNs,
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
        }
    }
    return cluster;
}

// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as pulumi from "pulumi";
import { Dependency } from "pulumi";
import * as config from "./config";
import { Cluster } from "./infrastructure/cluster";
import { Network } from "./infrastructure/network";

// nameWithStackInfo is the resource prefix we'll use for all resources we auto-provision.  In general,
// it's safe to use these for top-level components like Network and Cluster, because they suffix all
// internal resources they provision.
const nameWithStackInfo = `pulumi-${pulumi.getStack()}`;

export function createNameWithStackInfo(requiredInfo: string) {
    const maxLength = 24;

    if (requiredInfo.length > maxLength) {
        throw new Error(`'${requiredInfo}' cannot be longer then ${maxLength} characters.`);
    }

    // No required portion.  Just return the stack name.
    if (requiredInfo.length === 0) {
        return nameWithStackInfo.substr(0, maxLength);
    }

    // Only enough room for required portion, don't add the stack.
    // Also don't add the stack if there wouldn't be room to add it and a dash.
    if (requiredInfo.length >= maxLength - "-".length) {
        return requiredInfo;
    }

    // Attempt to keep some portion of the stack, then - then the required part.
    const suffix = "-" + requiredInfo;
    const result = nameWithStackInfo.substr(0, maxLength - suffix.length) + suffix;
    return result;
}

// Expose a common infrastructure resource that all our global resources can consider themselves to
// be parented by.  This helps ensure unique URN naming for these guys as tey cannot conflict with
// any other user resource.
class InfrastructureResource extends pulumi.ComponentResource {
    constructor() {
        super("cloud:global:infrastructure", "global-infrastructure");
    }
}

let globalInfrastructureResource: InfrastructureResource | undefined;
export function getGlobalInfrastructureResource(): pulumi.Resource {
    if (!globalInfrastructureResource) {
        globalInfrastructureResource = new InfrastructureResource();
    }

    return globalInfrastructureResource;
}

// Whether or not we should run lamabda-based compute in the private network
export let runLambdaInVPC: boolean = config.usePrivateNetwork;

// The IAM Role Policies to apply to compute for both Lambda and ECS
const defaultComputePolicies = [
    aws.iam.AWSLambdaFullAccess,                 // Provides wide access to "serverless" services (Dynamo, S3, etc.)
    aws.iam.AmazonEC2ContainerServiceFullAccess, // Required for lambda compute to be able to run Tasks
];
let computePolicies: aws.ARN[] = config.computeIAMRolePolicyARNs
    ? config.computeIAMRolePolicyARNs.split(",")
    : defaultComputePolicies;
let computePoliciesAccessed = false;

// Set the IAM policies to use for compute.
export function setComputeIAMRolePolicies(policyARNs: string[]) {
    if (computePoliciesAccessed) {
        throw new Error(
            "The compute policies have already been used, make sure you are setting IAM policies early enough.");
    }
    computePolicies = policyARNs;
}

// Get the IAM policies to use for compute.
export function getComputeIAMRolePolicies(): aws.ARN[] {
    computePoliciesAccessed = true;
    return computePolicies;
}

// The network to use for container (and possibly lambda) compute or undefined if containers are unsupported and
// lambdas are being run outsie a VPC.
let network: Network | undefined;
export function getNetwork(): Network | undefined {
    // If no network has been initialized, see if we must lazily allocate one.
    if (!network) {
        if (config.usePrivateNetwork || config.ecsAutoCluster) {
            // Create a new VPC for this private network or if an ECS cluster needs to be auto-provisioned.
            network = new Network(createNameWithStackInfo("global"), {
                privateSubnets: config.usePrivateNetwork,
                numberOfAvailabilityZones: config.ecsAutoCluster ? config.ecsAutoClusterNumberOfAZs : undefined,
            });
        } else if (config.externalVpcId) {
            if (!config.externalSubnets || !config.externalSecurityGroups || !config.externalPublicSubnets) {
                throw new Error(
                    "If providing 'externalVpcId', must provide 'externalSubnets', " +
                    "'externalPublicSubnets' and 'externalSecurityGroups'");
            }
            // Use an exsting VPC for this private network
            network = {
                numberOfAvailabilityZones: config.externalSubnets.length,
                vpcId: Dependency.resolve(config.externalVpcId),
                privateSubnets: config.usePrivateNetwork,
                subnetIds: config.externalSubnets.map(s => Dependency.resolve(s)),
                publicSubnetIds: config.externalPublicSubnets.map(s => Dependency.resolve(s)),
                securityGroupIds: config.externalSecurityGroups.map(s => Dependency.resolve(s)),
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
            cluster = new Cluster(createNameWithStackInfo("global"), {
                network: getNetwork()!,
                addEFS: config.ecsAutoClusterUseEFS === undefined ? true : config.ecsAutoClusterUseEFS,
                instanceType: config.ecsAutoClusterInstanceType,
                instanceRolePolicyARNs: instanceRolePolicyARNs,
                instanceRootVolumeSize: config.ecsAutoClusterInstanceRootVolumeSize,
                instanceDockerImageVolumeSize: config.ecsAutoClusterInstanceDockerImageVolumeSize,
                instanceSwapVolumeSize: config.ecsAutoClusterInstanceSwapVolumeSize,
                minSize: config.ecsAutoClusterMinSize,
                maxSize: config.ecsAutoClusterMaxSize,
                publicKey: config.ecsAutoClusterPublicKey,
            });
        } else if (config.ecsClusterARN) {
            // Else if we have an externally provided cluster and can use that.
            cluster = {
                ecsClusterARN: Dependency.resolve(config.ecsClusterARN),
                securityGroupId: Dependency.resolve(config.ecsClusterSecurityGroup),
                efsMountPath: config.ecsClusterEfsMountPath,
            };
        }
    }
    return cluster;
}

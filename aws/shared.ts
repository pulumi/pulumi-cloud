// Copyright 2016-2018, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";
import * as config from "./config";

export interface CloudNetwork extends awsx.ClusterNetworkArgs {
    /**
     * Whether the network includes private subnets.
     */
    readonly usePrivateSubnets: boolean;
    /**
     * The security group IDs for the network.
     */
    readonly securityGroupIds: pulumi.Output<string>[];
    /**
     * The public subnets for the VPC.  In case [usePrivateSubnets] == false, these are the same as [subnets].
     */
    readonly publicSubnetIds: pulumi.Output<string>[];
}

// nameWithStackInfo is the resource prefix we'll use for all resources we auto-provision.  In general,
// it's safe to use these for top-level components like Network and Cluster, because they suffix all
// internal resources they provision.
const nameWithStackInfo = `pulumi-${pulumi.getStack()}`;

export function createNameWithStackInfo(requiredInfo: string) {
    const maxLength = 24;

    if (requiredInfo.length > maxLength) {
        throw new RunError(`'${requiredInfo}' cannot be longer then ${maxLength} characters.`);
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
        this.registerOutputs();
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
        throw new RunError(
            "The compute policies have already been used, make sure you are setting IAM policies early enough.");
    }
    computePolicies = policyARNs;
}

// Get the IAM policies to use for compute.
export function getComputeIAMRolePolicies(): aws.ARN[] {
    computePoliciesAccessed = true;
    return computePolicies;
}

let network: CloudNetwork;

/**
 * Get or create the network to use for container and lambda compute.
 */
export function getOrCreateNetwork(): CloudNetwork {
    if (!network) {
        if (!config.externalVpcId) {
            if (config.usePrivateNetwork) {
                // Create a new VPC for this private network.
                network = new awsx.Network(createNameWithStackInfo("global"), {
                    usePrivateSubnets: config.usePrivateNetwork,
                    numberOfAvailabilityZones: config.ecsAutoCluster ? config.ecsAutoClusterNumberOfAZs : undefined,
                });
            } else {
                // Use the default VPC.
                network = awsx.Network.getDefault();
            }
        } else /* config.externalVpcId */ {
            if (!config.externalSubnets || !config.externalSecurityGroups || !config.externalPublicSubnets) {
                throw new RunError(
                    "If providing 'externalVpcId', must provide 'externalSubnets', " +
                    "'externalPublicSubnets' and 'externalSecurityGroups'");
            }
            // Use an exsting VPC for this private network
            network = awsx.Network.fromVpc("external-vpc", {
                vpcId: config.externalVpcId,
                usePrivateSubnets: config.usePrivateNetwork,
                subnetIds: config.externalSubnets,
                publicSubnetIds: config.externalPublicSubnets,
                securityGroupIds: config.externalSecurityGroups,
            });
        }
    }

    return network;
}

/**
 * @deprecated
 */
export function getNetwork(): CloudNetwork {
    return getOrCreateNetwork();
}

export interface CloudCluster {
    readonly ecsClusterARN: pulumi.Output<string>;
    readonly securityGroupId?: pulumi.Output<string>;
    readonly efsMountPath?: string;
    readonly autoScalingGroupStack?: any;
}

// The cluster to use for container compute or undefined if containers are unsupported.
let cluster: CloudCluster | undefined;
export function getCluster(): CloudCluster | undefined {
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
            cluster = new awsx.Cluster(createNameWithStackInfo("global"), {
                network: getOrCreateNetwork(),
                addEFS: config.ecsAutoClusterUseEFS,
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
                ecsClusterARN: pulumi.output(config.ecsClusterARN),
                securityGroupId: config.ecsClusterSecurityGroup
                    ? pulumi.output(config.ecsClusterSecurityGroup) : undefined,
                efsMountPath: config.ecsClusterEfsMountPath,
            };
        } else if (config.useFargate) {
            // Else, allocate a Fargate-only cluster.
            cluster = new awsx.Cluster(createNameWithStackInfo("global"), {
                network: getOrCreateNetwork(),
                maxSize: 0, // Don't allocate any EC2 instances
                addEFS: false,
            });
        }
    }

    return cluster;
}

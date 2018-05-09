// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as awsinfra from "@pulumi/aws-infra";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";
import * as config from "./config";

export interface CloudNetwork {
    /**
     * The VPC id of the network.
     */
    readonly vpcId: pulumi.Output<string>;
    /**
     * The security group IDs for the network.
     */
    readonly securityGroupIds: pulumi.Output<string>[];
    /**
     * The subnets in which compute should run.  These are the private subnets if [usePrivateSubnets] == true, else
     * these are the public subnets.
     */
    readonly subnetIds: pulumi.Output<string>[];
    /**
     * The public subnets for the VPC.  In case [usePrivateSubnets] == false, these are the same as [subnets].
     */
    readonly publicSubnetIds: pulumi.Output<string>[];
    /**
     * Whether the network includes private subnets.
     */
    readonly usePrivateSubnets: boolean;
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
                network = new awsinfra.Network(createNameWithStackInfo("global"), {
                    usePrivateSubnets: config.usePrivateNetwork,
                    numberOfAvailabilityZones: config.ecsAutoCluster ? config.ecsAutoClusterNumberOfAZs : undefined,
                });
            } else {
                // Use the default VPC.
                network = getDefaultNetwork();
            }
        } else /* config.externalVpcId */ {
            if (!config.externalSubnets || !config.externalSecurityGroups || !config.externalPublicSubnets) {
                throw new RunError(
                    "If providing 'externalVpcId', must provide 'externalSubnets', " +
                    "'externalPublicSubnets' and 'externalSecurityGroups'");
            }
            // Use an exsting VPC for this private network
            network = {
                vpcId: pulumi.output(config.externalVpcId),
                usePrivateSubnets: config.usePrivateNetwork,
                subnetIds: config.externalSubnets.map(s => pulumi.output(s)),
                publicSubnetIds: config.externalPublicSubnets.map(s => pulumi.output(s)),
                securityGroupIds: config.externalSecurityGroups.map(s => pulumi.output(s)),
            };
        }
    }

    return network;
}

/**
 * Gets the default VPC for the AWS account as a Network
 */
function getDefaultNetwork(): CloudNetwork {
    const vpc = aws.ec2.getVpc({default: true});
    const vpcId = vpc.then(v => v.id);
    const subnetIds = aws.ec2.getSubnetIds({ vpcId: vpcId }).then(subnets => subnets.ids);
    const defaultSecurityGroup = aws.ec2.getSecurityGroup({ name: "default", vpcId: vpcId }).then(sg => sg.id);
    const subnet0 = subnetIds.then(ids => ids[0]);
    const subnet1 = subnetIds.then(ids => ids[1]);

    return {
        vpcId: pulumi.output(vpcId),
        subnetIds: [ pulumi.output(subnet0), pulumi.output(subnet1) ],
        usePrivateSubnets: false,
        securityGroupIds: [ pulumi.output(defaultSecurityGroup) ],
        publicSubnetIds: [ pulumi.output(subnet0), pulumi.output(subnet1) ],
    };
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
    readonly autoScalingGroupStack?: pulumi.Resource;
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

            const innerNetwork = getOrCreateNetwork();
            // If we are asked to provision a cluster, then we will have created a network
            // above - create a cluster in that network.
            cluster = new awsinfra.Cluster(createNameWithStackInfo("global"), {
                networkVpcId: innerNetwork.vpcId,
                networkSubnetIds: innerNetwork.subnetIds,
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
            const innerNetwork = getOrCreateNetwork();

            // Else, allocate a Fargate-only cluster.
            cluster = new awsinfra.Cluster(createNameWithStackInfo("global"), {
                networkVpcId: innerNetwork.vpcId,
                networkSubnetIds: innerNetwork.subnetIds,
                maxSize: 0, // Don't allocate any EC2 instances
                addEFS: false,
            });
        }
    }

    return cluster;
}

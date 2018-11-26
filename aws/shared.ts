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
import * as awsinfra from "@pulumi/aws-infra";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";
import * as config from "./config";

import * as utils from "./utils";

export interface CloudNetwork extends awsinfra.ClusterNetworkArgs {
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

let network: awsinfra.Network;

/**
 * Get or create the network to use for container and lambda compute.
 */
export function getOrCreateNetwork(): awsinfra.Network {
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
                network = awsinfra.Network.getDefault();
            }
        } else /* config.externalVpcId */ {
            if (!config.externalSubnets || !config.externalSecurityGroups || !config.externalPublicSubnets) {
                throw new RunError(
                    "If providing 'externalVpcId', must provide 'externalSubnets', " +
                    "'externalPublicSubnets' and 'externalSecurityGroups'");
            }
            // Use an exsting VPC for this private network
            network = awsinfra.Network.fromVpc("external-vpc", {
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

// export interface CloudCluster {
//     readonly ecsClusterARN: pulumi.Output<string>;
//     readonly securityGroupId?: pulumi.Output<string>;
//     readonly efsMountPath?: string;
//     readonly autoScalingGroupStack?: any;
// }

// The cluster to use for container compute or undefined if containers are unsupported.
let cluster: awsinfra.x.Cluster | undefined;
let fileSystem: awsinfra.x.ClusterFileSystem | undefined;
let autoScalingGroup: awsinfra.x.ClusterAutoScalingGroup | undefined;
export function getCluster() {
    // If no ECS cluster has been initialized, see if we must lazily allocate one.
    if (!cluster) {
        const globalStackName = createNameWithStackInfo("global");

        if (config.ecsAutoCluster) {
            // Translate the comma-separated list into an array or undefined.
            let instanceRolePolicyARNs: string[] = [];
            if  (config.ecsAutoClusterInstanceRolePolicyARNs) {
                instanceRolePolicyARNs = (config.ecsAutoClusterInstanceRolePolicyARNs || "").split(",");
            }

            cluster = new awsinfra.x.Cluster(globalStackName, {
                network: getOrCreateNetwork(),
            });

            if (config.ecsAutoClusterUseEFS) {
                fileSystem = new awsinfra.x.ClusterFileSystem(globalStackName, {
                    cluster,
                });
            }

            if (config.ecsAutoClusterMaxSize) {
                const keyName = config.ecsAutoClusterPublicKey === undefined
                    ? undefined
                    : new aws.ec2.KeyPair(name, {
                            publicKey: config.ecsAutoClusterPublicKey,
                        }, { parent: cluster }).keyName;

                const instanceProfile = getInstanceProfile(globalStackName, instanceRolePolicyARNs);

                autoScalingGroup = new awsinfra.x.ClusterAutoScalingGroup(globalStackName, {
                    cluster,
                    templateParameters: {
                        minSize: config.ecsAutoClusterMaxSize,
                        maxSize: config.ecsAutoClusterMinSize,
                    },
                    launchConfigurationArgs: {
                        cluster,
                        keyName,
                        fileSystem,
                        instanceProfile,
                        instanceType: <aws.ec2.InstanceType>config.ecsAutoClusterInstanceType,
                        rootBlockDevice: {
                            volumeSize: config.ecsAutoClusterInstanceRootVolumeSize || 8, // GiB
                            volumeType: "gp2", // default is "standard"
                            deleteOnTermination: true,
                        },
                        ebsBlockDevices: [{
                                // Swap volume
                                deviceName: "/dev/xvdb",
                                volumeSize: config.ecsAutoClusterInstanceSwapVolumeSize || 5, // GiB
                                volumeType: "gp2", // default is "standard"
                                deleteOnTermination: true,
                            }, {
                                // Docker image and metadata volume
                                deviceName: "/dev/xvdcz",
                                volumeSize: config.ecsAutoClusterInstanceDockerImageVolumeSize || 50, // GiB
                                volumeType: "gp2",
                                deleteOnTermination: true,
                            }],
                    },
                });
            }
        } else if (config.ecsClusterARN) {
            // Else if we have an externally provided cluster and can use that.
            const ecsCluster = aws.ecs.Cluster.get(globalStackName, config.ecsClusterARN);
            const securityGroup = config.ecsClusterSecurityGroup
                ? aws.ec2.SecurityGroup.get(globalStackName, config.ecsClusterSecurityGroup)
                : undefined;
            cluster = new awsinfra.x.Cluster(globalStackName, {
                instance: ecsCluster,
                instanceSecurityGroup: securityGroup,
            });
            fileSystem = new awsinfra.x.ClusterFileSystem(globalStackName, {
                cluster,
                mountPath: config.ecsClusterEfsMountPath,
            });
        } else if (config.useFargate) {
            // Else, allocate a Fargate-only cluster.
            cluster = new awsinfra.x.Cluster(globalStackName, {
                network: getOrCreateNetwork(),
            });
        }
    }

    return cluster;
}

export function getAutoScalingGroup() {
    getCluster();
    return autoScalingGroup;
}

export function getFileSystem() {
    getCluster();
    return fileSystem;
}

function getInstanceProfile(name: string, policyARNs: string[]) {
    const instanceRole = new aws.iam.Role("autoscaling", {
        assumeRolePolicy: JSON.stringify(awsinfra.x.ClusterAutoScalingLaunchConfiguration.defaultInstanceProfilePolicyDocument()),
    }, { parent: cluster });

    const instanceRolePolicies: aws.iam.RolePolicyAttachment[] = [];
    for (let i = 0; i < policyARNs.length; i++) {
        const policyARN = policyARNs[i];

        instanceRolePolicies.push(new aws.iam.RolePolicyAttachment(`${name}-${utils.sha1hash(policyARN)}`, {
            role: instanceRole,
            policyArn: policyARN,
        }, { parent: cluster }));
    }

    return new aws.iam.InstanceProfile(name, {
        role: instanceRole,
    }, { parent: cluster , dependsOn: instanceRolePolicies } );
}

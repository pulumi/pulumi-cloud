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
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";

const config = new pulumi.Config("cloud-aws");

// TODO[pulumi/pulumi-cloud#134]: We need to clean up the set of options available on `cloud-aws`
// and potentially reduce the dimentionality of the available configuration space.

/**
 * Optionally override the Lambda function memory size for all functions.
 */
export let functionMemorySize = config.getNumber("functionMemorySize") || 128;
if (functionMemorySize % 64 !== 0 || functionMemorySize < 128 || functionMemorySize > 1536) {
    throw new RunError("Lambda memory size in MiB must be a multiple of 64 between 128 and 1536.");
}

/**
 * Set the IAM role policies to apply to compute (both Lambda and ECS) within this Pulumi program. The default is:
 * "arn:aws:iam::aws:policy/AWSLambdaFullAccess,arn:aws:iam::aws:policy/AmazonEC2ContainerServiceFullAccess".
 */
export let computeIAMRolePolicyARNs = config.get("computeIAMRolePolicyARNs");

/**
 * Optional ACM certificate ARN to support services HTTPS traffic.
 */
export let acmCertificateARN = config.get("acmCertificateARN");

/**
 * Optional ECS cluster ARN.  If not provided, `Service`s and `Task`s are not available for the target
 * environment.
 */
export let ecsClusterARN: pulumi.Input<string> | undefined = config.get("ecsClusterARN");

/**
 * Optional ECS cluster security group that all ALBs for services within the cluster will use.
 */
export let ecsClusterSecurityGroup: pulumi.Input<string> | undefined = config.get("ecsClusterSecurityGroup");

/**
 * Optional EFS mount path on the cluster hosts.  If not provided, `Volumes` cannot be used in `Service`s and `Task`s.
 */
export let ecsClusterEfsMountPath = config.get("ecsClusterEfsMountPath");

/**
 * Optionally put all compute in a private network with no Internet ingress except via explicit HttpEndpoint.
 */
export let usePrivateNetwork = config.getBoolean("usePrivateNetwork") || false;

/**
 * Use an existing VPC.  If both `usePrivateNetwork` and `externalVpcId` are provided, the VPC must be configured to run
 * all compute in private subnets with Internet egress enabled via NAT Gateways.
 */
export let externalVpcId = config.get("externalVpcId");

const externalSubnetsString = config.get("externalSubnets");
/**
 * Provide subnets ids for the VPC as a comma-seperated string.  Required if using an existing VPC.
 */
export let externalSubnets: string[] | undefined = undefined;
if (externalSubnetsString) {
    externalSubnets = externalSubnetsString.split(",");
}

const externalPublicSubnetsString = config.get("externalPublicSubnets");
/**
 * Provide public subnets ids for the VPC as a comma-seperated string.  Required if using an existing VPC.
 */
export let externalPublicSubnets: string[] | undefined = undefined;
if (externalPublicSubnetsString) {
    externalPublicSubnets = externalPublicSubnetsString.split(",");
}

const externalSecurityGroupsString = config.get("externalSecurityGroups");
/**
 * Provide securityGroup ids for the VPC as a comma-seperated string.  Required if using an existing VPC.
 */
export let externalSecurityGroups: string[] | undefined = undefined;
if (externalSecurityGroupsString) {
    externalSecurityGroups = externalSecurityGroupsString.split(",");
}

if (externalVpcId && (!externalSubnets || !externalSecurityGroups)) {
    throw new RunError(
        "Must configure 'cloud-aws:externalSubnets' and 'cloud-aws:externalSecurityGroups' " +
        "when setting 'cloud-asws:externalVpcId'",
    );
}

/**
 * Optionally use Fargate-based container compute. All tasks must be Fargate-compatible.
 */
export let useFargate = config.getBoolean("useFargate") || false;

/**
 * Optionally auto-provision an ECS Cluster.  If set to true, parameters for the cluster can be provided via
 * the other "ecsAutoCluster*" configuration variables.
 */
export let ecsAutoCluster = config.getBoolean("ecsAutoCluster") || false;
/**
 * The number of AZs to create subnets in as part of the cluster.  Defaults to 2.
 */
export let ecsAutoClusterNumberOfAZs = config.getNumber("ecsAutoClusterNumberOfAZs");
/**
 * The EC2 instance type to use for the cluster.  Defaults to `t2.micro`.
 */
export let ecsAutoClusterInstanceType = config.get("ecsAutoClusterInstanceType");
/**
 * The EC2 instance role policy ARN to use for the cluster.  Defaults to
 * `arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role,
 *  arn:aws:iam::aws:policy/AmazonEC2ReadOnlyAccess`.
 */
export let ecsAutoClusterInstanceRolePolicyARNs = config.get("ecsAutoClusterInstanceRolePolicyARNs");
/**
 * The size (in GiB) of the EBS volume to attach to each instance as the root volume.  Defaults to 8 GiB.
 */
export let ecsAutoClusterInstanceRootVolumeSize = config.getNumber("ecsAutoClusterInstanceRootVolumeSize");
/**
 * The size (in GiB) of the EBS volume to attach to each instance as Docker Image volume.  Defaults to 50 GiB.
 */
export let ecsAutoClusterInstanceDockerImageVolumeSize =
    config.getNumber("ecsAutoClusterInstanceDockerImageVolumeSize");
/**
 * The size (in GiB) of the EBS volume to attach to each instance as the swap volume.  Defaults to 5 GiB.
 */
export let ecsAutoClusterInstanceSwapVolumeSize = config.getNumber("ecsAutoClusterInstanceSwapVolumeSize");
/**
 * The minimum size of the cluster. Defaults to 2.
 */
export let ecsAutoClusterMinSize = config.getNumber("ecsAutoClusterMinSize");
/**
 * The maximum size of the cluster. Defaults to 100.
 */
export let ecsAutoClusterMaxSize = config.getNumber("ecsAutoClusterMaxSize");
/**
 * Public key material for SSH access to the cluster. See allowed formats at:
 * https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-key-pairs.html
 * If not provided, no SSH access is enabled on VMs.
 */
export let ecsAutoClusterPublicKey = config.get("ecsAutoClusterPublicKey");
/**
 * The name of the ECS-optimzed AMI to use for the Container Instances in this cluster, e.g.
 * "amzn-ami-2017.09.l-amazon-ecs-optimized".
 *
 * See http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html for valid values.
 */
export let ecsAutoClusterECSOptimizedAMIName = config.get("ecsAutoClusterECSOptimizedAMIName");
/**
 * Optionally auto-provision an Elastic File System for the Cluster.  Defaults to false.
 */
export let ecsAutoClusterUseEFS = config.getBoolean("ecsAutoClusterUseEFS") || false;

/**
 * setEcsCluster configures the ambient ECS cluster imperatively rather than using standard configuration.
 */
export function setEcsCluster(cluster: aws.ecs.Cluster,
                              securityGroup?: pulumi.Output<string>,
                              efsMountPath?: string): void {
    ecsClusterARN = cluster.name;
    if (securityGroup) {
        ecsClusterSecurityGroup = securityGroup;
    }
    if (efsMountPath) {
        ecsClusterEfsMountPath = efsMountPath;
    }
}

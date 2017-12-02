// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as pulumi from "pulumi";

const config = new pulumi.Config("cloud-aws:config");

// TODO[pulumi/pulumi-cloud#134]: We need to clean up the set of options available on `cloud-aws`
// and potentially reduce the dimentionality of the available configuration space.

/**
 * Optionally override the Lambda function memory size for all functions.
 */
export let functionMemorySize = config.getNumber("functionMemorySize") || 128;
if (functionMemorySize % 64 !== 0 || functionMemorySize < 128 || functionMemorySize > 1536) {
    throw new Error("Lambda memory size in MiB must be a multiple of 64 between 128 and 1536.");
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
export let ecsClusterARN: string | pulumi.ComputedValue<string> = config.get("ecsClusterARN");
/**
 * Subnets associated with an externally-provided ECS Cluster.  Required if `ecsClusterARN` is set.
 */
export let ecsClusterSubnets: string | pulumi.ComputedValue<string>[] | undefined = config.get("ecsClusterSubnets");
/**
 * VPC id associated with an externally-provided ECS Cluster.  Required if `ecsClusterARN` is set.
 */
export let ecsClusterVpcId: string | pulumi.ComputedValue<string> = config.get("ecsClusterVpcId");

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
 * Provvide subnets ids for the VPC as a comma-seperated string.  Required if using an existing VPC.
 */

export let externalSubnets: string[] | undefined = undefined;
if (externalSubnetsString) {
    externalSubnets = externalSubnetsString.split(",");
}

const externalSecurityGroupsString = config.get("externalSecurityGroups");
/**
 * Provvide securityGroup ids for the VPC as a comma-seperated string.  Required if using an existing VPC.
 */
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

/**
 * Optionally auto-provision an ECS Cluster.  If set to true, parameters for the cluster can be provided via
 * the other "ecsAutoCluster*" configuration variables.
 */
export let ecsAutoCluster = config.getBoolean("ecsAutoCluster") || false;
/**
 * The EC2 instance type to use for the cluster.  Defaults to `t2-micro`.
 */
export let ecsAutoClusterInstanceType = config.get("ecsAutoClusterInstanceType");
/**
 * The EC2 instance role policy ARN to use for the cluster.  Defaults to
 * `arn:aws:iam::aws:policy/service-role/AmazonEC2ContainerServiceforEC2Role`.
 */
export let ecsAutoClusterInstanceRolePolicyARN = config.get("ecsAutoClusterInstanceRolePolicyARN");
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
 * "amzn-ami-2017.09.a-amazon-ecs-optimized".
 *
 * See http://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-optimized_AMI.html for valid values.
 */
export let ecsAutoClusterECSOptimizedAMIName = config.get("ecsAutoClusterECSOptimizedAMIName");
/**
 * Optionally auto-provision an Elastic File System for the Cluster.  Defaults to true.
 */
export let ecsAutoClusterUseEFS = config.getBoolean("ecsAutoClusterUseEFS") || true;

/**
 * setEcsCluster configures the ambient ECS cluster imperatively rather than using standard configuration.
 */
export function setEcsCluster(cluster?: aws.ecs.Cluster, subnets?: aws.ec2.Subnet[], vpc?: aws.ec2.Vpc): void {
    if (cluster) {
        ecsClusterARN = cluster.name;
    }
    if (subnets) {
        ecsClusterSubnets = subnets.map(s => s.id);
    }
    if (vpc) {
        ecsClusterVpcId = vpc.id;
    }
}

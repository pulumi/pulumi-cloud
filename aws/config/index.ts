// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as pulumi from "pulumi";

const config = new pulumi.Config("cloud-aws:config");

// Optional ECS cluster ARN, subnets and VPC.  If not provided, `Service`s and
// `Task`s are not available for the target environment.
export let ecsClusterARN: string | pulumi.ComputedValue<string> = config.get("ecsClusterARN");
export let ecsClusterSubnets: string | pulumi.ComputedValue<string>[] | undefined = config.get("ecsClusterSubnets");
export let ecsClusterVpcId: string | pulumi.ComputedValue<string> = config.get("ecsClusterVpcId");

// Optional EFS mount path on the cluster hosts.  If not provided, `Volumes`
// cannot be used in `Service`s and `Task`s.
export let ecsClusterEfsMountPath = config.get("ecsClusterEfsMountPath");

// setEcsCluster configures the ambient ECS cluster imperatively rather than using standard configuration.
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


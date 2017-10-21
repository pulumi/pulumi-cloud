// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";

const config = new pulumi.Config("cloud-aws:config");

// Optional ECS cluster ARN, subnets and VPC.  If not provided, `Service`s and
// `Task`s are not available for the target environment.
export let ecsClusterARN = config.get("ecsClusterARN");
export let ecsClusterSubnets = config.get("ecsClusterSubnets");
export let ecsClusterVpcId = config.get("ecsClusterVpcId");

// Optional EFS mount path on the cluster hosts.  If not provided, `Volumes`
// cannot be used in `Service`s and `Task`s.
export let ecsClusterEfsMountPath = config.get("ecsClusterEfsMountPath");

// Optionally create a VPC and run all compute inside it
export let createVpc = config.getBoolean("createVpc") || false;

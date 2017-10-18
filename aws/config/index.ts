// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";

const config = new pulumi.Config("cloud-aws:config");

// Optional ECS cluster ARN, subnets, and VPC.  If not provided, an automatic cluster will be created.
export let ecsClusterARN = config.get("ecsClusterARN");
export let ecsClusterSubnets = config.get("ecsClusterSubnets");
export let ecsClusterVpcId = config.get("ecsClusterVpcId");

// Optional auto-ECS cluster parameters to configure its creation.
export let ecsAutoClusterDisable = config.getBoolean("ecsAutoClusterDisable");
export let ecsAutoClusterInstanceType = config.get("ecsAutoClusterInstanceType") || "t2.micro";
export let ecsAutoClusterDesiredCapacity = config.getNumber("ecsAutoClusterDesiredCapacity") || 2;
export let ecsAutoClusterMinSize = config.getNumber("ecsAutoClusterMinSize") || ecsAutoClusterDesiredCapacity;
export let ecsAutoClusterMaxSize = config.getNumber("ecsAutoClusterMaxSize") || ecsAutoClusterDesiredCapacity;

// Optional EFS mount path on the cluster hosts.  If not provided, `Volumes` cannot be used in `Service`s and `Task`s.
export let ecsClusterEfsMountPath = config.get("ecsClusterEfsMountPath");


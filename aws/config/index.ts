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

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let functionMemorySize = config.getNumber("functionMemorySize") || 128;
if (functionMemorySize % 64 !== 0 || functionMemorySize < 128 || functionMemorySize > 1536) {
    throw new RunError("Lambda memory size in MiB must be a multiple of 64 between 128 and 1536.");
}

const functionIncludePathsString = config.get("functionIncludePaths");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let functionIncludePaths: string[] | undefined = undefined;
if (functionIncludePathsString) {
    functionIncludePaths = functionIncludePathsString.split(",");
}

const functionIncludePackagesString = config.get("functionIncludePackages");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let functionIncludePackages: string[] | undefined = undefined;
if (functionIncludePackagesString) {
    functionIncludePackages = functionIncludePackagesString.split(",");
}

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let computeIAMRolePolicyARNs = config.get("computeIAMRolePolicyARNs");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let acmCertificateARN = config.get("acmCertificateARN");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsClusterARN: pulumi.Input<string> | undefined = config.get("ecsClusterARN");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsClusterSecurityGroup: pulumi.Input<string> | undefined = config.get("ecsClusterSecurityGroup");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsClusterEfsMountPath = config.get("ecsClusterEfsMountPath");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let usePrivateNetwork = config.getBoolean("usePrivateNetwork") || false;

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let externalVpcId = config.get("externalVpcId");

const externalSubnetsString = config.get("externalSubnets");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let externalSubnets: string[] | undefined = undefined;
if (externalSubnetsString) {
    externalSubnets = externalSubnetsString.split(",");
}

const externalPublicSubnetsString = config.get("externalPublicSubnets");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let externalPublicSubnets: string[] | undefined = undefined;
if (externalPublicSubnetsString) {
    externalPublicSubnets = externalPublicSubnetsString.split(",");
}

const externalSecurityGroupsString = config.get("externalSecurityGroups");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
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

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let useFargate = config.getBoolean("useFargate") || false;

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsAutoCluster = config.getBoolean("ecsAutoCluster") || false;

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsAutoClusterNumberOfAZs = config.getNumber("ecsAutoClusterNumberOfAZs");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsAutoClusterInstanceType = config.get("ecsAutoClusterInstanceType");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsAutoClusterInstanceRolePolicyARNs = config.get("ecsAutoClusterInstanceRolePolicyARNs");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsAutoClusterInstanceRootVolumeSize = config.getNumber("ecsAutoClusterInstanceRootVolumeSize");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsAutoClusterInstanceDockerImageVolumeSize =
    config.getNumber("ecsAutoClusterInstanceDockerImageVolumeSize");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsAutoClusterInstanceSwapVolumeSize = config.getNumber("ecsAutoClusterInstanceSwapVolumeSize");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsAutoClusterMinSize = config.getNumber("ecsAutoClusterMinSize");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsAutoClusterMaxSize = config.getNumber("ecsAutoClusterMaxSize");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsAutoClusterPublicKey = config.get("ecsAutoClusterPublicKey");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsAutoClusterECSOptimizedAMIName = config.get("ecsAutoClusterECSOptimizedAMIName");

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
export let ecsAutoClusterUseEFS = config.getBoolean("ecsAutoClusterUseEFS") || false;

/** @deprecated [@pulumi/cloud-aws] has been deprecated.  Please migrate your code to [@pulumi/aws] */
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

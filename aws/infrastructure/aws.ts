// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

// TODO[pulumi/pulumi-aws#40]: Move these to pulumi-aws.

import * as aws from "@pulumi/aws";

async function getAwsAccountId() {
    const callerIdentity = await aws.getCallerIdentity();
    return callerIdentity.accountId;
}

export let awsAccountId = getAwsAccountId();

async function getAwsRegion() {
    const region = await aws.getRegion({ current: true });
    return region.name;
}

export let awsRegion = getAwsRegion();

// Export as a function instead of a variable so clients can pass one AZ as a promise to a resource.
export async function getAwsAz(index: number) {
    const azs = await aws.getAvailabilityZones();
    return azs.names[index];
}

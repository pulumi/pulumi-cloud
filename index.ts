// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@lumi/aws";
import * as runtime from "@lumi/lumirt";
import * as config from "./config";

// Set the AWS region based on the Pulumi region configuration
aws.config.region = config.requireAWSRegion();

// Note that we only export APIs with no AWS types exposed
// We must ensure that consumers of the Pulumi platform do
// not see any types from AWS when calling APIs in these
// exported modules.

export * from "./api";
export * from "./table";
export * from "./topic";
export { onError, ErrorHandler } from "./unhandledError";
import * as timer from "./timer";
export { timer };

export function log(s: string) {
    runtime.printf(s);
    runtime.printf("\n");
}


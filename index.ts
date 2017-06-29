// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@lumi/aws";
import * as runtime from "@lumi/lumirt";

export * from "./api";
export * from "./queue";
export * from "./table";

// TODO[pulumi/lumi#268] We should be exposing our own region config
// setting on the `platform` pacakge and then passing it through to
// the AWS provider.  Until that works, we'll hard code it.
aws.config.region = "us-east-2";

export function log(s: string) {
    runtime.printf(s);
    runtime.printf("\n");
}


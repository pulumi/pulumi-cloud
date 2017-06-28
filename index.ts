// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import { config } from "@lumi/aws";
import { printf } from "@lumi/lumirt";

export * from "./api";
export * from "./queue";
export * from "./table";

// TODO[pulumi/lumi#268] We should be exposing our own region config
// setting on the `platform` pacakge and then passing it through to
// the AWS provider.  Until that works, we'll hard code it.
config.region = "us-east-2";

export function log(s: string) {
    printf(s);
    printf("\n");
}


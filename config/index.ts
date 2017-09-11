// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as fabric from "@pulumi/pulumi-fabric";

let _config = new fabric.Config("pulumi:config");

export type Region = "WestUS" | "EastUS" | "WestEU";

export let region: Region = <Region>_config.require("region");

export function requireAWSRegion(): aws.Region {
    switch (region) {
        case "WestUS": return "us-west-2";
        case "EastUS": return "us-east-2";
        case "WestEU": return "eu-west-1";
        default:
            throw new Error("Expected a valid Pulumi region");
    }
}


import * as aws from "@lumi/aws";

export type Region = "WestUS" | "EastUS" | "WestEU";

function convertToAWSRegion(region: Region): aws.Region {
    switch (region) {
        case "WestUS": return "us-west-2";
        case "EastUS": return "us-east-2";
        case "WestEU": return "eu-west-1";
        default:
            throw new Error("Expected a valid Pulumi region");
    }
}

export let region: Region | undefined;

export function requireRegion(): Region {
    if (region === undefined) {
        throw new Error("No Pulumi region has been configured");
    }
    return region;
}

export function requireAWSRegion(): aws.Region {
    let pulumiRegion = requireRegion();
    return convertToAWSRegion(pulumiRegion);
}

// Copyright 2016-2018, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as awscloud from "@pulumi/cloud-aws";
import * as aws from "@pulumi/aws";

// First, go to the AWS console and buy/transfer a domain.
let domainName = "pulumi.io";

// We'll host our API on this subdomain.
let subdomain = "testsubdomain1234";

// Also get the Hosted Zone Id for the above domain.
//
// IDEA: Use `aws.route53.getZone()`
let hostedZoneId = "ZAH2GWTP2BEOU"; 

// Next, create an Amazon Certificate Manager cert for *.<domainName> in us-east-1 in the same account.
//
// IDEA: Use `aws.acm.getCertificate()`
let certficateArn = "arn:aws:acm:us-east-1:153052954103:certificate/2a5c225d-de86-4e08-8639-e3a843089c57";

// Create an HTTP Endpoint.
let endpoint = new awscloud.HttpEndpoint("endpoint");
endpoint.get("/", async (req, res) => {
    res.json(req);
});

// Attach our custom domain using the AWS-specific ACM certificate.
endpoint.attachCustomDomain({
    domainName: subdomain + "." + domainName,
    certificateArn: certficateArn,
});
let deployment = endpoint.publish();

// Add a DNS CNAME record for the subdomain pointing to the HttpEndpoint custom domain. 
let recordSet = new aws.route53.Record(subdomain, {
    name: subdomain,
    zoneId: hostedZoneId,
    type: "A",
    alias: [{
        name: deployment.customDomains[0].cloudfrontDomainName,
        zoneId: deployment.customDomains[0].cloudfrontZoneId,
        evaluateTargetHealth: false,
    }]
});

// Export the custom domain URL for the HTTP Endpoint.
export let url = recordSet.fqdn.then(fqdn => `https://${fqdn}/`);

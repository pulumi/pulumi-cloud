// Copyright 2016-2018, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as awscloud from "@pulumi/cloud-aws";
import * as aws from "@pulumi/aws";

// First, go to the AWS console and buy/transfer a domain.
let domainName = "pulumi.io";

// Also get the Hosted Zone Id for the above domain.
//
// IDEA: Use `aws.route53.getZone()`
let hostedZoneId = "ZAH2GWTP2BEOU"; 

// Next, create an Amazon Certificate Manager cert for *.<domainName> in us-east-1 in the same account.
//
// IDEA: Use `aws.acm.getCertificate()`
let certficateArn = "arn:aws:acm:us-east-1:153052954103:certificate/2a5c225d-de86-4e08-8639-e3a843089c57";

// We'll host our API on this subdomain.
let subdomain = "testsubdomain1234";

// Create an HTTP Endpoint.
let endpoint = new awscloud.HttpEndpoint("endpoint");
endpoint.get("/", async (req, res) => {
    res.json(req);
});

// Attach our custom domain using the AWS-specific ACM certificate.
(endpoint as awscloud.HttpEndpoint).attachCustomDomain({
    domainName: subdomain + "." + domainName,
    certificateArn: certficateArn,
});
let deployment = endpoint.publish();

// Add a DNS CNAME record for the subdomain pointing to the HttpEndpoint custom domain. 
//
// IDEA: Might be nice to also support an alias record instead of CNAME.  See:
// https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/resource-record-sets-choosing-alias-non-alias.html
let recordSet = new aws.route53.Record(subdomain, {
    name: subdomain,
    zoneId: hostedZoneId,
    type: "CNAME",
    records: deployment.customDomainNames,
    ttl: 60,
});

// Export the custom domain URL for the HTTP Endpoint.
export let url = recordSet.fqdn.then(fqdn => `https://${fqdn}/`);
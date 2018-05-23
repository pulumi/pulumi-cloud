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

import * as pulumi from "@pulumi/pulumi";
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
    aliases: [{
        name: deployment.customDomains[0].cloudfrontDomainName,
        zoneId: deployment.customDomains[0].cloudfrontZoneId,
        evaluateTargetHealth: false,
    }]
});

// Export the custom domain URL for the HTTP Endpoint.
export let url = recordSet.fqdn.apply(fqdn => `https://${fqdn}/`);

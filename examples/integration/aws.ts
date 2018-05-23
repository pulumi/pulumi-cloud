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

// AWS IAM credentials for making calls agaisnt AWS resources.
// See http://docs.aws.amazon.com/general/latest/gr/managing-aws-access-keys.html
let config = new pulumi.Config("aws");
let accessKeyID = config.require("access_key");
let secretAccessKey = config.require("secret_access_key");
let region = config.require("region");

export let sendEmail: (message: EmailMessage) => Promise<void> = async (message) => {
    let AWS = require("aws-sdk");
    AWS.config = new AWS.Config({
        accessKeyId: accessKeyID,
        secretAccessKey: secretAccessKey,
        region: region,
    });
    let ses = new AWS.SES();
    console.log(`Sending email: ${JSON.stringify(message)}`);
    let params: any = {
        Destination: {
            ToAddresses: message.to,
        },
        Message: {
            Body: {
            },
            Subject: {
                Charset: "UTF-8",
                Data: message.subject,
            },
        },
        Source: message.source,
    };
    if (message.cc !== undefined) {
        params.Destination.CcAddresses = message.cc;
    }
    if (message.bcc !== undefined) {
        params.Destination.BccAddresses = message.bcc;
    }
    if (message.bodyText !== undefined) {
        params.Message.Body.Text = { Data: message.bodyText, Charset: "UTF-8" };
    } else if (message.bodyHtml !== undefined) {
        params.Message.Body.Html = { Data: message.bodyHtml, Charset: "UTF-8" };
    } else {
        throw new Error("Either `bodyText` or `bodyHtml` to be set on EmailMessage object");
    }
    if (message.replyTo !== undefined) {
        params.ReplyToAddresses = message.replyTo;
    }
    let resp = await ses.sendEmail(params).promise();
    console.log(resp);
};

export interface EmailMessage {
    source: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    replyTo?: string[];
    subject: string;
    bodyText?: string;
    bodyHtml?: string;
}

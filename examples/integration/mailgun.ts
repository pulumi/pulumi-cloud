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
import * as utils from "./utils";

// Account API Key and desired Mailgun Domain to use for sending emails.  See
// https://app.mailgun.com/app/domains and https://app.mailgun.com/app/account/security.
let config = new pulumi.Config("mailgun");
let domain = config.require("domain");
let apiKey = config.require("api_key");

export let send: (message: EmailMessage) => Promise<void> = async (message) => {
    let request = require("request-promise-native");

    let body = await request({
        method: "POST",
        url: `https://api.mailgun.net/v3/${domain}/messages`,
        auth: {
            username: "api",
            password: apiKey,
        },
        form: {
            from: "Service Account <excited@samples.mailgun.org>",
            to: message.to,
            subject: message.subject,
            text:  message.body,
        },
    });

    console.log(utils.toShortString(`MailGun response: ${body}`));
};

export interface EmailMessage {
    to: string;
    subject: string;
    body: string;
}

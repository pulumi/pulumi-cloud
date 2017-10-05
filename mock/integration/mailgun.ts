// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";

const config = new pulumi.Config("mailgun");

export let send: (message: EmailMessage) => Promise<void> = async (message) => {
    const domain = config.require("domain");
    const apiKey = config.require("api_key");

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
    console.log(`MailGun response: ${body}`);
};

export interface EmailMessage {
    to: string;
    subject: string;
    body: string;
}

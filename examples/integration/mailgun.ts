// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as config from "./config";

const domain = config.mailgunDomain;
const apiKey = config.mailgunApiKey;

export let send: (message: EmailMessage) => Promise<void> = async (message) => {
    const request = require("request-promise-native");
    const body = await request({
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
    console.log(`response body ${body}`);
};

export interface EmailMessage {
    to: string;
    subject: string;
    body: string;
}

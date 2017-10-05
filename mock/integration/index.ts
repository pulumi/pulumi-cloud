// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";
pulumi.runtime.setConfig("cloud:config:provider", "mock");

// Configuration for the local integration example can be provided in two ways.  The first is as an
// environment variable of the form:
//
//      PULUMI_CONFIG='{ "config_key_1": "config_value_1", ..., "config_key_n": "config_value_n" }'
//
// The second is through arguments passed to the nodejs process of the form:
//
//      nodejs index.js config_key_1=config_value_1 ...  config_key_n=config_value_n
//
// Both of these can be provided, allowing for values to be provided both from the environment and
// from the command line.  Command line arguments will supercede environment values with the same
// name.
const envConfig = process.env.PULUMI_CONFIG;
if (envConfig) {
    console.log("Populating config with PULUMI_CONFIG environment variable...");
    const parsed = JSON.parse(envConfig);

    for (const key in parsed) {
        const value = parsed[key];
        console.log(`Adding ${key}=${value} to the config store.`)
        pulumi.runtime.setConfig(key, value);
    }
}

for (const arg of process.argv.slice(2)) {
    const equalIndex = arg.indexOf("=");
    if (equalIndex > 0) {
        const key = arg.substr(0, equalIndex);
        const value = arg.substr(equalIndex + 1);

        console.log(`Adding ${key}=${value} to the config store.`)
        pulumi.runtime.setConfig(key, value);
    }
}

import * as cloud from "@pulumi/cloud";
import * as aws from "./aws";
import { Digest } from "./digest";
import * as mailgun from "./mailgun";
import { poll } from "./poll";
import * as salesforce from "./salesforce";
import * as twitter from "./twitter";

let sendEmail = mailgun.send;
let salesforceQueryAll = salesforce.queryAll;
let sendSESEmail = aws.sendEmail;
let salesforceInsert = salesforce.insert;

function exampleTwitter1() {
    // Get a stream of all tweets matching this query, forever...
    console.log("Searching twitter...");
    let tweets = twitter.search("pulumi", "vscode");

    // On each tweet, log it and send an email.
    tweets.subscribe("tweetlistener", async (tweet) => {
        console.log("Sending email...");
        await sendEmail({
            to: "cyrus@pulumi.com",
            subject: `Tweets from ${new Date().toDateString()}`,
            body: `@${tweet.user.screen_name}: ${tweet.text}\n`,
        });
    });
}

function exampleTwitter2() {
    // Get a stream of all tweets matching this query, forever...
    let tweets: cloud.Stream<twitter.Tweet> = twitter.search("pulumi", "vscode");

    // Collect them into bunches
    let digest = new Digest("tweetdigest", tweets);

    // Every night, take all of the tweets collected since the
    // last digest and publish that as a group to the digest stream.
    cloud.timer.daily("nightly", { hourUTC: 7 },  async () => {
        await digest.collect();
    });

    // For every group of tweets published to the digest stream (nightly)
    // send an email.
    digest.subscribe("digest", async (dailyTweets) => {
        // Arbitrary code to compose email body - could use templating system or
        // any other programmatic way of constructing the text.
        let text = "Tweets:\n";
        for (let i = 0; i < (<any>dailyTweets).length; i++) {
            let tweet = dailyTweets[i];
            text += `@${tweet.user.screen_name}: ${tweet.text}\n`;
        }
        await sendEmail({
            to: "luke@pulumi.com",
            subject: `Tweets from ${new Date().toDateString()}`,
            body: text,
        });
    });
}

function exampleSalesforce1() {
    // Get a stream of all modifications to the Contact list...
    let contactsStream = poll("contactspolling", {minutes: 1}, async (timestamp) => {
        if (timestamp === undefined) {
            // Initial timestamp to start collecting edits from.
            timestamp = "2017-01-01T00:00:00.000Z";
        }
        // Query Salesforce
        let records = await salesforceQueryAll(
            `SELECT Id,Name,LastModifiedDate FROM Contact WHERE LastModifiedDate > ${timestamp}`,
        );
        // Update timetamp to latest of all received edits.
        let newTimestamp = (<any>records).reduce(
            (ts: string, record: salesforce.Record) => {
                let newts: string = record["LastModifiedDate"];
                return newts > ts ? newts : ts;
            },
            timestamp,
        );
        // Return this batch of items and the new timestamp
        return {
            items: records,
            nextToken: newTimestamp,
        };
    });

    // Log each modification.
    contactsStream.subscribe("contactlistener", async (contact) => {
        console.log(contact);
    });
}

function exampleSalesforce2() {
    // Get a stream of all modifications to the Contact list...
    let contacts = salesforce.query(
        "contacts",
        (timestamp) => `SELECT Id,Name,LastModifiedDate FROM Contact WHERE LastModifiedDate > ${timestamp}`,
        "2017-01-01T00:00:00.000Z",
        "LastModifiedDate",
        (a, b) => a > b ? a : b,
    );

    // Log each modification.
    contacts.subscribe("contactlistener", async (contact) => {
        console.log(contact);
    });
}

function exampleSalesforce3() {
    // Get a stream of all modifications to the Contact list...
    let contacts = salesforce.allObjectModifications("contacts", "Contact", "Id,Name");

    // Log each modification.
    contacts.subscribe("contactlistener", async (contact) => {
        console.log(contact);
    });
}

function exampleSendSESEmail() {
    let api = new cloud.HttpEndpoint("sadsad");
    api.get("/", async (req, res) => {
        try {
            await sendSESEmail({
                to: ["luke@pulumi.com"],
                bcc: ["inquiries@pulumi.com"],
                replyTo: ["inquiries@pulumi.com"],
                source: "\"Pulumi\" <inquiries@pulumi.com>",
                subject: "Hi from Pulumi",
                bodyHtml: "Hello, welcome to <b>Pulumi</b>.",
            });
            res.json({});
        } catch (err) {
            res.status(500).json(err);
        }
    });
    api.get("/insertSalesforce", async (req, res) => {
        try {
            await salesforceInsert("Lead", {Email: "lukehoban@gmail.com", LastName: "Hoban", Company: "Pulumi"});
            res.json({});
        } catch (err) {
            res.status(500).json(err);
        }
    });

    api.publish().then((url: string) => { console.log(`URL: ${url}`); });
}

exampleTwitter1();

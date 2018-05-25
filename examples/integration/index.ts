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

export function exampleTwitter1() {
    // Get a stream of all tweets matching this query, forever...
    let tweets = twitter.search("pulumi", "vscode");

    // On each tweet, log it and send an email.
    tweets.subscribe("tweetlistener", async (tweet) => {
        await sendEmail({
            to: "cyrus@pulumi.com",
            subject: `Tweets from ${new Date().toDateString()}`,
            body: `@${tweet.user.screen_name}: ${tweet.text}\n`,
        });
    });
}

export function exampleTwitter2() {
    console.log("Running Twitter example 2...");

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
        if (dailyTweets.length === 0) {
            console.log("No new tweets...");
            return;
        }

        console.log(`Received ${dailyTweets.length} new tweets.  Sending email...`);

        // Arbitrary code to compose email body - could use templating system or
        // any other programmatic way of constructing the text.
        let text = "Tweets:\n";
        for (let tweet of dailyTweets) {
            text += `@${tweet.user.screen_name}: ${tweet.text}\n`;
        }

        await sendEmail({
            to: "cyrus@pulumi.com",
            subject: `Tweets from ${new Date().toDateString()}`,
            body: text,
        });
    });
}

export function exampleSalesforce1() {
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
        let newTimestamp = records.reduce(
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

export function exampleSalesforce2() {
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

export function exampleSalesforce3() {
    // Get a stream of all modifications to the Contact list...
    let contacts = salesforce.allObjectModifications("contacts", "Contact", "Id,Name");

    // Log each modification.
    contacts.subscribe("contactlistener", async (contact) => {
        console.log(contact);
    });
}

export function exampleSendSESEmail() {
    let api = new cloud.API("sadsad");
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

    api.publish().url.apply(url => console.log(`URL: ${url}`));
}

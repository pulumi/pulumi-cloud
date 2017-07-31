// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

/*tslint:disable:no-require-imports*/
declare let require: any;
declare let JSON: any;
declare let Date: any;

import * as platform from "@lumi/platform";
import * as config from "./config";

//////////////////////////////////////////////////////
// Reusable SaaS integration support APIs
//////////////////////////////////////////////////////

// A Stream<T> provides access to listen to an (infinite) stream of items coming from a
// data source.  Unlike Topic<T>, a Stream provides only access to read from the stream,
// not the ability to publish new items to the stream.
interface Stream<T> {
     subscribe(name: string, handler: (item: T) => Promise<void>): void;
}

// A poll function takes an opaque token generated from the last execution (or undefined), and
// returns any new items since the last invocation, along with a new token to be used with the
// next invocation.
type PollFunction<T> = (lastToken?: string) => Promise<{ items: T[]; nextToken: string; }>;

// Poll<T> represents a stream of items which are derived from polling at a given rate
// using a user-provided polling function.
let pollMarkers = new platform.Table("__pollMarkers", "id", "S", {});
class Poll<T> implements Stream<T> {
    private topic: platform.Topic<T>;

    constructor(name: string, rate: platform.timer.IntervalRate, poller: PollFunction<T> ) {
        this.topic = new platform.Topic<T>(name);
        platform.timer.interval(name, rate, async () => {
            console.log(`Getting pollMarker for ${name}`);
            let pollMarker = await pollMarkers.get({id: name});
            console.log(`pollMarker is ${JSON.stringify(pollMarker, null, "")}`);
            let lastToken: string | undefined;
            if (pollMarker !== undefined) {
                lastToken = pollMarker.lastToken;
            }
            console.log(`lastToken is ${lastToken}`);
            let results = await poller(lastToken);
            console.log(`results is ${JSON.stringify(results, null, "")}`);
            pollMarkers.update({id: name}, {lastToken: results.nextToken});
            console.log(`updated pollmarker ${name} to ${results.nextToken}`);
            for (let i = 0; i < (<any>results.items).length; i++) {
                let result = results.items[i];
                await this.topic.publish(result);
                console.log(`published to topic ${JSON.stringify(result, null, "")}`);
            }
            console.log(`done`);
        });
    }

    subscribe(name: string, handler: (item: T) => Promise<void>) {
        this.topic.subscribe(name, handler);
    }
}

// Digest takes an Observable and produces another Observable
// which batches the input into groups delimted by times
// when `collect` is called on the Digest.
class Digest<T> implements Stream<T[]> {
    private table: platform.Table;
    private topic: platform.Topic<T[]>;
    public collect: () => Promise<void>;
    constructor(name: string, stream: Stream<T>) {
        this.topic = new platform.Topic<T[]>(name);
        this.table = new platform.Table(name, "id", "S", {});
        stream.subscribe(name, async (item) => {
            console.log(`adding item to digest table`);
            await this.table.insert({ id: JSON.stringify(item) });
        });
        this.collect = async () => {
            console.log(`collecting digest`);
            let items = await this.table.scan();
            let ret: T[] = [];
            for (let i = 0; i < (<any>items).length; i++) {
                let item = items[i];
                (<any>ret).push(JSON.parse(item.id));
                console.log(`added item to digest ${item.id}`);
                await this.table.delete({ id: item.id });
                console.log(`deleted item from table ${item.id}`);
            }
            await this.topic.publish(ret);
            console.log(`published digest with ${(<any>ret).length} items`);
        };
    }
    subscribe(name: string, handler: (item: T[]) => Promise<void>) {
        this.topic.subscribe(name, handler);
    }
}

///////////////////////////
// Twitter SaaS integration
///////////////////////////

// The Twitter class provdes methods that expose streams of items
// from Twitter.
class Twitter {
    // Search returns a stream of all tweets matching the search term.
    search(name: string, term: string): Stream<Tweet> {
        let accessToken = config.twitterAccessToken;
        let searchPoll = new Poll<Tweet>(name, {minutes: 1}, async (lastToken) => {
            let request = require("request-promise-native");
            let querystring = lastToken;
            if (lastToken === undefined) {
                querystring = `?q=${term}`;
            }
            let body = await request({
                url: "https://api.twitter.com/1.1/search/tweets.json" + querystring,
                headers: {
                    "Authorization": "Bearer " + accessToken,
                },
            });
            let data = <TwitterSearchResponse>JSON.parse(body);
            console.log(`data from Twitter: ${JSON.stringify(data, null, "")}`);
            return {
                nextToken: data.search_metadata.refresh_url,
                items: data.statuses,
            };
        });
        return searchPoll;
    }
}

interface TwitterSearchResponse {
    statuses: Tweet[];
    search_metadata: {
        max_id_str: string;
        since_id_str: string;
        refresh_url: string;
        next_results: string;
    };
}

interface Tweet {
    text: string;
    id_str: string;
    created_at: string;
    user: {
        screen_name: string;
    };
}

///////////////////////////
// Mailgun SaaS integration
///////////////////////////

class Mailgun {
    send: (message: EmailMessage) => Promise<void>;
    constructor() {
        let domain = config.mailgunDomain;
        let apiKey = config.mailgunApiKey;
        this.send = async (message) => {
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
            console.log(`response body ${body}`);
        };
    }
}

interface EmailMessage {
    to: string;
    subject: string;
    body: string;
}

/////////////////////
// User sample code
/////////////////////

let twitter = new Twitter();
let email = new Mailgun();

// Get a stream of all tweets matching this query, forever...
let tweets: Stream<Tweet> = twitter.search("pulumi", "vscode");

// Collect them into bunches
let digest = new Digest("tweetdigest", tweets);

// Every night, take all of the tweets collected since the
// last digest and publish that as a group to the digest stream.
platform.timer.daily("nightly", { hourUTC: 7 },  async () => {
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
    await email.send({
        to: "luke@pulumi.com",
        subject: `Tweets from ${new Date().toDateString()}`,
        body: text,
    });
});

tweets.subscribe("tweetlistener", async (tweet) => {
    console.log(tweet);
});

// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as config from "./config";
import { poll } from "./poll";

// Search returns a stream of all tweets matching the search term.
export function search(name: string, term: string): cloud.Stream<Tweet> {
    const accessToken = config.twitterAccessToken;
    const searchPoll = poll<Tweet>(name, {minutes: 1}, async (lastToken) => {
        const request = require("request-promise-native");
        let querystring = lastToken;
        if (lastToken === undefined) {
            querystring = `?q=${term}`;
        }
        const body = await request({
            url: "https://api.twitter.com/1.1/search/tweets.json" + querystring,
            headers: {
                "Authorization": "Bearer " + accessToken,
            },
        });
        const data = <TwitterSearchResponse>JSON.parse(body);
        console.log(`data from Twitter: ${JSON.stringify(data, null, "")}`);
        return {
            nextToken: data.search_metadata.refresh_url,
            items: data.statuses,
        };
    });
    return searchPoll;
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

export interface Tweet {
    text: string;
    id_str: string;
    created_at: string;
    user: {
        screen_name: string;
    };
}

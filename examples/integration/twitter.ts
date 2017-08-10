// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

/*tslint:disable:no-require-imports*/
declare let require: any;
declare let JSON: any;
declare let Date: any;

import * as platform from "@lumi/platform";
import * as config from "./config";
import {poll} from "./poll";

// Search returns a stream of all tweets matching the search term.
export function search(name: string, term: string): platform.Stream<Tweet> {
    let accessToken = config.twitterAccessToken;
    let searchPoll = poll<Tweet>(name, {minutes: 1}, async (lastToken) => {
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

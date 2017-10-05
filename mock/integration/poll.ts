// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";

// A poll function takes an opaque token generated from the last execution (or undefined), and
// returns any new items since the last invocation, along with a new token to be used with the
// next invocation.
export type PollFunction<T> = (lastToken?: string) => Promise<{ items: T[]; nextToken: string; }>;

let pollMarkers = new cloud.Table("__pollMarkers");

// poll<T> represents a stream of items which are derived from polling at a given rate
// using a user-provided polling function.
export function poll<T>(name: string, rate: cloud.timer.IntervalRate, poller: PollFunction<T>): cloud.Stream<T> {
    let topic = new cloud.Topic<T>(name);

    cloud.timer.interval(name, rate, async () => {
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
            await topic.publish(result);
            console.log(`published to topic ${JSON.stringify(result, null, "")}`);
        }

        console.log(`done`);
    });

    return { subscribe: topic.subscribe, };
}

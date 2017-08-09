// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

declare let JSON: any;
import * as platform from "@lumi/platform";

// A poll function takes an opaque token generated from the last execution (or undefined), and
// returns any new items since the last invocation, along with a new token to be used with the
// next invocation.
export type PollFunction<T> = (lastToken?: string) => Promise<{ items: T[]; nextToken: string; }>;

// Poll<T> represents a stream of items which are derived from polling at a given rate
// using a user-provided polling function.
let pollMarkers = new platform.Table("__pollMarkers", "id", "S", {});
export class Poll<T> implements platform.Stream<T> {
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

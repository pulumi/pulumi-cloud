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
        console.log(`Starting polling...`);

        console.log(`Getting pollMarker for ${name}`);
        let pollMarker = await pollMarkers.get({id: name});
        console.log(`pollMarker is ${JSON.stringify(pollMarker, null, "")}`);

        let lastToken: string | undefined;
        if (pollMarker !== undefined) {
            lastToken = pollMarker.lastToken;
        }

        console.log(`lastToken is ${lastToken}`);

        console.log("Polling for results...");
        let results = await poller(lastToken);

        console.log(`Got ${results.items.length} results...`);
        pollMarkers.update({id: name}, {lastToken: results.nextToken});
        console.log(`Updating pollmarker ${name} to ${results.nextToken}...`);

        console.log(`Publishing results to topic '${name}'...`);
        for (let result of results.items) {
            await topic.publish(result);
        }
        console.log("Done publishing results...");

        console.log(`Done polling...`);
    });

    return { subscribe: topic.subscribe };
}

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
import * as utils from "./utils";

// Digest takes an Observable and produces another Observable
// which batches the input into groups delimted by times
// when `collect` is called on the Digest.
export class Digest<T> implements cloud.Stream<T[]> {
    private table: cloud.Table;
    private topic: cloud.Topic<T[]>;
    public collect: () => Promise<void>;

    constructor(name: string, stream: cloud.Stream<T>) {
        this.topic = new cloud.Topic<T[]>(name);
        this.table = new cloud.Table(name);

        stream.subscribe(name, async (item) => {
            let value = JSON.stringify(item);
            console.log(utils.toShortString(`Adding item to digest table: ${value}`));
            await this.table.insert({ id: value });
        });

        this.collect = async () => {
            console.log(`Collecting digest...`);

            let items = await this.table.scan();
            let ret: T[] = [];
            for (let item of items) {
                ret.push(JSON.parse(item.id));
                await this.table.delete({ id: item.id });
                console.log(utils.toShortString(`Moved item from table to digest: ${item.id}`));
            }

            await this.topic.publish(ret);
            console.log(`Published digest with ${ret.length} items.`);
        };
    }

    subscribe(name: string, handler: (item: T[]) => Promise<void>) {
        this.topic.subscribe(name, handler);
    }
}

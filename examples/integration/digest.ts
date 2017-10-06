// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as utils from "./utils"

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
            const value = JSON.stringify(item);
            console.log(`Adding item to digest table: ${utils.toShortString(value)}`);
            await this.table.insert({ id: value });
        });

        this.collect = async () => {
            console.log(`Collecting digest...`);

            let items = await this.table.scan();
            let ret: T[] = [];
            for (let i = 0; i < items.length; i++) {
                let item = items[i];
                ret.push(JSON.parse(item.id));
                await this.table.delete({ id: item.id });
                console.log(`Moved item from table to digest: ${utils.toShortString(item.id)}`);
            }

            await this.topic.publish(ret);
            console.log(`Published digest with ${ret.length} items.`);
        };
    }

    subscribe(name: string, handler: (item: T[]) => Promise<void>) {
        this.topic.subscribe(name, handler);
    }
}

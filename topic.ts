// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@lumi/aws";
import * as sns from "./sns";

export class Topic<T> {
    private name: string;
    private topic: aws.sns.Topic;
    private subscriptions: aws.sns.Subscription[];

    constructor(name: string) {
        this.name = name;
        this.topic = new aws.sns.Topic(name, {});
        this.subscriptions = [];
    }

    subscribe(name: string, shandler: (item: T) => Promise<void>) {
        let s = sns.createSubscription(this.name + "_" + name, this.topic, async (snsItem: sns.SNSItem) => {
            let item = (<any>JSON).parse(snsItem.Message);
            // TODO[pulumi/lumi#238] For now we need to use a different name for `shandler` to avoid accidental
            // conflict with handler inside `createSubscription`
            await shandler(item);
        });
        (<any>this.subscriptions).push(s);
    }
}

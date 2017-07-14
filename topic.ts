// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

/*tslint:disable:no-require-imports*/
declare let require: any;
import * as aws from "@lumi/aws";
import * as sns from "./sns";

export class Topic<T> {
    // Inside + Outside API
    private name: string;
    private topic: aws.sns.Topic;
    private subscriptions: aws.sns.Subscription[];

    // Inside API (lambda-valued properties)
    public publish: (item: T) => Promise<void>;

    // Outside API (constructor and methods)
    constructor(name: string) {
        this.name = name;
        this.topic = new aws.sns.Topic(name, {});
        this.subscriptions = [];
        this.publish = (item) => {
            let aws = require("aws-sdk");
            let sns = new aws.SNS();
            let str = (<any>JSON).stringify(item);
            return sns.publish({
                Message: str,
                TopicArn: this.topic.id,
            }).promise();
        };
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

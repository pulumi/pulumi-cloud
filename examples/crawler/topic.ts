// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

/*tslint:disable*/
declare let require: any;
import * as platform from "@lumi/platform";

export interface Q<T> {
    publish(item: T): Promise<void>;
}

export let q: <T>(topic: platform.Topic<T>) => Q<T> = <T>(topic: platform.Topic<T>) => {
    let aws = require("aws-sdk");
    let sns = new aws.SNS();
    return <Q<T>>{
        publish: (item: T) => {
            let str = (<any>JSON).stringify(item);
            return sns.publish({
                Message: str,
                TopicArn: (<any>topic).topic.id,
            }).promise();
        },
    }
}
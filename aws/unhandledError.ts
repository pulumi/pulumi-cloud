// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as api from "@pulumi/pulumi";
import * as sns from "./sns";

let unhandledErrorTopic: aws.sns.Topic | undefined;
export function getUnhandledErrorTopic(): aws.sns.Topic {
    if (unhandledErrorTopic === undefined) {
        unhandledErrorTopic = new aws.sns.Topic("unhandled-error-topic", {});
    }
    return unhandledErrorTopic;
}

export function onError(name: string, handler: api.ErrorHandler) {
    sns.createSubscription(name, getUnhandledErrorTopic(), async (item: sns.SNSItem) => {
        let errorMessage = JSON.stringify(item.MessageAttributes["ErrorMessage"]);
        await handler(errorMessage, item.Message);
    });
}

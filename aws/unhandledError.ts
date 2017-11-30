// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";
import * as sns from "./sns";

let unhandledErrorTopic: aws.sns.Topic | undefined;
export function getUnhandledErrorTopic(): aws.sns.Topic {
    if (!unhandledErrorTopic) {
        unhandledErrorTopic = new aws.sns.Topic("unhandled-error-topic");
    }
    return unhandledErrorTopic;
}

export function onError(name: string, handler: cloud.ErrorHandler) {
    sns.createSubscription(name, getUnhandledErrorTopic(), async (item: sns.SNSItem) => {
        const errorMessage = JSON.stringify(item.MessageAttributes["ErrorMessage"]);
        await handler(errorMessage, item.Message);
    });
}


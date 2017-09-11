// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as aws from "@pulumi/aws";
import * as sns from "./sns";

let unhandledErrorTopic: aws.sns.Topic | undefined;
export function getUnhandledErrorTopic(): aws.sns.Topic {
    if (unhandledErrorTopic === undefined) {
        unhandledErrorTopic = new aws.sns.Topic("unhandled-error-topic", {});
    }
    return unhandledErrorTopic;
}

export type ErrorHandler = (message: string, payload: any) => void;

// onError registers a global error handler which will be passed the payload
// and error messages associated with any function which fails during program
// execution.
export function onError(name: string, handler: ErrorHandler) {
    sns.createSubscription(name, getUnhandledErrorTopic(), async (item: sns.SNSItem) => {
        let errorMessage = JSON.stringify(item.MessageAttributes["ErrorMessage"]);
        await handler(errorMessage, item.Message);
    });
}

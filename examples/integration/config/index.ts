// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

// Personal Access Token from https://apps.twitter.com/.  Create a new app and request
// a personal access token to make API requests on behalf of the logged in account.
export let twitterAccessToken: string;

// Account API Key and desired Mailgun Domain to use for sending emails.  See
// https://app.mailgun.com/app/domains and https://app.mailgun.com/app/account/security.
export let mailgunDomain: string;
export let mailgunApiKey: string;

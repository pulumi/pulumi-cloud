// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

// tslint:disable:max-line-length

// Personal Access Token from https://apps.twitter.com/.  Create a new app and request
// a personal access token to make API requests on behalf of the logged in account.
export let twitterAccessToken: string;

// Account API Key and desired Mailgun Domain to use for sending emails.  See
// https://app.mailgun.com/app/domains and https://app.mailgun.com/app/account/security.
export let mailgunDomain: string;
export let mailgunApiKey: string;

// Email and Password for Salesforce account.  Password should be in the form:
//    <password><security_token>
// See https://developer.salesforce.com/docs/atlas.en-us.api_rest.meta/api_rest/intro_understanding_username_password_oauth_flow.htm.
export let salesforceEmail: string;
export let salesforcePassword: string;

// AWS IAM credentials for making calls agaisnt AWS resources.
// See http://docs.aws.amazon.com/general/latest/gr/managing-aws-access-keys.html
export let awsAccessKeyID: string;
export let awsSecretAccessKey: string;
export let awsRegion: string;

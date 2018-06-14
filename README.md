[![Build Status](https://travis-ci.com/pulumi/pulumi-cloud.svg?token=eHg7Zp5zdDDJfTjY8ejq&branch=master)](https://travis-ci.com/pulumi/pulumi-cloud)

# Pulumi Cloud Framework

Pulumi's framework for building modern cloud applications.

Install using: ```npm install @pulumi/cloud``` and ```npm install @pulumi/cloud-aws```.

The Pulumi Cloud Framework is in-progress.  It provides abstractions that can allow one to write a
cloud-application on many different cloud providers (i.e. Amazon Web Services (AWS), Azure, GCP), using a common api.
Because these abstractions allow one to operate over different cloud platforms in a consistent
manner, low level functionality and capabilities of the individual platforms are intentionally not
exposed.

To target a specific platform with the highest amount of functionality and fidelity, please use
appropriate Pulumi platform framework.  For example: http://github.com/pulumi/pulumi-aws or
http://github.com/pulumi/pulumi-azure.  These frameworks will give access to the full power of those
platforms, but will in turn create applications specific to them.

# Components

Currently, Pulumi Cloud has two primary components, `API` and `AWS`.  `API` defines the cloud
abstractions felt to be critical to producing a cloud application.  This includes systems like
`table` and `bucket` (abstractions to store and retrieve data), `api` (an abstraction to expose
services over http), and so on and so forth.  `API` can be used by any Pulumi application by
referencing the NPM module `@pulumi/cloud`.

`AWS` then supplies an implementation of those abstractions, built on top of the `@pulumi/aws`
library.  At deployment time and cloud application runtime, a Pulumi program can utilize this
implementation the `API` by referencing the NPM module `@pulumi/cloud-aws`.  This reference is
required, otherwise Pulumi will not know how to properly provide the `API` surface area on top of
AWS.
> [!Note]  
> This repository has been archived; you can learn a bit more about the history of this project and why it was archived in https://github.com/pulumi/pulumi-cloud/issues/844
> For alternative cloud specific abstractions consider Pulumi's [Crosswalk for AWS](https://www.pulumi.com/docs/clouds/aws/guides/).
> There are also other multi-cloud abstractions that have been built on Pulumi such as [SST](https://sst.dev)



[![Build Status](https://travis-ci.com/pulumi/pulumi-cloud.svg?token=eHg7Zp5zdDDJfTjY8ejq&branch=master)](https://travis-ci.com/pulumi/pulumi-cloud)

# Pulumi Cloud Framework (Preview)

Pulumi Cloud Framework is our multi-cloud framework for building modern container and serverless cloud applications.

This is a preview library demonstrating how to build Pulumi [components](https://www.pulumi.com/docs/reference/component-tutorial/)
that can abstract over and target multiple clouds.

For developers targeting a single cloud platform like AWS, Azure or GCP, we recommend using the
[@pulumi/aws](https://github.com/pulumi/pulumi-aws),
[@pulumi/azure](https://github.com/pulumi/pulumi-azure) and
[@pulumi/gcp](https://github.com/pulumi/pulumi-gcp) packages respectively. These packages give
you full access to the breadth of the platform's capabilities and come with many abstractions to
make developing against that platform easier.

## Installing

This package is available for Node.js (JavaScript or TypeScript).

To install the core API package, use either `npm`:

    $ npm install @pulumi/cloud

or `yarn`:

    $ yarn add @pulumi/cloud

Note that there are implementation packages for each major cloud provider that you will need also.

For AWS, install the package using either `npm`:

    $ npm install @pulumi/cloud-aws

or `yarn`:

    $ yarn add @pulumi/cloud-aws

> **Note:** At the moment, only Amazon Web Services (AWS) support is fleshed out enough to be used.
> Azure support is currently being worked on and is in an early preview state.  It can be used, but issues may be encountered.  To use Azure change the above lines to:

    $ npm install @pulumi/cloud-azure
    $ yarn add @pulumi/cloud-azure

> We also intend to support GCP in the future.  https://github.com/pulumi/pulumi-cloud/issues/518 tracks this request.

## Concepts

The Pulumi Cloud Framework is in preview.  It provides abstractions that can allow one to write a
cloud-application on many different cloud providers (i.e. Amazon Web Services (AWS), Azure, Google
Cloud Platform (GCP)), using a common API.

There is an abstraction package, `@pulumi/cloud`, that defines the APIs common to all cloud
providers.  This provides a highly productive view on modern cloud architectures, akin to Java or
.NET's approach to operating systems.  Because these abstractions allow one to operate over
different cloud platforms in a consistent manner, low level functionality and capabilities of the
individual platforms are intentionally not exposed.

There are implementation packages for individual cloud providers, such as `@pulumi/cloud-aws`, which
first and foremost implement those APIs for the target cloud in question, but also offer more
specific functionality in the form of derived classes that provide cloud-specific functionality.
This allows you to mix multi-cloud code with cloud-specific logic.

Note that you are free, of course, to intersperse these abstractions with specific resources in your
cloud platform of choice, using the appropriate Pulumi platform framework.  This delivers the
highest fidelity possible. For example, [pulumi/pulumi-aws](http://github.com/pulumi/pulumi-aws) or
[pulumi/pulumi-azure](http://github.com/pulumi/pulumi-azure).  These frameworks will give access to
the full power of those platforms, but will in turn create applications specific to them.

### Packages

Currently, Pulumi Cloud contains two primary packages: `api` and `aws`.

[`@pulumi/cloud`](https://github.com/pulumi/pulumi-cloud/tree/master/api) defines the cloud
abstractions common to building modern cloud applications, and can be used by any Pulumi application
directly for cloud-neutral logic.  For example, the `Service` type expresses a load balanced
container, `API` exposes simple serverless functions over HTTP, and `timer` allows you to schedule
timers.  All serverless functions are expressed using lambdas in your language of choice.  The
package also offers simple data abstractions, systems like `Table` and `Bucket`.

[`@pulumi/cloud-aws`](https://github.com/pulumi/pulumi-cloud/tree/master/aws) supplies an implementation
of those abstractions, built on top of the `@pulumi/aws` library.  Its implementation types offer
more AWS-specific functionality than is available in the `@pulumi/cloud` package.

To use either, simply reference them in the usual NPM style in your program.  You may decide to code
against either the APIs or the implementation types, depending on the style of code you're writing
and functionality you need.

If you code against `@pulumi/cloud` directly, you will need to configure your program before running
`pulumi update`. This can be done simply by running the `pulumi config set` command; for instance,
to select `aws`, you will run:

    $ pulumi config set cloud:provider aws

For more details see the examples in `examples`, or online at: https://docs.pulumi.com/quickstart/

## Reference

For detailed reference documentation, please visit the API docs site for this package:

* [@pulumi/cloud](https://pulumi.com/docs/reference/pkg/nodejs/pulumi/cloud/)

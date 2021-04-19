## HEAD (Unreleased)


## 0.30.0 (Release April 19, 2021)

- (Breaking) Update to Pulumi 3.0 packages
- Fix a bug where `subnetIds` was not being unwrapped correctly leading `Task.run` to fail for `@pulumi/cloud-aws`.
  [#785](https://github.com/pulumi/pulumi-cloud/pull/785)

## 0.22.0 (Release Jan 27, 2021)

- (Breaking) Replace `AWSLambdaFullAccess` with `LambdaFullAccess`, a more scoped down LambdaFullAccess
  policy (the new one that AWS recommends). As this significantly reduces the scope for the task definition,
  users may need to attach additional policies if their task needs access to specific AWS services.
- (Breaking) Replaced deprecated `AmazonEC2ContainerServiceFullAccess` policy with `AmazonECS_FullAccess`.
- Expose the type `cluster.ClusterNetworkArgs` in `@pulumi/cloud-aws`

## 0.21.0 (Release May 22, 2020)

- Update dependencies to allow for both 1.x and 2.x versions of `@pulumi/docker`
- Update awsx dependency to use version that supports peer dependencies for `@pulumi/aws` and `@pulumi/pulumi`

## 0.20.0 (Release April 20, 2020)

- Update dependencies to allow both 1.x and 2.x versions of `@pulumi/pulumi`, `@pulumi/aws`
- Update dependencies to allow both 2.x and 3.x of `@pulumi/azure`

  Note that this is a breaking change in `@pulumi/cloud-aws` as a result of removing synchronous calls:
  `network.getDefault()` now returns a `Promise<Network>` instead of `Network` and
  `shared.getOrCreateNetwork()` now returns a `Promise<CloudNetwork>`.

## 0.19.0 (Release April 2, 2020)

 - Upgrade to go1.13.x
 - Upgrade to latest version of `@pulumi/awsx`.
 - Upgrade to latest version of `@pulumi/azure`
    
    Note that the version bump for `@pulumi/azure` is a breaking change for users of `@pulumi/cloud-azure`:
    - The underlying type for `Timer.subscription` is now `appservice.TimerSubscription`
    - The underlying types for `Topic.topic` and `Topic.subscriptions` are now `azure.servicebus.Topic` and `azure.servicebus.TopicEventSubscription[]` respectively;

## 0.18.2 (Release November 6, 2019)

- Update `@pulumi/aws` and `@pulumi/pulumi` dependencies to 1.0.0

## 0.18.1 (Release July 15, 2019)

### Important

- This will be the final version of `@pulumi/cloud` before it is deprecated.  Existing
  `@pulumi/cloud` packages will still be available, but are unlikely to get continued fixes or
  support.  Users of these packages are recommended to move to `@pulumi/aws`, `@pulumi/awsx` if you
  use AWS, and `@pulumi/azure` if you use Azure.  These packages lack the abstractions that provide
  a single view over the different clouds.  However, they expose the full set of rich functionality
  each cloud provides.

### Improvements

- Expose log group and task definition for AWS `Service`s
- Updated to latest versions of dependent packages.

## 0.18.0 (Release March 30, 2019)

### Important

- Moves to the new 0.18.0 version of `@pulumi/aws`.  Version 0.18.0 of `pulumi-aws` is now based on
  v2.2.0 of the AWS Terraform Provider, which has a variety of breaking changes from the previous
  version. See documentation in `@pulumi/aws` repo for more details.

## 0.17.1 (Released March 27, 2019)

## 0.17.0 (Released March 5, 2019)

### Important

Updating to v0.17.0 version of `@pulumi/pulumi`.  This is an update that will not play nicely
in side-by-side applications that pull in prior versions of this package.

See https://github.com/pulumi/pulumi/commit/7f5e089f043a70c02f7e03600d6404ff0e27cc9d for more details.

As such, we are rev'ing the minor version of the package from 0.16 to 0.17.  Recent version of `pulumi` will now detect, and warn, if different versions of `@pulumi/pulumi` are loaded into the same application.  If you encounter this warning, it is recommended you move to versions of the `@pulumi/...` packages that are compatible.  i.e. keep everything on 0.16.x until you are ready to move everything to 0.17.x.

## 0.16.3 (Released February 22nd, 2019)

- Update @pulumi/pulumi dependency to require at least version 0.16.14 in order
  to improve delete-before-create handling.

## 0.16.2 (Released Novemeber 29th, 2018)

### Improvements

- Fix an issue where `@pulumi/cloud-azure` depended on an outdated development version of `@pulumi/azure`

- When running on Azure, @pulumi/cloud now share a single app service plan across all `cloud.Timer`s in a stack

- Support passing an `Input<string>` as the image name when creating a container


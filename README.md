[![Build Status](https://travis-ci.com/pulumi/pulumi-cloud.svg?token=eHg7Zp5zdDDJfTjY8ejq&branch=master)](https://travis-ci.com/pulumi/pulumi-cloud)

# Pulumi Cloud Framework

Pulumi's framework for building modern cloud applications.


# Changelog

## Unreleased

## [0.9](https://github.com/pulumi/pulumi-cloud/compare/v0.8.3...master)

### Added
- [cloud] Added `Response#getHeader` function.
- [cloud-aws] New config settings have been added to enable overriding default cluster EC2 instance roles and to
  suppress creating a File System as part of a cluster. (`cloud-aws:config:ecsAutoClusterInstanceRolePolicyARN` and
  `cloud-aws:config:ecsAutoClusterUseEFS`)

### Changed
- [cloud-aws] The default permissions for cluster EC2 instances and for function and container-based compute have been
  reduced, to `AmazonEC2ContainerServiceforEC2Role` and `AWSLambdaFullAccess` respectively.

## Released

## [0.8.3](https://github.com/pulumi/pulumi-cloud/compare/v0.8.2...v0.8.3)

### Added
- [cloud-aws] The `ecsOptimizedAMIName` config variable can now be used to configure which ECS Optimized AMI will be
  used in an automatically created `Cluster`. ### Changed
- [cloud] `Table` is now specified to perform strongly consistent reads.  Previously reads were eventually consistent.
- [cloud-aws] The `url` returned from `HttpEndpoint#publish` is now the correct base URL (appends the `/stage` part).
- [cloud] `Service#getEndpoint` can now safely be used at deployment time (as well as runtime).

## [0.8.2](https://github.com/pulumi/pulumi-cloud/compare/v0.8.1...v0.8.2)

### Changed
- Service ports with protocol `HTTPS` now offload SSL by default and use HTTP to connect to backend containers.

## [0.8.1](https://github.com/pulumi/pulumi-cloud/compare/v0.8...v0.8.1)

### No changes

## [0.8](https://github.com/pulumi/pulumi-cloud/compare/v0.7...v0.8)

### Added
- [cloud] Support for `build` mode on `Container`, allowing container images to be built during deployment and
  automatically pushed to a remote repository used for the `Service` or `Task`.
- [cloud-aws] Support for running compute (functions and containers) inside a private network via
  `cloud-aws:config:usePrivateNetwork` config variable.
- [cloud-aws] The memory used for AWS Lambda Functions can be globally configured via the
  `cloud-aws:config:functionMemorySize` config variable.
- [cloud-aws] Support for auto-creating a cluster to use for containers (`Service` and `Task`), via the
  `cloud-aws:config:ecsAutoCluster` config variable.
- [cloud] Allow `Service` ports to specify a `protocol`, which may be `tcp` (default), `http` or `https`.  The later two
  will use Layer 7 load balancer, and `https` will additionally to SSL termination using globally configured SSL
  certificate information if available.

## 0.7
- Initial release!

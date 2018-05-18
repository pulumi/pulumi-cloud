[![Build Status](https://travis-ci.com/pulumi/pulumi-cloud.svg?token=eHg7Zp5zdDDJfTjY8ejq&branch=master)](https://travis-ci.com/pulumi/pulumi-cloud)

# Pulumi Cloud Framework

:warning: **Pulumi is in private beta.  This package may not work unless you are already participating.
Please visit [pulumi.com](https://pulumi.com/) to register for access.**

Pulumi's framework for building modern cloud applications.

# Changelog

## Unreleased

## [0.9.x](https://github.com/pulumi/pulumi-cloud/compare/v0.8.3...master)

### Added
- [cloud] Added `HttpEndpoint#proxy` function to provide routes on an HTTP endpoint which redirect to a URL or
  `cloud.Endpoint`.
- [cloud] Added `Response#getHeader` function.
- [cloud-aws] Many new config settings have been added to enable overriding defaults for Network and Cluster
  configuration - both for auto clusters and for externally provided networks and clusters.

### Changed
- [cloud] Header names are now normalized (using `toLowerCase`) for `HttpEndpoint`.
- [cloud-aws] The default permissions for cluster EC2 instances have been reduced.

## Released

## [0.8.3](https://github.com/pulumi/pulumi-cloud/compare/v0.8.2...v0.8.3)

### Added
- [cloud-aws] The `ecsOptimizedAMIName` config variable can now be used to configure which ECS Optimized AMI will be
  used in an automatically created `Cluster`.
  
### Changed
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
  `cloud-aws:usePrivateNetwork` config variable.
- [cloud-aws] The memory used for AWS Lambda Functions can be globally configured via the
  `cloud-aws:functionMemorySize` config variable.
- [cloud-aws] Support for auto-creating a cluster to use for containers (`Service` and `Task`), via the
  `cloud-aws:ecsAutoCluster` config variable.
- [cloud] Allow `Service` ports to specify a `protocol`, which may be `tcp` (default), `http` or `https`.  The later two
  will use Layer 7 load balancer, and `https` will additionally to SSL termination using globally configured SSL
  certificate information if available.

## 0.7
- Initial release!

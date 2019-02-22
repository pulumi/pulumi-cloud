## 0.16.4 (unreleased)

## 0.16.3 (Released February 22nd, 2019)

- Update @pulumi/pulumi dependency to require at least version 0.16.14 in order
  to improve delete-before-create handling.

## 0.16.2 (Released Novemeber 29th, 2018)

### Improvements

- Fix an issue where `@pulumi/cloud-azure` depended on an outdated development version of `@pulumi/azure`

- When running on Azure, @pulumi/cloud now share a single app service plan across all `cloud.Timer`s in a stack

- Support passing an `Input<string>` as the image name when creating a container


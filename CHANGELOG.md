
## 0.16.3 (unreleased)

## 0.16.2 (Released Novemeber 29th, 2018)

### Improvements

- Fix an issue where `@pulumi/cloud-azure` depended on an outdated development version of `@pulumi/azure`

- When running on Azure, @pulumi/cloud now share a single app service plan across all `cloud.Timer`s in a stack

- Support passing an `Input<string>` as the image name when creating a container


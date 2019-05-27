## 0.17.2 (Unreleased)

- Expose log group and task definition for AWS `Service`s
- Updated to latest versions of dependent packages.

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


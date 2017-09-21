// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

// This is the core location where the API package actually exports code for dependent packages to
// use.  We are effectively reflecting over the user's current environment and using that to switch
// in the actual platform implementation appropriate for them.

import * as fabric from "@pulumi/pulumi-fabric";

declare let module: any;
declare function require(name: string): any;

const config = new fabric.Config("pulumi:config");

// TODO before committing.  We should not be falling back to the local provider. That makes it far
// too simple to accidently publish some broken version of pulumi that ends up working in the cloud
// while only using a local provider.
//
// If the appropriate provider is not set by the runtime environment, we just want to immediately
// fail so that that problem is addressed immediately.
let provider = config.get("provider");
if (!provider) {
    provider = "aws";
    console.log(`Warning: Provider not given.  Falling back to ${provider} provider.`);
}

const frameworkModule = `@pulumi/pulumi-framework-${provider}`;

console.log(`Loading ${frameworkModule} for current environment.`);
module.exports = require(frameworkModule);

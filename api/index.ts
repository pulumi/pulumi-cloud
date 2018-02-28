// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

// This is the core location where the API package actually exports code for dependent packages to
// use.  We are effectively reflecting over the user's current environment and using that to switch
// in the actual platform implementation appropriate for them.

import * as pulumi from "@pulumi/pulumi";

declare let module: any;
declare function require(name: string): any;

const config = new pulumi.Config("cloud:config");

const provider = config.require("provider");

// Load the implementation of @pulumi/cloud for the target provider.
function loadFrameworkModule() {
    const frameworkModule = `@pulumi/cloud-${provider}`;
    pulumi.log.debug(`Loading ${frameworkModule} for current environment.`);
    try {
        return require(frameworkModule);
    } catch (e) {
        // If the module was not found, return a useful error message.
        if ((e instanceof Error) && (e as any).code === "MODULE_NOT_FOUND") {
            throw new Error(`
Attempted to load the '${provider}' implementation of '@pulumi/cloud', but no '${frameworkModule}' module is installed.\
 Install it now or select another provider implementation with the "cloud:config:provider" setting.`,
            );
        }
        // Else, just return the error as is.
        throw e;
    }
}

module.exports = loadFrameworkModule();


// Copyright 2016-2018, Pulumi Corporation.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// This is the core location where the API package actually exports code for dependent packages to
// use.  We are effectively reflecting over the user's current environment and using that to switch
// in the actual platform implementation appropriate for them.

import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";

declare let module: any;
declare function require(name: string): any;

const config = new pulumi.Config("cloud");

const provider = config.require("provider");

// Load the implementation of @pulumi/cloud for the target provider.
function loadFrameworkModule() {
    // if the user has configured a fully qualified name for the provider then use 
    // that as the module reference so that cloud implementations, maintained out
    // of pulumi org, can be used, otherwise assume it's a @pulumi package.
    const qualifiedModule = /^@/.test(provider);
    const frameworkModule = qualifiedModule
        ? provider
        : `@pulumi/cloud-${provider}`;
    pulumi.log.debug(`Loading ${frameworkModule} for current environment.`);
    try {
        return require(frameworkModule);
    } catch (e) {
        // If the module was not found, return a useful error message.
        if ((e instanceof Error) && (e as any).code === "MODULE_NOT_FOUND") {
            throw new RunError(`
Attempted to load the '${provider}' implementation of '@pulumi/cloud', but no '${frameworkModule}' module is installed.\
 Install it now or select another provider implementation with the "cloud:provider" setting.`,
            );
        }
        // Else, just return the error as is.
        throw e;
    }
}

module.exports = loadFrameworkModule();


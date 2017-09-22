// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

// This is the core location where the API package actually exports code for dependent packages to
// use.  We are effectively reflecting over the user's current environment and using that to switch
// in the actual platform implementation appropriate for them.

import * as pulumi from "pulumi";

declare let module: any;
declare function require(name: string): any;

const config = new pulumi.Config("cloud:config");

// TODO(cyrusn): We probably want to move to a model where there is no fallback. It's probably best
// that if the appropriate provider is not set by the runtime environment, we just want to fail-fast
// so that that problem is addressed immediately.
//
// However, for now, it's fine to fall back to aws as that's the only provider we initially support
// and there's no need to force all consumers to have to set pulumi:config:provider.
let provider = config.get("provider");
if (!provider) {
    provider = "aws";

    // console.log(`Warning: Provider not given.  Falling back to ${provider} provider.`);
}

const frameworkModule = `@pulumi/cloud-${provider}`;

console.log(`Loading ${frameworkModule} for current environment.`);
module.exports = require(frameworkModule);

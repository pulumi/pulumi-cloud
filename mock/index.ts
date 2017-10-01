// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

// Note; We only export values (not types) from this module.  Nothing should ever be referencing
// this package.  Instead things should only reference the @pulumi/cloud package.  That package
// actually exports the API types.

export * from "./httpEndpoint";
export * from "./table";
export * from "./topic";
export * from "./service";
export { onError } from "./unhandledError";
import * as timer from "./timer";
export { timer };

// Code purely for enforcement that our module properly exports the same surface area as the API. We
// don't ever actually pull in any value from these modules, so there is no actual dependency or
// cost here.  This code can also go into a separate file if we don't want it cluttering this one.

import * as apiModule from "@pulumi/cloud";
import * as thisModule from "./index";

let apiShape: typeof apiModule = undefined as any;
let thisShape: typeof thisModule = undefined as any;

// This line ensures that our exported API is a superset of the framework API.
apiShape = thisShape;

// This line ensures that we export strictly the same API as the framework API.
thisShape = apiShape;

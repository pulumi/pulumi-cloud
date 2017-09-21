// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

// Note that we only export APIs with no AWS types exposed
// We must ensure that consumers of the Pulumi framework do
// not see any types from AWS when calling APIs in these
// exported modules.

export * from "./api";
export * from "./table";
export * from "./topic";
export { onError, ErrorHandler } from "./unhandledError";
import * as timer from "./timer";
export { timer };

// Code purely for enforcement that our module properly exports the same surface area as the API. We
// don't ever actually pull in any value from these modules, so there is no actual dependency or
// cost here.  This code can also go into a separate file if we don't want it cluttering this one.

import * as frameworkModule from "./../api/types";
import * as thisModule from "./index";

let frameworkShape: typeof frameworkModule = undefined as any;
let thisShape: typeof thisModule = undefined as any;

// This line ensures that our exported API is a superset of the framework API.
frameworkShape = thisShape;

// This line ensures that we export strictly the same API as the framework API. right now we can't
// uncomment it because our use of private members in classes *does* mean that we're effectively
// exporting a larger surface area.  We can solve this in the future by using the IIFE pattern.
// thisShape = frameworkShape;

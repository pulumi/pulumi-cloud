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

// Note: We only export APIs with no AWS types exposed We must ensure that consumers of the
// Pulumi framework do not see any types from AWS when calling APIs in these exported modules.

// Note: We only export values (not types) from this module.  Nothing should ever be referencing
// this package.  Instead things should only reference the @pulumi/cloud package.  That package
// actually exports the API types.

export * from "./bucket";
export { AwsCallbackData } from "./callback";
export * from "./function";
export * from "./api";
export * from "./httpServer";
export * from "./table";
export * from "./topic";
export * from "./service";
import * as config from "./config";
import * as timer from "./timer";
export { config, timer };

// Export internal AWS-only APIs that allows configuring AWS-specific settings.
export * from "./shared";

// Code purely for enforcement that our module properly exports the same surface area as the API. We
// don't ever actually pull in any value from these modules, so there is no actual dependency or
// cost here.  This code can also go into a separate file if we don't want it cluttering this one.

import * as apiModule from "@pulumi/cloud";
import * as thisModule from "./index";

let apiShape: typeof apiModule = undefined as any;
const thisShape: typeof thisModule = undefined as any;

// This line ensures that our exported API is a superset of the framework API.
apiShape = thisShape;

// This line ensures that we export strictly the same API as the framework API. right now we can't
// uncomment it because our use of private members in classes *does* mean that we're effectively
// exporting a larger surface area.  We can solve this in the future by using the IIFE pattern.
// thisShape = frameworkShape;

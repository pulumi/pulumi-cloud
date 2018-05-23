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

// Note; We only export values (not types) from this module.  Nothing should ever be referencing
// this package.  Instead things should only reference the @pulumi/cloud package.  That package
// actually exports the API types.

import "./config";

export * from "./bucket";
export * from "./httpEndpoint";
export * from "./table";
export { Topic } from "./topic";
export * from "./service";
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

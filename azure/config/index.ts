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

import * as azure from "@pulumi/azure";
import * as pulumi from "@pulumi/pulumi";
import { RunError } from "@pulumi/pulumi/errors";

const config = new pulumi.Config("cloud-azure");

const functionIncludePathsString = config.get("functionIncludePaths");
/**
 * Comma-seperated list of additional paths (relative to the project root) to include in Lambda zip uploads for
 * JavaScript callbacks.  E.g "./img.png,app/".
 */
export let functionIncludePaths: string[] | undefined = undefined;
if (functionIncludePathsString) {
    functionIncludePaths = functionIncludePathsString.split(",");
}

const functionIncludePackagesString = config.get("functionIncludePackages");
/**
 * Comma-seperated list of additional packages (relative to the project root) to include in Lambda zip uploads for
 * JavaScript callbacks.  E.g "body-parser,typescript".
 */
export let functionIncludePackages: string[] | undefined = undefined;
if (functionIncludePackagesString) {
    functionIncludePackages = functionIncludePackagesString.split(",");
}

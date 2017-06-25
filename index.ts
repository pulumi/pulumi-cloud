// Copyright 2016-2017, Pulumi Corporation
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

import { config } from "@lumi/aws";
import { printf } from "@lumi/lumirt";

export * from "./api";
export * from "./table";

// TODO[pulumi/lumi#268] We should be exposing our own region config
// setting on the `platform` pacakge and then passing it through to
// the AWS provider.  Until that works, we'll hard code it.
config.region = "us-east-2";

export function log(s: string) {
    printf(s);
    printf("\n");
}


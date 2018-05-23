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

import * as urlModule from "url";

// Canonicalize URLs - remove authorization, fragment and search parts.
export function canonicalUrl(url: string, baseUrl: string): string {
    const urlMod: typeof urlModule = require("url");
    let relUrl = urlMod.resolve(baseUrl, url);
    let parts = urlMod.parse(relUrl);
    return parts.protocol + "//" + parts.host + parts.pathname;
}

// Extract the hostname part from a URL
export function hostname(url: string): string | undefined {
    const urlMod: typeof urlModule = require("url");
    return urlMod.parse(url).hostname;
}

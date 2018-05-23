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

import * as pulumi from "@pulumi/pulumi";

// Configuration for the local integration example can be provided in two ways.  The first is as an
// environment variable of the form:
//
//      PULUMI_CONFIG='{ "config_key_1": "config_value_1", ..., "config_key_n": "config_value_n" }'
//
// The second is through arguments passed to the nodejs process of the form:
//
//      nodejs index.js config_key_1=config_value_1 ...  config_key_n=config_value_n
//
// Both of these can be provided, allowing for values to be provided both from the environment and
// from the command line.  Command line arguments will supercede environment values with the same
// name.
const envConfig = process.env.PULUMI_CONFIG;
if (envConfig) {
    console.log("Populating config with PULUMI_CONFIG environment variable...");
    const parsed = JSON.parse(envConfig);

    for (const key of Object.keys(parsed)) {
        const value = parsed[key];
        console.log(`Adding ${key}=${value} to the config store.`);
        pulumi.runtime.setConfig(key, value);
    }
}

for (const arg of process.argv.slice(2)) {
    const equalIndex = arg.indexOf("=");
    if (equalIndex > 0) {
        const key = arg.substr(0, equalIndex);
        const value = arg.substr(equalIndex + 1);

        console.log(`Adding ${key}=${value} to the config store.`);
        pulumi.runtime.setConfig(key, value);
    }
}

// Override config.require to provide a better error message to the user.
const originalRequire = pulumi.Config.prototype.require;
pulumi.Config.prototype.require = function require(key: string) {
    try {
        return originalRequire.apply(this, [key]);
    }
    catch (err) {
        const fullKey = err.key;
        throw new Error(
            `Missing required configuration variable '${fullKey}'\n` +
            `\tPlease add PULUMI_CONFIG='{ "${fullKey}": "value" }' to your environment ` +
            `or pass ${fullKey}=value in as command line parameter.`);
    }
};

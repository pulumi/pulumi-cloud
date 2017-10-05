// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";

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
        let fullKey = err.key;
        throw new Error(
            `Missing required configuration variable '${fullKey}'\n` +
            `\tPlease add PULUMI_CONFIG='{ "${fullKey}": "value" }' to your environment ` +
            `or pass ${fullKey}=value in as command line parameter.`);
    }
};

// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "pulumi";

export function requireConfig(config: pulumi.Config, name: string): string {
    try {
        return config.require(name);
    }
    catch (err) {
        let key = err.key;
        throw new Error(
            `Missing required configuration variable '${key}'\n` +
            `\tPlease add PULUMI_CONFIG='{ "${key}": "value" }' to your environment or pass ${key}=value in as command line parameter.`)
    }
}

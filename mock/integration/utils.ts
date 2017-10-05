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
            `\tplease provide this value on the command line as: ${key}=value\``)
    }
}

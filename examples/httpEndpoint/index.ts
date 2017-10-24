// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as pulumi from "pulumi";

const endpoint = new cloud.HttpEndpoint("endpoint1");
endpoint.staticFile("/test.json", "package.json", "text/plain");
endpoint.staticDirectory("/folder", "outer", "text/plain");

endpoint.publish();

// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import fetch from "node-fetch";

let nginx = new cloud.Service("nginx", {
    name: "nginx",
    image: "nginx",
    memory: 128,
    portMappings: [{containerPort: 80}],
});

let api = new cloud.HttpEndpoint("myendpoint");
api.get("/", async (req, res) => {
    try {
        console.log("timer starting")
        let hostandport = await nginx.getHostAndPort("nginx", 80);
        console.log("got host and port:" + hostandport);
        let resp = await fetch(`http://${hostandport}/`);
        let buffer = await resp.buffer();
        console.log(buffer.toString());
        res.status(resp.status);
        for (let header of Object.keys(resp.headers)) {
            res.setHeader(header, resp.headers.get(header));
        }
        res.setHeader("X-Forwarded-By", "my-pulumi-proxy");
        res.end(buffer);
    } catch(err) {
        console.error(err);
        res.status(500).end(`Pulumi proxy service error: ${err}`);
    }
});
api.publish().then(url => console.log(`Serving at: ${url}`));
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

import * as cloud from "@pulumi/cloud";
import { Config, Output } from "@pulumi/pulumi";

// A simple NGINX service.
let nginx = new cloud.Service("examples-nginx", {
    containers: {
        nginx: {
            image: "nginx",
            memory: 128,
            ports: [{ port: 80, external: true }],
        },
    },
    replicas: 1,
});

export let nginxEndpoint: Output<cloud.Endpoint> = nginx.defaultEndpoint;

let cachedNginx = new cloud.Service("examples-cached-nginx", {
    containers: {
        nginx: {
            build: {
                context: "./app",
                cacheFrom: true,
            },
            memory: 128,
            ports: [{ port: 80, external: true }],
        },
    },
    replicas: 1,
});

// expose some APIs meant for testing purposes.
// let api = new cloud.API("examples-containers");
// api.get("/test", async (req, res) => {
//     try {
//         res.json({
//             nginx: await nginx.getEndpoint(),
//             nginx2: await builtService.getEndpoint(),
//         });
//     } catch (err) {
//         console.error(errorJSON(err));
//         res.status(500).json(errorJSON(err));
//     }
// });

// function errorJSON(err: any) {
//     const result: any = Object.create(null);
//     Object.getOwnPropertyNames(err).forEach(key => result[key] = err[key]);
//     return result;
// }

// api.get("/", async (req, res) => {
//     try {
//         const fetch = (await import("node-fetch")).default;
//         // Use the NGINX or Redis Services to respond to the request.
//         console.log("handling /");
//         let page = await cache.get("page");
//         if (page) {
//             res.setHeader("X-Powered-By", "redis");
//             res.end(page);
//             return;
//         }
//         let endpoint = await nginx.getEndpoint("nginx", 80);
//         console.log(`got host and port: ${JSON.stringify(endpoint)}`);
//         let resp = await fetch(`http://${endpoint.hostname}:${endpoint.port}/`);
//         let buffer = await resp.buffer();
//         console.log(buffer.toString());
//         await cache.set("page", buffer.toString());
//         res.setHeader("X-Powered-By", "nginx");
//         res.end(buffer);
//     } catch (err) {
//         console.error(errorJSON(err));
//         res.status(500).json(errorJSON(err));
//     }
// });
// api.get("/run", async (req, res) => {
//     try {
//         await helloTask.run();
//         res.json({ success: true });
//     } catch (err) {
//         console.error(errorJSON(err));
//         res.status(500).json(errorJSON(err));
//     }
// });
// api.get("/custom", async (req, res) => {
//     try {
//         const fetch = (await import("node-fetch")).default;
//         let endpoint = await customWebServer.getEndpoint();
//         console.log(`got host and port: ${JSON.stringify(endpoint)}`);
//         let resp = await fetch(`http://${endpoint.hostname}:${endpoint.port}/`);
//         let buffer = await resp.buffer();
//         console.log(buffer.toString());
//         await cache.set("page", buffer.toString());
//         res.setHeader("X-Powered-By", "custom web server");
//         res.end(buffer);
//     } catch (err) {
//         console.error(errorJSON(err));
//         res.status(500).json(errorJSON(err));
//     }
// });
// api.proxy("/nginx", nginx.defaultEndpoint);
// export let frontendURL = api.publish().url;

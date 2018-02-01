// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import { Dependency } from "pulumi";
import fetch from "node-fetch";

// A simple NGINX service, scaled out over two containers.
let nginx = new cloud.Service("examples-nginx", {
    containers: {
        nginx: {
            image: "nginx",
            memory: 128,
            ports: [{ port: 80 }],
        },
    },
    replicas: 2,
});

export let nginxEndpoint: Dependency<cloud.Endpoint> = nginx.endpoints.apply(endpoints => endpoints.nginx[80]);

// A simple MongoDB service, using a data volume which persists on the backing
// storage beyond the lifetime of the deployment.
let dataVolume = new cloud.SharedVolume("examples-mymongodb-data");
let mongodb = new cloud.Service("examples-mymongodb", {
    containers: {
        mongodb: {
            image: "mongo",
            memory: 128,
            ports: [{ port: 27017, external: true }],
            volumes: [{ containerPath: "/data/db", sourceVolume: dataVolume }],
        },
    },
});

let customWebServer = new cloud.Service("mycustomservice", {
    containers: {
        webserver: {
            memory: 128,
            ports: [{ port: 80 }],
            function: () => {
                let rand = Math.random();
                let http = require("http");
                http.createServer((req: any, res: any) => {
                    res.end(`Hello, world! (from ${rand})`);
                }).listen(80);
            },
        },
    },
    replicas: 2,
});

// TODO[pulumi/pulumi#397] Would be nice if this was a Secret<T> and closure
// serialization knew to pass it in encrypted env vars.
// TODO[pulumi/pulumi#381] Might also be nice if this could be generated uniquely per stack.
let redisPassword = "SECRETPASSWORD";

/**
 * A simple Cache abstration, built on top of a Redis container Service.
 */
class Cache {

    get: (key: string) => Promise<string>;
    set: (key: string, value: string) => Promise<void>;

    constructor(name: string, memory: number = 128) {
        let redis = new cloud.Service(name, {
            containers: {
                redis: {
                    image: "redis:alpine",
                    memory: memory,
                    ports: [{ port: 6379 }],
                    command: ["redis-server", "--requirepass", redisPassword],
                },
            },
        });
        this.get = (key: string) => {
            return redis.getEndpoint("redis", 6379).then(endpoint => {
                console.log(`Endpoint: ${JSON.stringify(endpoint)}`);
                let client = require("redis").createClient(
                    endpoint.port,
                    endpoint.hostname,
                    { password: redisPassword },
                );
                console.log(client);
                return new Promise<string>((resolve, reject) => {
                    client.get(key, (err: any, v: any) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(v);
                        }
                    });
                });
            });
        };
        this.set = (key: string, value: string) => {
            return redis.getEndpoint("redis", 6379).then(endpoint => {
                console.log(`Endpoint: ${JSON.stringify(endpoint)}`);
                let client = require("redis").createClient(
                    endpoint.port,
                    endpoint.hostname,
                    { password: redisPassword },
                );
                console.log(client);
                return new Promise<void>((resolve, reject) => {
                    client.set(key, value, (err: any, v: any) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                });
            });
        };
    }
}

let cache = new Cache("examples-mycache");

let helloTask = new cloud.Task("examples-hello-world", {
    image: "hello-world",
    memory: 20,
});

// build an anonymous image:
let builtService = new cloud.Service("examples-nginx2", {
    containers: {
        nginx: {
            build: "./app",
            memory: 128,
            ports: [{ port: 80 }],
        },
    },
    replicas: 2,
});

// expose some APIs meant for testing purposes.
let api = new cloud.HttpEndpoint("examples-containers");
api.get("/test", async (req, res) => {
    try {
        res.json({
            nginx: await nginx.getEndpoint(),
            mongodb: await mongodb.getEndpoint(),
            nginx2: await builtService.getEndpoint(),
        });
    } catch (err) {
        res.status(500).json(errorJSON(err));
    }
});

function errorJSON(err: any) {
    const result: any = Object.create(null);
    Object.getOwnPropertyNames(err).forEach(key => result[key] = err[key]);
    return result;
}

api.get("/", async (req, res) => {
    try {
        // Use the NGINX or Redis Services to respond to the request.
        console.log("handling /");
        let page = await cache.get("page");
        if (page) {
            res.setHeader("X-Powered-By", "redis");
            res.end(page);
            return;
        }
        let endpoint = await nginx.getEndpoint("nginx", 80);
        console.log(`got host and port: ${JSON.stringify(endpoint)}`);
        let resp = await fetch(`http://${endpoint.hostname}:${endpoint.port}/`);
        let buffer = await resp.buffer();
        console.log(buffer.toString());
        await cache.set("page", buffer.toString());
        res.setHeader("X-Powered-By", "nginx");
        res.end(buffer);
    } catch (err) {
        console.error(err);
        res.status(500).end(`Pulumi proxy service error: ${err}`);
    }
});
api.get("/run", async (req, res) => {
    try {
        // Launch 10 instances of the Task.
        let tasks: Promise<void>[] = [];
        for (let i = 0; i < 10; i++) {
            tasks.push(helloTask.run());
        }
        await Promise.all(tasks);
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Error running task." });
    }
});
api.get("/custom", async (req, res) => {
    try {
        let endpoint = await customWebServer.getEndpoint();
        console.log(`got host and port: ${JSON.stringify(endpoint)}`);
        let resp = await fetch(`http://${endpoint.hostname}:${endpoint.port}/`);
        let buffer = await resp.buffer();
        console.log(buffer.toString());
        await cache.set("page", buffer.toString());
        res.setHeader("X-Powered-By", "custom web server");
        res.end(buffer);
    } catch (err) {
        console.error(err);
        res.status(500).end(`Pulumi proxy service error: ${err}`);
    }
});
api.proxy("/nginx", nginx.endpoints.apply(endpoints => endpoints.nginx[80]));
export let frontendURL: Dependency<string> = api.publish().url;

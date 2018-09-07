// Copyright 2016-2018, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";
import * as cloud from "@pulumi/cloud";
import * as cache from "./cache";
import * as express from "express";
import * as parseUrl from "parseurl";
import * as path from "path";
import * as fs from "fs";
import * as http from "http";
import * as mime from "mime-types";

type AsyncRequestHandler = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>;

const asyncMiddleware = (fn: AsyncRequestHandler) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };


// Create a table `urls`, with `name` as primary key.
let urlTable = new cloud.Table("urls", "name");

// Create a cache of frequently accessed urls.
let urlCache = new cache.Cache("urlcache");

// Create a web server.
let endpoint = new cloud.HttpServer("my", () => {
    let app = express();

    // GET /url lists all URLs currently registered.
    app.get("/url", asyncMiddleware(async (req, res) => {
        try {
            let items = await urlTable.scan();
            console.log("Items: " + JSON.stringify(items));
            res.status(200).json(items);
            console.log(`GET /url retrieved ${items.length} items`);
        } catch (err) {
            res.json(err.stack);
            console.log(`GET /url error: ${err.stack}`);
        }
    }));

    // GET /url/{name} redirects to the target URL based on a short-name.
    app.get("/url/:name", asyncMiddleware(async (req, res) => {
        let name = req.params.name
        try {
            // First try the Redis cache.
            let url = await urlCache.get(name);
            if (url) {
                console.log(`Retrieved value from Redis: ${url}`);
                res.setHeader("X-Powered-By", "redis");
            }
            else {
                // If we didn't find it in the cache, consult the table.
                let value = await urlTable.get({name});
                url = value && value.url;
                if (url) {
                    urlCache.set(name, url); // cache it for next time.
                }
            }

            // If we found an entry, 301 redirect to it; else, 404.
            if (url) {
                res.setHeader("Location", url);
                res.status(302);
                res.end("");
                console.log(`GET /url/${name} => ${url}`)
            }
            else {
                res.status(404);
                res.end("");
                console.log(`GET /url/${name} is missing (404)`)
            }
        } catch (err) {
            res.json(err.stack);
            console.log(`GET /url/${name} error: ${err.stack}`);
        }
    }));

    // POST /url registers a new URL with a given short-name.
    app.post("/url", asyncMiddleware(async (req, res) => {
        let url = <string>req.query["url"];
        let name = <string>req.query["name"];
        try {
            console.log("Inserting: " + JSON.stringify({ name, url }));
            await urlTable.insert({ name, url });
            await urlCache.set(name, url);
            res.json({ shortenedURLName: name });
            console.log(`POST /url/${name} => ${url}`);
        } catch (err) {
            res.json(err.stack);
            console.log(`POST /url/${name} => ${url} error: ${err.stack}`);
        }
    }));

    // Serve all files in the www directory to the root.
    // Note: www will be auto-included using config. either
    //      cloud-aws:functionIncludePaths or
    //      cloud-azure:functionIncludePaths

    staticRoutes(app, "/", "www");
    // app.use("/", express.static("www"));
    // app.use("/", (req, res) => {
    //     const originalUrl = parseUrl.original(req)
    //     const pathname = parseUrl(req)!.pathname
    //     res.json({ originalUrl, pathname, resolved: path.resolve("www") });
    // });

    // app.get("/", (req, res) => {
    //     res.json({ fellthrough: false, cwd: process.cwd() });
    // });

    app.get("*", (req, res) => {
        res.json({ uncaught: { url: req.url, baseUrl: req.baseUrl, originalUrl: req.originalUrl } });
    });

    // app.use(function (err: any, req: any, res: any, next: any) {
    //     res.json({ finalinnerhandler: "triggered " + err + "\n" + err.stack });
    // });

    return app;
});

function staticRoutes(app: express.Express, path: string, root: string) {
    for (const child of fs.readdirSync("./" + root)) {
        app.get(path + child, (req, res) => {
            try
            {
                // console.log("Trying to serve: " + path + child)
                // res.json({ serving: child });
                const localPath = "./" + root + "/" + child;
                const contents = fs.readFileSync(localPath);

                var type = mime.contentType(child)
                if (type) {
                    res.setHeader('Content-Type', type);
                }

                const stat = fs.statSync(path);

                res.setHeader("Content-Length", stat.size);
                res.end(contents);
            }
            catch (err) {
                console.log(JSON.stringify({ message: err.message, stack: err.stack }));
                res.json({ message: err.message, stack: err.stack });
            }
        });
    }
}

export let endpointUrl = endpoint.url;

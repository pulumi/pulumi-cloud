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
import { authMiddleware } from "./middleware";
import * as express from "express";


type AsyncRequestHandler = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>;

const asyncMiddleware = (fn: AsyncRequestHandler) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };

let todos = new cloud.Table("examples-todo");
let server = new cloud.HttpServer("examples-todo", () => {
    const app = express();

    // Serve all files in the 'www' folder under '/'
    // 'index.html' will be automatically served as '/' as well as '/index.html'.
    app.use("/", express.static("www"));

    // GET/POST todo handlers
    app.get("/todo/:id", authMiddleware, asyncMiddleware(async (req, res) => {
        console.log("GET /todo/" + req.params["id"]);
        try {
            let item = await todos.get({ id: req.params["id"] });
            res.status(200).json(item.value);
        } catch (err) {
            res.status(500).json(err);
        }
    }));
    app.post("/todo/:id", asyncMiddleware(async (req, res) => {
        console.log("POST /todo/" + req.params["id"]);
        try {
            await todos.insert({ id: req.params["id"], value: req.body.toString() });
            res.status(201).json({});
        } catch (err) {
            res.status(500).json(err);
        }
    }));
    app.get("/todo", asyncMiddleware(async (req, res) => {
        console.log("GET /todo");
        try {
            let items = await todos.scan();
            res.status(200).json(items);
        } catch (err) {
            res.status(500).json(err);
        }
    }));

    return app;
});

// Publish
export let url = server.url;

// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import { authMiddleware } from "./middleware";

let todos = new cloud.Table("todo");
let api = new cloud.HttpEndpoint("todo");

// Serve all files in the assets folder under /
// 'index.html' will be automatically served under / as well as /index.html.
api.static("/", "www");

// GET/POST todo handlers
api.get("/todo/{id}", authMiddleware, async (req, res) => {
    console.log("GET /todo/" + req.params["id"]);
    try {
        let item = await todos.get({ id: req.params["id"] });
        res.status(200).json(item.value);
    } catch (err) {
        res.status(500).json(err);
    }
});
api.post("/todo/{id}", async (req, res) => {
    console.log("POST /todo/" + req.params["id"]);
    try {
        await todos.insert({ id: req.params["id"], value: req.body.toString() });
        res.status(201).json({});
    } catch (err) {
        res.status(500).json(err);
    }
});
api.get("/todo", async (req, res) => {
    console.log("GET /todo");
    try {
        let items = await todos.scan();
        res.status(200).json(items);
    } catch (err) {
        res.status(500).json(err);
    }
});

// Publish
api.publish().url.then((url: string | undefined) => {
    if (url) {
        console.log(`Listening at: ${url}`);
    }
});


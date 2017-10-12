// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.
/* tslint:disable */

import * as cloud from "@pulumi/cloud";
import { authMiddleware } from "./middleware";

let todos = new cloud.Table("todo");
let api = new cloud.HttpEndpoint("todo");

// Index handler
api.staticFile("/", "index.html", "text/html");
api.staticFile("/favicon.ico", "favicon.ico", "image/x-icon");

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
api.publish().then((url: string | undefined) => {
    if (url) {
        console.log(`Listening at: ${url}`);
    }
});


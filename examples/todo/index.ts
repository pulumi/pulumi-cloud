// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as platform from "@lumi/platform";

let todos = new platform.Table("todo", "id", "S", {});
let api = new platform.HttpAPI("todo");

// Index handler
api.routeStatic("GET", "/", "index.html", "text/html");
api.routeStatic("GET", "/favicon.ico", "favicon.ico", "image/x-icon");

// GET/POST todo handlers
api.get("/todo/{id}", {}, async (req, res) => {
    console.log("GET /todo/" + req.params.id);
    try {
        let item = await todos.get({ id: req.params.id });
        res.status(200).json(item.Value);
    } catch (err) {
        res.status(500).json(err);
    }
});
api.post("/todo/{id}", {}, async (req, res) => {
    console.log("POST /todo/" + req.params.id);
    try {
        await todos.insert({ id: req.params.id, value: req.body.toString() });
        res.status(201).json({});
    } catch (err) {
        res.status(500).json(err);
    }
});
api.get("/todo", {}, async (req, res) => {
    console.log("GET /todo");
    try {
        let items = await todos.scan();
        res.status(200).json(items);
    } catch (err) {
        res.status(500).json(err);
    }
});

// Publish
let url = api.publish();
platform.log(`Listening at:
${url}
`);

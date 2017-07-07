// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as platform from "@lumi/platform";
import * as table from "./table";
declare let JSON: any; // TODO[pulumi/lumi#230] JSON object should be availble in global scope.
let db = table.db; // TODO[pulumi/lumi#230] Imports should be available in the scope chain.

let todos = new platform.Table("todo", "id", "S", {});
let api = new platform.HttpAPI("todoapp");

// Index handler
api.routeStatic("GET", "/", "index.html", "text/html");
api.routeStatic("GET", "/favicon.ico", "favicon.ico", "image/x-icon");

// GET/POST todo handlers
api.get("/todo/{id}", {}, async (req, res) => {
  console.log("GET /todo/" + req.params.id);
  try {
    let item = await db(todos).get({ id: req.params.id });
    res.status(200).json(item.Value);
  } catch (err) {
    res.status(500).json(err);
  }
});
api.post("/todo/{id}", {}, async (req, res) => {
  console.log("POST /todo/" + req.params.id);
  try {
    await db(todos).insert({ id: req.params.id, value: req.body });
    res.status(201).json({});
  } catch (err) {
    res.status(500).json(err);
  }
});
api.get("/todo", {}, async (req, res) => {
  console.log("GET /todo");
  try {
    let items = await db(todos).scan();
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

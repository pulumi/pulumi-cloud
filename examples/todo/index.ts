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
api.get("/todo/{id}", {}, (req, res) => {
  console.log("GET /todo/" + req.params.id);
  db(todos).get({ id: req.params.id }, (err, data) => {
    if (err !== null) {
      res.status(500).json(err);
    } else {
      res.status(200).json(data.Item.Value);
    }
  });
});
api.post("/todo/{id}", {}, (req, res) => {
  console.log("POST /todo/" + req.params.id);
  db(todos).insert({ id: req.params.id, value: req.body }, (err, data) => {
    if (err !== null) {
      res.status(500).json(err);
    } else {
      res.status(201).json({});
    }
  });
});
api.get("/todo", {}, (req, res) => {
  console.log("GET /todo");
  db(todos).scan((err, data) => {
    if (err !== null) {
      res.status(500).json(err);
    } else {
      res.status(200).json(data.Items);
    }
  });
});

// Publish
let url = api.publish();
platform.log(`Listening at:
${url}
`);

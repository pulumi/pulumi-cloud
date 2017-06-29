// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as platform from "@lumi/platform";
import * as table from "./table";
declare let JSON: any; // TODO[pulumi/lumi#230] JSON object should be availble in global scope.
let db = table.db; // TODO[pulumi/lumi#230] Imports should be available in the scope chain.

let todos = new platform.Table("todo", "id", "S", {});
let api = new platform.API("todoapp");

// Index handler
api.routeStatic("GET", "/", "index.html", "text/html");
api.routeStatic("GET", "/favicon.ico", "favicon.ico", "image/x-icon");

// GET/POST todo handlers
api.route("GET", "/todo/{id}", {}, (req, cb) => {
  console.log("GET /todo/" + req.pathParameters.id);
  db(todos).get({ id: req.pathParameters.id }, (err, data) => {
    if (err !== null) {
      cb(null, { statusCode: 500, body: JSON.stringify(err) });
    } else {
      cb(null, { statusCode: 200, body: data.Item.Value });
    }
  });
});
api.route("POST", "/todo/{id}", {}, (req, cb) => {
  console.log("POST /todo/" + req.pathParameters.id);
  db(todos).insert({ id: req.pathParameters.id, value: req.body }, (err, data) => {
    if (err !== null) {
      cb(null, { statusCode: 500, body: JSON.stringify(err) });
    } else {
      cb(null, { statusCode: 201, body: "{}" });
    }
  });
});
api.route("GET", "/todo", {}, (req, cb) => {
  console.log("GET /todo");
  db(todos).scan((err, data) => {
    if (err !== null) {
      cb(null, { statusCode: 500, body: JSON.stringify(err) });
    } else {
      cb(null, { statusCode: 200, body: JSON.stringify(data.Items) });
    }
  });
});

// Publish
let url = api.publish();
platform.log(`Listening at:
${url}
`);

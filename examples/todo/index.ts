// Licensed to Pulumi Corporation ("Pulumi") under one or more
// contributor license agreements.  See the NOTICE file distributed with
// this work for additional information regarding copyright ownership.
// Pulumi licenses this file to You under the Apache License, Version 2.0
// (the "License"); you may not use this file except in compliance with
// the License.  You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

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
  db(todos).get({ id: req.pathParameters.id }, (err, data) => {
    if (err !== null) {
      cb(null, { statusCode: 500, body: JSON.stringify(err) });
    } else {
      cb(null, { statusCode: 200, body: data.Item.Value });
    }
  });
});
api.route("POST", "/todo/{id}", {}, (req, cb) => {
  db(todos).insert({ id: req.pathParameters.id, value: req.body }, (err, data) => {
    if (err !== null) {
      cb(null, { statusCode: 500, body: JSON.stringify(err) });
    } else {
      cb(null, { statusCode: 201, body: "{}" });
    }
  });
});
api.route("GET", "/todo", {}, (req, cb) => {
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

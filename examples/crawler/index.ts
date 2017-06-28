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
import * as queue from "./queue";
let q = queue.q;
declare let JSON: any;

let countDown = new platform.Queue("queue");
countDown.forEach("watcher", (item, cb) => {
  let num = JSON.parse(item);
  console.log(num);
  if (num > 0) {
    q(countDown).push(JSON.stringify(num - 1), cb);
  } else {
    cb(null);
  }
});

platform.log("Hello!");

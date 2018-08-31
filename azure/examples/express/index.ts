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
import * as express from "express";
import { basename } from "path";

const server = new cloud.HttpServer("myexpress", () => {
    const app = express();
    const router = express.Router();

    app.use("/api", router);

    router.get("/", (req, res) => {
        res.json({ succeeded: true });
    });

    router.get("*", (req, res) => {
        res.json({ uncaught: { url: req.url, baseUrl: req.baseUrl, originalUrl: req.originalUrl } });
    });

    return app;
});

// Export the URL for the express Endpoint.
export let url = server.url;

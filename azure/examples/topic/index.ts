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

interface Message {
    title: string;
    info: string;
}

const topic = new cloud.Topic<Message>("example");
topic.subscribe("example", async (message) => {
    console.log("Subscription fired.");
    console.log("Got: " + JSON.stringify(message));
});

type AsyncRequestHandler = (req: express.Request, res: express.Response, next: express.NextFunction) => Promise<void>;

const asyncMiddleware = (fn: AsyncRequestHandler) =>
    (req: express.Request, res: express.Response, next: express.NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };

const server = new cloud.HttpServer("example", () => {
    const app = express();
    const router = express.Router();

    app.use("/api", router);

    router.get("*", asyncMiddleware(async (req, res) => {
        try {
            await topic.publish({ title: "Http endpoint hit!", info: req.originalUrl });
            res.json({ success: true });
        }
        catch (err) {
            res.json({ error: JSON.stringify(err) });
        }
    }));

    return app;
});

// Export the URL for the express Endpoint.
export let url = server.url;

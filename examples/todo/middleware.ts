// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";

export let authMiddleware: cloud.RouteHandler = (req, res, next) => {
    let auth = req.headers["Authorization"];
    if (auth !== "Bearer SECRETPASSWORD") {
        res.status(401).end("Authorization header required");
        return;
    }
    next();
};

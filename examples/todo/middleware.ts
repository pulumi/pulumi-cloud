// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as pulumi from "@pulumi/pulumi";

export let authMiddleware: pulumi.RouteHandler = (req, res, next) => {
    let auth = req.headers["Authorization"];
    if (auth !== "Bearer SECRETPASSWORD") {
        res.status(401).end("Authorization header required");
        return;
    }
    next();
};

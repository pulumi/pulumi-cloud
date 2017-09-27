// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import * as auth from "./auth";
import * as session from "./session";

auth.endpoint.url!.then(url => console.log(url));

let myapp = new cloud.HttpEndpoint("myapp");

myapp.get("/test", async (req, res) => {
    if ((req as session.Request).session.views) {
        (req as session.Request).session.views++
        res.setHeader('Content-Type', 'text/html')
        res.write('<p>views: ' + (req as session.Request).session.views + '</p>')
        res.write('<p>expires in: ' + ((req as session.Request).session.cookie.maxAge / 1000) + 's</p>')
        res.end()
    } else {
        (req as session.Request).session.views = 1
        res.end('welcome to the session demo. refresh!')
    }
})

myapp.get("/", async (req, res) => {
    res.setHeader("Content-Type", "text/html")
        .end("<a href='user'>User page</a>");
});

myapp.get("/user", auth.requireLogin(), async (req, res) => {
    let user = (req as any).username;
    res.setHeader("Content-Type", "text/html")
        .end(`Welcome <b>${user}</b>.`);
});

myapp.publish().then(url => console.log(`Serving user application at ${url}`));
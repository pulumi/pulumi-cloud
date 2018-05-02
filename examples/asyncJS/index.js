"use strict";
const pulumi = require("@pulumi/pulumi");
const cloud = require("@pulumi/cloud");

// Create an API endpoint
let endpoint = new cloud.HttpEndpoint("hello-world");

endpoint.get("/foo", async (req, res) => {
    res.json({ success: true });
    res.status(200);
});

module.exports.url = endpoint.publish().url;

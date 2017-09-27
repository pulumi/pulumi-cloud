// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";

// TODO: Either move this into config or find some way to generate once
let secret = Buffer.from("fe1a1915a379f3be5394b64d14794932", "hex");

// TODO: Put everything here inside a class so that we can create multiple and
// accept parameterization

// users is the data store for managing user accounts
let users = new cloud.Table("users", "username");

export async function createUser(username: string, password: string): Promise<string> {
    // TODO - would be nice to be able to put these at global scope and lift
    // them to globals in the captued lambda.
    let bcrypt = require("bcrypt-nodejs");
    let hashedPassword = bcrypt.hashSync(password);
    // TODO: Need a return value indicating whether the insert succeeded
    await users.insert({username, hashedPassword});
    return username;
}

// login attempts to log in a user using a username and password, returning a
// token for the logged-in user if succesful, or else returning a failed
// Promise.
export async function login(username: string, password: string): Promise<string> {
    let bcrypt = require("bcrypt-nodejs");
    let jwt = require("jwt-simple");
    let user = await users.get({username});
    if (!user) {
        throw new Error("Invalid username or password.");
    }
    let valid = bcrypt.compareSync(password, user.hashedPassword);
    if (!valid) {
        throw new Error("Inavlid username or password.");
    }
    return jwt.encode({username}, secret);
}

export async function authMiddleware(req: cloud.Request, res: cloud.Response, next: () => void): Promise<void> {
    let jwt = require("jwt-simple");
    let authHeader = req.headers["Authorization"] || "";
    if (authHeader.substring(0, 7) !== "Bearer ") {
        res.status(401).json({error: "Invalid Authorization header: expected 'Bearer <token>'"});
        return;
    }
    let token = authHeader.substring(7);
    try {
        let {username} = jwt.decode(token, secret);
        (req as any).username = username;
    } catch (err) {
        res.status(401).json({error: "Invalid Authorization header: invalid token"});
        return;
    }
    next();
}

// requireLogin is middleware which requires that a user is logged in,
// redirecting to a login page if they are not
export function requireLogin(redirectTo = "/login"): 
    (req: cloud.Request, res: cloud.Response, next: () => void) => Promise<void> {
    return async(req, res, next) => {
        // TODO - need to rely on session store.
        throw new Error("not yet implemented");
    };
}

export let endpoint: cloud.HttpEndpoint = new cloud.HttpEndpoint("auth");

endpoint.get("/test", async (req, res) => {
    res.json(req);
});

endpoint.get("/authorize", async (req, res) => {
    // TODO: Also support social providers which will redirect to them here instead of to ourself.
    res.status(302).setHeader("Location", "/login"); // redirect to username/password login
    throw new Error("not yet implemented");
});

endpoint.get("/logout", async (req, res) => {
    throw new Error("not yet implemented");
});

// GET /login serves the username/password login page for this application
endpoint.staticFile("/login", "index.html", "text/html");

// Handle form submit from GET /login for existing user loging
endpoint.post("/login", async (req, res) => {
    let qs = require("querystring");
    let args = qs.parse(req.body.toString());
    let token = await login(args.username, args.password);
    res.json({token});
});

//Handle form submit from GET /login for new user signup
endpoint.post("/signup", async (req, res) => {
    let qs = require("querystring");
    let args = qs.parse(req.body.toString());
    await createUser(args.username, args.password);
    let token = await login(args.username, args.password);
    res.json({token});
});

endpoint.post("/login/callback", async (req, res) => {
    console.log(req);
    res.json(req);
});

endpoint.publish()
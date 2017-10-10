// Get the source code from env var
let src = process.env["PULUMI_SRC"];

// Write to disk and require the module from the filesystem
require('fs').writeFileSync("__index.js", src);
let m = require("./__index");

// Ensure the provided source defined a module exposing a `handler` function.
if (!m.handler || typeof m.handler !== "function") {
    throw new Error("Provided source text must define a Node.js module with a `exports.handler` function exported");
}

// Invoke the exposed handler
m.handler();

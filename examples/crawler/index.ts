// Copyright 2016-2017, Pulumi Corporation.  All rights reserved.

import * as cloud from "@pulumi/cloud";
import { Output } from "pulumi";
import * as $ from "cheerio";
import fetch, { Response } from "node-fetch";
import { canonicalUrl, hostname} from "./support";

// Pending sites to be processed
let sites = new cloud.Topic<string>("examples-sites-to-process");
// Documents and assocaited metadata for crawled sites
let documents = new cloud.Table("examples-documents");

// Front end API and console
let frontEnd = new cloud.HttpEndpoint("examples-crawler-front-end");
frontEnd.post("/queue", async (req, res) => {
    let url = req.body.toString();
    console.log(`Pushing ${url} to processing queue`);
    await sites.publish(url);
    res.status(200).json("success");
});
frontEnd.get("/documents/stats", async (_, res) => res.json({count: (await documents.scan()).length}));
export let publicURL = frontEnd.publish().url;
publicURL.apply(u => {
    console.log("Launched crawler front end @ " + u);
});

// Processing of each newly discovered site
sites.subscribe("foreachurl", async (url) => {
    console.log(`${url}: Processing`);

    // Return immediately if the url has already been crawled
    let found = await documents.get({ id: url });
    if (found && !found.crawlInProgress) {
        console.log(`${url}: Already found`);
        return;
    }

    // Fetch the contents at the URL
    console.log(`${url}: Getting`);
    let res: Response;
    try {
        res = await fetch(url);
    } catch (err) {
        console.log(`${url}: Failed to GET`);
        return;
    }

    // Only proceed if the returned content is HTML
    console.log(`${url}: Fetched with result ${res.status}`);
    let html = await res.text();
    let contentType = res.headers.get("content-type");
    if (!(contentType && contentType.indexOf("text/html") > -1)) {
        console.log(`${url}: Skipping non-HTML`);
        return;
    }

    // Register the metadata discovered for the URL
    console.log(`${url}: Inserting HTML document of length ${html.length} and type ${contentType}`);
    await documents.insert({
        id: url,
        crawlDate: Date.now(),
        contentType: contentType,
        statusCode: res.status,
        contentLength: html.length,
        crawlInProgress: true,
    });

    // Loop over all `<a href=...>` that match our filter, and collect in a local Set.
    let links = new Set();
    let anchors = $("a", html);
    for (let i = 0; i < anchors.length; i++) {
        let rawHref = anchors[i].attribs["href"];
        if (!rawHref) { continue; }
        let href = canonicalUrl(rawHref, url);
        console.log(`${url}: Found href: ${rawHref}, canonicalized to ${href}`);
        let host = hostname(href);
        if (href && host && (host.indexOf("visualstudio.com") > -1)) {
            console.log(`${url}: Found visualstudio href: ${href}`);
            links.add(href);
        }
    }

    // Loop over the set and publish as new site if not found yet.
    for (let link of links) {
        found = await documents.get({id: link});
        if (!found) {
            console.log(`${url}: Publishing new url: ${link}`);
            await sites.publish(link);
        }
    }

    // Register that we completed publishing all referened URLs from this site.  We can recover from
    // failures by re-crawling any sites with `crawlInProgress == true`.
    await documents.update({ id: url }, { crawlInProgress: false, crawlFinishedDate: Date.now() });
    console.log("Succeed url: " + url);
});

// Periodically check for any URLs which did not complete processing
// and try them again (for example, in case they failed due to throttling).
cloud.timer.interval("cleanup", {minutes: 5}, async () => {
    console.log(`Cleanup: starting cleanup.`);
    let cleanupCount = 0;
    let alldocs = await documents.scan();
    console.log(`Cleanup: scan returned ${alldocs.length} documents.`);
    for (let doc of alldocs) {
        if (doc.crawlInProgress) {
            await sites.publish(doc.id);
            cleanupCount++;
        }
    }
    console.log(`Cleanup: restarted ${cleanupCount} items.`);
});

// Register to be informed of any errors during execution.  In particular, this will identify cases
// where aggressive throttling of data storage leads to failures even after retries.
cloud.onError("onerror", (message, payload) => {
    console.log(`${message}: ${JSON.stringify(payload)}`);
});

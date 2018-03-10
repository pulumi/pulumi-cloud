import * as urlModule from "url";

// Canonicalize URLs - remove authorization, fragment and search parts.
export function canonicalUrl(url: string, baseUrl: string): string {
    const urlMod: typeof urlModule = require("url");
    let relUrl = urlMod.resolve(baseUrl, url);
    let parts = urlMod.parse(relUrl);
    return parts.protocol + "//" + parts.host + parts.pathname;
}

// Extract the hostname part from a URL
export function hostname(url: string): string | undefined {
    const urlMod: typeof urlModule = require("url");
    return urlMod.parse(url).hostname;
}

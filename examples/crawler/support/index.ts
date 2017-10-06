import { parse, resolve } from "url";

// Canonicalize URLs - remove authorization, fragment and search parts.
export function canonicalUrl(url: string, baseUrl: string): string {
    let relUrl = resolve(baseUrl, url);
    let parts = parse(relUrl);
    return parts.protocol + "//" + parts.host + parts.pathname;
}

// Extract the hostname part from a URL
export function hostname(url: string): string | undefined {
    return parse(url).hostname;
}

import { createRequire } from "node:module";
interface RobotsRules {
  isAllowed(url: string, agent?: string): boolean | undefined;
  getCrawlDelay(agent?: string): number | undefined;
}
// robots-parser is CommonJS; its bundled default-export typing is incompatible with NodeNext.
const robotsParser = createRequire(import.meta.url)("robots-parser") as (
  url: string,
  text: string,
) => RobotsRules;
import { identifyListing, websites } from "./sites/registry.js";

const agent = "EstiaPropertySearch/0.1";
const allowed = new Set([
  "html.duckduckgo.com",
  ...websites.flatMap((s) => [s.domain, "www." + s.domain]),
]);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
export function allowedUrl(raw: string): URL {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !allowed.has(url.hostname)
  )
    throw new Error("URL is outside the supported public websites.");
  return url;
}
export function publicReader(options: { browser?: (url: string) => Promise<string> } = {}) {
  const robots = new Map<string, ReturnType<typeof robotsParser>>();
  const blocked = new Map<string, string>();
  const lastRequest = new Map<string, number>();

  async function download(raw: string, redirects = 0): Promise<string> {
    const url = allowedUrl(raw);
    const error = blocked.get(url.origin);
    if (error) throw new Error(error);
    if (redirects > 3) throw new Error("Too many redirects.");
    const delay = Math.max(
      2500,
      (robots.get(url.origin)?.getCrawlDelay(agent) ?? 0) * 1000,
    );
    if (delay > 60000)
      throw new Error("Website requests a longer crawl delay; page deferred.");
    await sleep(
      Math.max(0, delay - (Date.now() - (lastRequest.get(url.origin) ?? 0))),
    );
    lastRequest.set(url.origin, Date.now());
    if (options.browser && url.pathname !== "/robots.txt") {
      try { return await options.browser(url.href); }
      catch (error) {
        if (error instanceof Error && /HTTP (401|403|429)|human check/.test(error.message)) blocked.set(url.origin, error.message);
        throw error;
      }
    }
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      redirect: "manual",
      headers: {
        "User-Agent": agent,
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.8",
        "Accept-Language": "el,en;q=0.8",
      },
    });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      await response.body?.cancel();
      const next = allowedUrl(
        new URL(response.headers.get("location") ?? "", url).toString(),
      );
      if (
        next.origin !== url.origin &&
        next.hostname.replace(/^www\./, "") !==
          url.hostname.replace(/^www\./, "")
      )
        throw new Error("Website redirected to a different service.");
      const fromListing = identifyListing(url.toString());
      const toListing = identifyListing(next.toString());
      if (
        fromListing &&
        (!toListing ||
          fromListing.sourceId !== toListing.sourceId ||
          fromListing.externalId !== toListing.externalId)
      )
        throw new Error(
          "The listing redirected to a different page; availability is unconfirmed.",
        );
      if (robots.get(next.origin)?.isAllowed(next.toString(), agent) === false)
        throw new Error("Website robots rules disallow the redirected page.");
      return download(next.toString(), redirects + 1);
    }
    if (!response.ok) {
      await response.body?.cancel();
      const message = "HTTP " + response.status + " from " + url.hostname;
      if ([401, 403, 429].includes(response.status))
        blocked.set(url.origin, message);
      throw new Error(message);
    }
    if (
      !/text\/|application\/xhtml\+xml/i.test(
        response.headers.get("content-type") ?? "",
      )
    ) {
      await response.body?.cancel();
      throw new Error("Website did not return a public HTML/text document.");
    }
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty website response.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2_000_000)
          throw new Error("Website response exceeded the 2 MB limit.");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
    }
    return new TextDecoder().decode(Buffer.concat(chunks));
  }
  return async (raw: string): Promise<string> => {
    const url = allowedUrl(raw);
    if (!robots.has(url.origin)) {
      let body: string;
      try {
        body = await download(url.origin + "/robots.txt");
      } catch (error) {
        if (error instanceof Error && /^HTTP 404 /.test(error.message))
          body = "";
        else
          throw new Error(
            "Cannot check robots rules: " +
              (error instanceof Error ? error.message : "network failure"),
          );
      }
      // A challenge page must not be treated as permissive robots.txt.
      if (/<html|<!doctype/i.test(body))
        throw new Error("Robots rules are unavailable.");
      robots.set(url.origin, robotsParser(url.origin + "/robots.txt", body));
    }
    if (robots.get(url.origin)!.isAllowed(url.toString(), agent) === false)
      throw new Error("Website robots rules disallow this page.");
    return download(url.toString());
  };
}

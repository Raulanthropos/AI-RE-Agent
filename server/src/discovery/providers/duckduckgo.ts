import { load } from "cheerio";
import type { SearchHit, SearchProvider } from "../types.js";

export function parseSearch(html: string): SearchHit[] {
  const $ = load(html);
  if ($('form[action*="anomaly"], #challenge-form, .anomaly-modal').length)
    throw new Error(
      "Search engine requested a human check. Search paused until the next scheduled run.",
    );
  const hits: SearchHit[] = [];
  $(".result").each((_, node) => {
    const result = $(node);
    if (result.hasClass("result--ad") || result.find(".result__badge").length)
      return;
    const anchor = result.find(".result__a").first();
    const href = anchor.attr("href");
    if (!href) return;
    try {
      const link = new URL(href, "https://duckduckgo.com");
      const url = link.searchParams.get("uddg") ?? link.toString();
      hits.push({
        url,
        title: anchor.text().trim(),
        snippet: result.find(".result__snippet").text().trim().slice(0, 900),
      });
    } catch {
      /* A malformed search result is not a listing. */
    }
  });
  if (!hits.length && !$(".no-results, .result--no-result").length)
    throw new Error("Search response was not a recognised results page.");
  return hits;
}

export function duckDuckGo(
  read: (url: string) => Promise<string>,
): SearchProvider {
  return {
    name: "DuckDuckGo public HTML",
    async search(query) {
      return parseSearch(
        await read(
          "https://html.duckduckgo.com/html/?q=" + encodeURIComponent(query),
        ),
      );
    },
  };
}

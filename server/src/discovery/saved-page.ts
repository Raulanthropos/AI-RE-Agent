import { load } from "cheerio";
import type { DatabaseSync } from "node:sqlite";
import { identifyListing } from "./sites/registry.js";
import { extractListing } from "./extract.js";
import { runImport } from "../ingestion/run.js";
import type { ListingObservation } from "./types.js";

/** Import a user-provided snapshot, through the same parser as an accessible worker response. */
export async function importSavedPage(
  db: DatabaseSync,
  html: string,
  capturedAt: string,
) {
  if (Buffer.byteLength(html) > 2_000_000)
    throw new Error("Saved page exceeds the 2 MB limit.");
  if (
    !Number.isFinite(Date.parse(capturedAt)) ||
    Date.parse(capturedAt) > Date.now() + 60000
  )
    throw new Error("Invalid saved-page capture time.");
  const $ = load(html);
  const canonical =
    $('link[rel="canonical"]').attr("href") ??
    $('meta[property="og:url"]').attr("content");
  const target = canonical ? identifyListing(canonical) : null;
  if (!target)
    throw new Error(
      "Saved page must identify a supported listing in its canonical or og:url metadata.",
    );
  const row = extractListing({
    target,
    hit: { url: target.url, title: "", snippet: "" },
    html,
    now: capturedAt,
  });
  if (!row?.discovery)
    throw new Error("No property could be extracted from this saved page.");
  const stored = db
    .prepare(
      "SELECT payload FROM observations WHERE source_id = ? AND external_id = ?",
    )
    .get(target.sourceId, target.externalId);
  const previous = stored
    ? (JSON.parse(stored.payload as string) as ListingObservation)
    : null;
  row.discovery.acquisition = "saved-page";
  row.discovery.lastAttemptAt = previous?.discovery?.lastAttemptAt ?? null;
  row.discovery.pageStatus = previous?.discovery?.pageStatus ?? "not-requested";
  row.discovery.message =
    "Extracted from a user-provided saved page. This is not a successful automatic page fetch. Confirm current availability on the source website.";
  const result = await runImport(db, [
    {
      id: target.sourceId,
      name: target.sourceName,
      fetchListings: async () => [row],
    },
  ]);
  return {
    ...result,
    source: target.sourceName,
    externalId: target.externalId,
    sourceUrl: target.url,
  };
}

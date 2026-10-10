import type { DatabaseSync } from "node:sqlite";
import { runImport } from "../ingestion/run.js";
import { extractListing } from "./extract.js";
import { identifyListing, websites } from "./sites/registry.js";
import { claimRun, finishRun, saveRun } from "./state.js";
import type { DiscoveryIO, ListingObservation, SearchHit } from "./types.js";

const queries = [
  "μονοκατοικία πώληση οικόπεδο",
  "κατοικία πώληση κτήμα στρέμματα",
  "αγροικία πώληση οικόπεδο",
  "house for sale Greece land plot",
];
/** A failed refresh never deletes an observation or replaces richer facts with a snippet. */
export function retainPrevious(
  previous: ListingObservation | undefined,
  next: ListingObservation | null,
  now: string,
  message: string,
  seen: boolean,
  attempted = true,
): ListingObservation | null {
  if (next?.discovery)
    next.discovery.lastAttemptAt = attempted
      ? now
      : (previous?.discovery?.lastAttemptAt ?? null);
  if (!previous) return next;
  if (
    next?.discovery?.basis === "page" ||
    (next && previous.discovery?.basis !== "page")
  )
    return next;
  // Retain the original evidence timestamp; lastAttemptAt is not a verification timestamp.
  return {
    ...previous,
    discovery: {
      ...previous.discovery!,
      lastSeenAt: seen ? now : previous.discovery!.lastSeenAt,
      lastAttemptAt: attempted ? now : previous.discovery!.lastAttemptAt,
      pageStatus: attempted ? "unavailable" : previous.discovery!.pageStatus,
      message: attempted ? message : previous.discovery!.message,
    },
  };
}
export async function discover(
  db: DatabaseSync,
  io: DiscoveryIO,
  force = false,
) {
  const run = claimRun(db, force);
  if (!run) return null;
  const observations: ListingObservation[] = [];
  const previous = new Map<string, ListingObservation>();
  for (const row of db
    .prepare(
      "SELECT payload FROM observations WHERE json_extract(payload, '$.discovery') IS NOT NULL",
    )
    .all()) {
    const item = JSON.parse(row.payload as string) as ListingObservation;
    previous.set(item.sourceId + ":" + item.externalId, item);
  }
  const found = new Map<string, SearchHit>();
  const issue = (message: string) => {
    if (!run.issues.includes(message) && run.issues.length < 20)
      run.issues.push(message);
  };
  try {
    // Rotate broad Greek/English queries over days; built size is never a hard query constraint.
    const query = queries[Math.floor(Date.now() / 86400000) % queries.length]!;
    const offset = (run.id - 1) % websites.length;
    for (const site of [
      ...websites.slice(offset),
      ...websites.slice(0, offset),
    ]) {
      try {
        run.queries++;
        const hits = await io.provider.search(
          "site:" + site.domain + " " + query,
        );
        for (const hit of hits) {
          const target = identifyListing(hit.url);
          if (target && target.sourceId === site.id)
            found.set(target.sourceId + ":" + target.externalId, hit);
        }
        run.found = found.size;
        saveRun(db, run);
      } catch (error) {
        issue(
          io.provider.name +
            ": " +
            (error instanceof Error ? error.message : "Search failed."),
        );
        // No provider switching or retries around blocks/challenges.
        break;
      }
    }
    // Catalogs continue independently when a general search provider is unavailable.
    if (io.catalogs)
      for await (const catalog of io.catalogs()) {
        run.queries++;
        if (catalog.error) issue(catalog.name + ": " + catalog.error);
        for (const hit of catalog.hits) {
          const target = identifyListing(hit.url);
          if (target) found.set(target.sourceId + ":" + target.externalId, hit);
        }
        run.found = found.size;
        saveRun(db, run);
      }
    run.found = found.size;
    // Previously discovered pages are revisited even when today's search omits them.
    const candidates = new Map(found);
    for (const [key, item] of [...previous].sort((a, b) =>
      (a[1].discovery!.lastAttemptAt ?? "").localeCompare(
        b[1].discovery!.lastAttemptAt ?? "",
      ),
    )) {
      if (!candidates.has(key))
        candidates.set(key, { url: item.url, title: item.title, snippet: "" });
    }
    let pageAttempts = 0;
    const perSite = new Map<string, number>();
    const now = new Date().toISOString();
    // Prioritise never-checked and oldest records; skipped pages retain their attempt date.
    const ordered = [...candidates].sort((a, b) => {
      const pa = previous.get(a[0])?.discovery?.lastAttemptAt ?? "";
      const pb = previous.get(b[0])?.discovery?.lastAttemptAt ?? "";
      return pa.localeCompare(pb);
    });
    for (const [key, hit] of ordered.slice(0, 200)) {
      const target = identifyListing(hit.url)!;
      let next = found.has(key) ? extractListing({ target, hit, now }) : null;
      if (next?.discovery && hit.catalog)
        next.discovery.acquisition = io.acquisition ?? "http";
      if (!next && !previous.has(key)) continue;
      let message =
        "Page not requested in this cycle; only indexed search information is available.";
      const attempted =
        pageAttempts < 30 && (perSite.get(target.sourceId) ?? 0) < 24;
      if (attempted) {
        pageAttempts++;
        perSite.set(target.sourceId, (perSite.get(target.sourceId) ?? 0) + 1);
        try {
          const html = await io.page(target.url);
          const enriched = extractListing({ target, hit, now, html });
          if (!enriched)
            throw new Error(
              "Page did not expose an identifiable property for sale or rent.",
            );
          if (enriched.discovery)
            enriched.discovery.acquisition = io.acquisition ?? "http";
          next = enriched;
          run.pagesRead++;
        } catch (error) {
          message =
            error instanceof Error ? error.message : "Page unavailable.";
          issue(target.sourceName + ": " + message);
          if (next?.discovery) {
            next.discovery.pageStatus = "unavailable";
            next.discovery.message += " " + message;
          }
        }
      } else if (next?.discovery) {
        next.discovery.pageStatus = "not-requested";
        next.discovery.message += " " + message;
      }
      const observation = retainPrevious(
        previous.get(key),
        next,
        now,
        message,
        found.has(key),
        attempted,
      );
      if (observation) observations.push(observation);
      saveRun(db, run);
    }
    const adapters = websites.map((site) => ({
      id: site.id,
      name: site.name,
      fetchListings: async () =>
        observations.filter((item) => item.sourceId === site.id),
    }));
    await runImport(db, adapters, { enrich: io.enrich });
    run.imported = observations.length;
    run.status = run.issues.length
      ? run.imported || run.found
        ? "partial"
        : "failed"
      : "complete";
  } catch (error) {
    issue(error instanceof Error ? error.message : "Search worker failed.");
    run.status = "failed";
  } finally {
    run.finishedAt = new Date().toISOString();
    finishRun(db, run);
  }
  return run;
}

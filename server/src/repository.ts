import type { DatabaseSync } from "node:sqlite";
import type {
  Collection,
  Evaluation,
  Listing,
  ListingsResponse,
} from "@ai-re-agent/contracts";
import { evaluate, hasRequiredLand, POLICY } from "./scoring.js";

export type ListingStatus = "eligible" | "needs-checking" | "excluded" | "all";
export function readListings(
  db: DatabaseSync,
  status: ListingStatus = "eligible",
  collection: Collection = "all",
  scope: "browse" | "audit" = "browse",
): ListingsResponse {
  // One query reads a consistent snapshot even if the worker commits concurrently.
  const rows = db
    .prepare(
      "SELECT id, payload, evaluation, scoring_version, scored_at FROM listings WHERE ? = 'all' OR (? = 'live' AND json_extract(payload, '$.discovery') IS NOT NULL) OR (? = 'demo' AND json_extract(payload, '$.discovery') IS NULL)",
    )
    .all(collection, collection, collection);
  const all = rows
    .map((row) => {
      const property = JSON.parse(row.payload as string) as Omit<
        Listing,
        keyof Evaluation | "id" | "pricePerSqm"
      >;
      // Existing databases (or an old worker still running) must obey the current policy.
      const evaluation =
        row.scoring_version === POLICY.version
          ? (JSON.parse(row.evaluation as string) as Evaluation)
          : evaluate(property);
      return {
        ...property,
        ...evaluation,
        id: row.id as string,
        pricePerSqm:
          property.priceEur !== null &&
          property.areaSqm !== null &&
          property.areaSqm > 0
            ? Math.round(property.priceEur / property.areaSqm)
            : null,
      } satisfies Listing;
    })
    .filter((listing) => scope === "audit" || hasRequiredLand(listing));
  // Rejected land stays available internally for future source enrichment, but
  // never enters browsing responses or their counts, even under status=all.
  all.sort(
    (a, b) =>
      (b.score ?? -1) - (a.score ?? -1) ||
      (a.priceEur ?? Infinity) - (b.priceEur ?? Infinity) ||
      a.id.localeCompare(b.id),
  );
  const observations = all.reduce(
    (sum, listing) => sum + listing.sources.length,
    0,
  );
  const eligible = all.filter((listing) => listing.eligible).length;
  const dates = rows.map((row) => row.scored_at as string).sort();
  return {
    listings: all.filter(
      (listing) => status === "all" || listing.status === status,
    ),
    summary: {
      observations,
      properties: all.length,
      duplicates: observations - all.length,
      eligible,
      needsChecking: all.filter(
        (listing) => listing.status === "needs-checking",
      ).length,
      excluded: all.filter((listing) => listing.status === "excluded").length,
      lastImportedAt: dates.at(-1) ?? null,
    },
    policy: POLICY,
  };
}

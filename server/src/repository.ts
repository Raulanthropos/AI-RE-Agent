import type { DatabaseSync } from "node:sqlite";
import type {
  Evaluation,
  Listing,
  ListingsResponse,
} from "@ai-re-agent/contracts";
import { POLICY } from "./scoring.js";

export type ListingStatus = "eligible" | "needs-checking" | "excluded" | "all";
export function readListings(
  db: DatabaseSync,
  status: ListingStatus = "eligible",
): ListingsResponse {
  // One query reads a consistent snapshot even if the worker commits concurrently.
  const rows = db
    .prepare("SELECT id, payload, evaluation, scored_at FROM listings")
    .all();
  const all = rows.map((row) => {
    const property = JSON.parse(row.payload as string) as Omit<
      Listing,
      keyof Evaluation | "id" | "pricePerSqm"
    >;
    const evaluation = JSON.parse(row.evaluation as string) as Evaluation;
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
  });
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

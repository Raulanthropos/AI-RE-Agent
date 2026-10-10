import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ListingsResponse } from "@ai-re-agent/contracts";
import { openDatabase } from "../src/db/database.js";
import { adapters } from "../src/ingestion/adapters/index.js";
import {
  normalizeObservation,
  propertyKey,
} from "../src/ingestion/normalize.js";
import { runImport } from "../src/ingestion/run.js";
import type {
  ListingAdapter,
  ListingObservation,
} from "../src/ingestion/types.js";
import { readListings } from "../src/repository.js";
import { evaluate } from "../src/scoring.js";
import { createApp } from "../src/app.js";

async function fixture() {
  return (await adapters[0]!.fetchListings())[0]!;
}
const adapterFor = (...rows: ListingObservation[]): ListingAdapter => ({
  id: rows[0]!.sourceId,
  name: "Test adapter",
  async fetchListings() {
    return rows;
  },
});

test("sample import deduplicates 15 records into 12 properties and is idempotent", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  const first = await runImport(db, adapters);
  const before = readListings(db, "all", "all", "audit");
  const second = await runImport(db, adapters);
  assert.equal(first.processed, 15);
  for (const result of [first, second]) {
    assert.equal(result.observations, 15);
    assert.equal(result.properties, 12);
    assert.equal(result.duplicates, 3);
    assert.equal(result.eligible, 7);
    assert.equal(result.needsChecking, 1);
    assert.equal(result.excluded, 4);
  }
  assert.deepEqual(
    readListings(db, "all", "all", "audit").listings,
    before.listings,
  );
  const kypseli = before.listings.find(
    (listing) => listing.neighborhood === "Kardamyli",
  )!;
  assert.equal(kypseli.sources.length, 2);
  assert.equal(
    kypseli.priceEur,
    245_000,
    "newest source supplies canonical details",
  );
  assert.equal(kypseli.score, 97.62);
  assert.equal(kypseli.scoreCoverage, 100);
  assert.ok(kypseli.sources.every((source) => !source.url.includes("utm_")));
  assert.equal(before.listings[0]!.score, 97.62);
  for (const listing of before.listings) {
    if (listing.status !== "excluded") {
      assert.equal(listing.reasons.length, 6);
      const assessed = listing.reasons.reduce(
        (sum, reason) => sum + reason.assessedPoints,
        0,
      );
      const earned = listing.reasons.reduce(
        (sum, reason) => sum + reason.points,
        0,
      );
      assert.equal(listing.scoreCoverage, assessed);
      assert.equal(
        listing.score,
        assessed ? Math.round((earned / assessed) * 10000) / 100 : null,
      );
      assert.ok(
        listing.reasons.every(
          (reason) =>
            reason.points >= 0 &&
            reason.points <= reason.maxPoints &&
            reason.points <= reason.assessedPoints &&
            reason.assessedPoints <= reason.maxPoints &&
            reason.reason,
        ),
      );
    } else {
      assert.equal(listing.score, null);
      assert.equal(listing.scoreCoverage, 0);
      assert.equal(listing.reasons.length, 0);
      assert.ok(listing.filterReasons.length > 0);
    }
  }
});

test("a 392 m² building with unknown land is not a match, and building size is not a hard maximum", async () => {
  const base = normalizeObservation(await fixture());
  const rejected = evaluate({
    ...base,
    areaSqm: 392,
    landSqm: null,
    priceEur: 39000,
  });
  assert.equal(rejected.eligible, false);
  assert.equal(rejected.status, "excluded");
  assert.equal(rejected.score, null);
  assert.ok(
    rejected.filterReasons.some((x) => x.includes("Plot size is not stated")),
  );
  assert.equal(
    rejected.missingDetails.some((x) => x.includes("plot")),
    false,
  );
  assert.equal(
    evaluate({ ...base, areaSqm: 392, landSqm: 799.99 }).status,
    "excluded",
  );
  const qualified = evaluate({ ...base, areaSqm: 392, landSqm: 800 });
  assert.equal(qualified.status, "eligible");
  assert.equal(
    qualified.reasons.find((r) => r.criterion === "space")?.points,
    2.55,
  );
});

test("hard filters accept Greece-wide land and do not turn optimal built area into a minimum", async () => {
  const base = normalizeObservation(await fixture());
  assert.equal(
    evaluate({
      ...base,
      priceEur: 300_000,
      landSqm: 800,
      areaSqm: 25,
      bedrooms: 0,
    }).eligible,
    true,
  );
  assert.equal(
    evaluate({
      ...base,
      city: "Θεσσαλονίκη",
      type: "land",
      areaSqm: 0,
      bedrooms: 0,
      permits: "unknown",
    }).eligible,
    true,
  );
  assert.equal(
    evaluate({ ...base, areaSqm: null, bedrooms: null }).eligible,
    true,
  );
  for (const override of [
    { priceEur: 300_001 },
    { landSqm: 799.99 },
    { landSqm: null },
    { landSqm: NaN },
    { landSqm: 0 },
    { road: "unpaved" as const },
    { countryCode: "IT" },
    { active: false },
    { transaction: "rent" as const },
  ])
    assert.equal(
      evaluate({ ...base, ...override }).status,
      "excluded",
      JSON.stringify(override),
    );
  for (const override of [
    { priceEur: null },
    { priceEur: 0 },
    { priceEur: NaN },
    { road: "unknown" as const },
  ]) {
    const evaluation = evaluate({ ...base, ...override });
    assert.equal(evaluation.status, "needs-checking", JSON.stringify(override));
    assert.equal(evaluation.eligible, false);
    assert.ok(evaluation.missingDetails.length);
    assert.ok(evaluation.score !== null);
  }
  const rejected = evaluate({
    ...base,
    active: false,
    priceEur: 400_000,
    landSqm: 20,
    road: "unpaved",
  });
  assert.equal(rejected.filterReasons.length, 4);
  assert.equal(rejected.score, null);
});

test("fixed scoring reaches 0 and 100 on assessed criteria, prefers 100 m², and exposes uncertainty", async () => {
  const base = normalizeObservation(await fixture());
  const allExtras = {
    secondUnit: true,
    seaView: true,
    barn: true,
    trees: true,
    pool: true,
    well: true,
    solar: true,
  };
  const noExtras = {
    secondUnit: null,
    seaView: null,
    barn: null,
    trees: null,
    pool: null,
    well: null,
    solar: null,
  };
  assert.equal(
    evaluate({
      ...base,
      priceEur: 100_000,
      areaSqm: 100,
      townMinutes: 0,
      features: allExtras,
    }).score,
    100,
  );
  assert.equal(
    evaluate({
      ...base,
      priceEur: 1,
      areaSqm: 100,
      townMinutes: 0,
      features: allExtras,
    }).score,
    100,
  );
  const minimum = evaluate({
    ...base,
    priceEur: null,
    areaSqm: 0,
    townMinutes: 30,
    permits: "issues-reported",
    electricity: false,
    mainsWater: false,
    internet: false,
    features: Object.fromEntries(
      Object.keys(noExtras).map((key) => [key, false]),
    ) as typeof allExtras,
  });
  assert.equal(minimum.score, 0);
  assert.equal(minimum.scoreCoverage, 90);
  const reason = (areaSqm: number | null) =>
    evaluate({ ...base, areaSqm }).reasons.find(
      (r) => r.criterion === "space",
    )!;
  assert.equal(reason(100).points, 10);
  assert.equal(reason(80).points, reason(125).points);
  assert.equal(reason(160).points, 6.25);
  assert.equal(reason(10000).points, 0.1);
  assert.equal(reason(null).points, 0);
  assert.equal(reason(null).assessedPoints, 0);
  assert.match(reason(null).reason, /preference, not an exclusion/);
  assert.match(
    minimum.reasons.find((r) => r.criterion === "infrastructure")!.reason,
    /not available/,
  );
  assert.equal(
    evaluate({ ...base, permits: "issues-reported" }).reasons.find(
      (r) => r.criterion === "permits",
    )!.points,
    0,
  );
  assert.ok(evaluate(base).reasons.every((r) => r.criterion !== "fire"));
});

test("sparse Heraklion facts produce a provisional fit with explicit evidence coverage, not a score floor", async () => {
  const base = normalizeObservation(await fixture());
  const incomplete = {
    ...base,
    priceEur: 200000,
    landSqm: 1000,
    areaSqm: 160,
    road: "unknown" as const,
    permits: "unknown" as const,
    electricity: null,
    mainsWater: null,
    internet: null,
    townMinutes: null,
    features: Object.fromEntries(
      Object.keys(base.features).map((key) => [key, null]),
    ) as typeof base.features,
  };
  const result = evaluate(incomplete);
  assert.equal(result.status, "needs-checking");
  assert.equal(result.score, 81.25);
  assert.equal(result.scoreCoverage, 20);
  assert.ok(
    result.reasons
      .filter((r) => !["space", "budget"].includes(r.criterion))
      .every((r) => r.points === 0 && r.assessedPoints === 0),
  );
  const withMeter = evaluate({ ...incomplete, electricity: true });
  assert.equal(withMeter.score, 87.5);
  assert.equal(withMeter.scoreCoverage, 30);
  assert.equal(
    withMeter.status,
    "needs-checking",
    "Electricity does not establish paved access.",
  );
  const knownAbsent = evaluate({ ...incomplete, electricity: false });
  assert.equal(knownAbsent.score, 54.17);
  assert.equal(
    knownAbsent.scoreCoverage,
    30,
    "Known negatives count as assessed and earn zero.",
  );
  const noFacts = evaluate({ ...incomplete, priceEur: null, areaSqm: null });
  assert.equal(noFacts.score, null);
  assert.equal(noFacts.scoreCoverage, 0);
  assert.equal(
    evaluate({ ...incomplete, priceEur: 300000 }).score,
    result.score,
  );
  assert.equal(evaluate({ ...incomplete, priceEur: 300001 }).score, null);
  assert.equal(evaluate({ ...incomplete, landSqm: null }).status, "excluded");
  assert.equal(evaluate({ ...incomplete, landSqm: 799 }).status, "excluded");
});

test("Greek normalization matches conservative identities and rejects unsafe or invalid data", async () => {
  const row = normalizeObservation(await fixture());
  const copy = normalizeObservation({
    ...row,
    address: "  ΔΕΙΓΜΑ   ΜΕΣΣΗΝΙΑΣ 1 ",
    sourceId: "another",
    externalId: "another-id",
  });
  assert.equal(propertyKey(row), propertyKey(copy));
  assert.notEqual(
    propertyKey(row),
    propertyKey({ ...copy, unit: "other plot" }),
  );
  assert.notEqual(propertyKey(row), propertyKey({ ...copy, landSqm: 1001 }));
  assert.notEqual(
    propertyKey({ ...row, unit: null }),
    propertyKey({ ...copy, unit: null }),
  );
  assert.notEqual(
    propertyKey({ ...row, address: null }),
    propertyKey({ ...copy, address: null }),
  );
  assert.equal(normalizeObservation({ ...row, latitude: 95 }).longitude, null);
  assert.equal(
    normalizeObservation({ ...row, latitude: 95 }).locationAccuracy,
    "unknown",
  );
  assert.equal(normalizeObservation({ ...row, landSqm: -1 }).landSqm, null);
  assert.throws(
    () => normalizeObservation({ ...row, url: "javascript:alert(1)" }),
    /Invalid listing URL/,
  );
  assert.throws(
    () =>
      normalizeObservation({
        ...row,
        condition: "unmapped" as ListingObservation["condition"],
      }),
    /Invalid property/,
  );
});

test("new demo fixtures replace the old sample records without leaving stale apartments", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  const insert = db.prepare(
    "INSERT INTO observations (source_id, external_id, property_key, payload, imported_at) VALUES (?, ?, ?, ?, ?)",
  );
  for (const adapter of adapters) {
    for (const row of await adapter.fetchListings()) {
      const legacy = {
        ...row,
        title: "Legacy Athens apartment",
        city: "Αθήνα",
        observedAt: "2026-10-01T09:00:00.000Z",
      };
      insert.run(
        row.sourceId,
        row.externalId,
        row.sourceId + row.externalId,
        JSON.stringify(legacy),
        legacy.observedAt,
      );
    }
  }
  const stats = await runImport(db, adapters);
  assert.equal(stats.observations, 15);
  assert.equal(stats.properties, 12);
  assert.ok(
    readListings(db, "all", "all", "audit").listings.every(
      (p) => p.title !== "Legacy Athens apartment",
    ),
  );
});

test("a changed listing replaces its source record, older observations never overwrite newer data", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  const original = await fixture();
  await runImport(db, [adapterFor(original)]);
  const changed = {
    ...original,
    priceEur: 125_000,
    observedAt: "2026-10-10T09:00:00Z",
  };
  await runImport(db, [adapterFor(changed)]);
  await runImport(db, [adapterFor(original)]);
  assert.equal(readListings(db).listings[0]!.priceEur, 125_000);
  const stats = await runImport(db, [
    adapterFor({
      ...changed,
      address: "A corrected address 15",
      observedAt: "2026-10-11T09:00:00Z",
    }),
  ]);
  assert.equal(stats.observations, 1);
  assert.equal(stats.properties, 1);
  assert.equal(readListings(db).listings[0]!.address, "A corrected address 15");
});

test("adapter and validation failures leave the last successful import intact", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  await runImport(db, adapters);
  const before = readListings(db, "all", "all", "audit");
  const failing: ListingAdapter = {
    id: "failed",
    name: "Failed",
    async fetchListings() {
      throw new Error("Source unavailable");
    },
  };
  await assert.rejects(
    runImport(db, [adapters[0]!, failing]),
    /Source unavailable/,
  );
  assert.deepEqual(readListings(db, "all", "all", "audit"), before);
  const invalid = { ...(await fixture()), url: "not a URL" };
  await assert.rejects(runImport(db, [adapterFor(invalid)]));
  assert.deepEqual(readListings(db, "all", "all", "audit"), before);
});

test("SQLite failure rolls back observation changes and materialized scores together", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  const original = await fixture();
  await runImport(db, [adapterFor(original)]);
  const before = readListings(db, "all", "all", "audit");
  db.exec(
    "CREATE TRIGGER reject_listing BEFORE INSERT ON listings BEGIN SELECT RAISE(ABORT, 'test failure'); END;",
  );
  await assert.rejects(
    runImport(db, [adapterFor({ ...original, priceEur: 100_000 })]),
    /test failure/,
  );
  assert.deepEqual(readListings(db, "all", "all", "audit"), before);
  const stored = db.prepare("SELECT payload FROM observations").get()!;
  assert.equal(
    (JSON.parse(stored.payload as string) as ListingObservation).priceEur,
    original.priceEur,
  );
});

test("disk database survives reopening and REST serves the worker results with validated filters", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "ai-re-agent-test-"));

  const path = join(directory, "listings.sqlite");
  const writer = openDatabase(path);
  await runImport(writer, adapters);
  writer.close();
  const reader = openDatabase(path);
  const server = createApp(reader).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    reader.close();
    assert.equal(join(directory, ".."), tmpdir());
    rmSync(directory, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  assert.deepEqual(await (await fetch(`${baseUrl}/api/health`)).json(), {
    status: "ok",
    database: "sqlite",
  });
  for (const [status, expected] of [
    ["eligible", 7],
    ["needs-checking", 1],
    ["excluded", 2],
    ["all", 10],
  ] as const) {
    const response = await fetch(
      `${baseUrl}/api/listings?status=${status}&collection=demo`,
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const body = (await response.json()) as ListingsResponse;
    assert.equal(body.listings.length, expected);
    assert.equal(body.summary.properties, 10);
    if (status === "excluded")
      assert.ok(
        body.listings.every(
          (listing) => listing.score === null && listing.filterReasons.length,
        ),
      );
  }
  assert.equal(
    (
      (await (
        await fetch(`${baseUrl}/api/listings?collection=demo`)
      ).json()) as ListingsResponse
    ).listings.length,
    7,
  );
  assert.equal(
    (await fetch(`${baseUrl}/api/listings?status=unknown`)).status,
    400,
  );
  assert.equal(
    (await fetch(`${baseUrl}/api/listings?status=all&status=eligible`)).status,
    400,
  );
  assert.equal((await fetch(`${baseUrl}/api/no-such-route`)).status, 404);
});

test("the 800 m² gate hides missing and undersized plots from every REST view and re-evaluates old scores", async (t) => {
  const db = openDatabase(":memory:");
  const base = normalizeObservation(await fixture());
  const plots = [null, 0, 799.99, 800, 950] as const;
  await runImport(db, [
    adapterFor(
      ...plots.map((landSqm, i) => ({
        ...base,
        externalId: "land-boundary-" + i,
        address: null,
        latitude: null,
        longitude: null,
        landSqm,
        areaSqm: 392,
        priceEur: i === 4 ? 30000 : 100,
      })),
    ),
  ]);
  // A database written by the old worker must not retain its old policy decisions.
  db.prepare("UPDATE listings SET evaluation = ?, scoring_version = ?").run(
    JSON.stringify({
      eligible: true,
      status: "eligible",
      score: 100,
      filterReasons: [],
      missingDetails: [],
      reasons: [],
    }),
    "greece-land-v2",
  );
  const audit = readListings(db, "all", "demo", "audit");
  assert.equal(audit.summary.properties, 5);
  assert.equal(audit.summary.excluded, 3);
  assert.ok(
    audit.listings
      .filter((row) => row.landSqm === null)
      .every((row) => row.score === null),
  );
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });
  const { port } = server.address() as { port: number };
  for (const status of ["all", "eligible", "needs-checking", "excluded"]) {
    const body = (await (
      await fetch(
        "http://127.0.0.1:" +
          port +
          "/api/listings?collection=demo&status=" +
          status,
      )
    ).json()) as ListingsResponse;
    assert.equal(body.policy.version, "greece-land-v4");
    assert.equal(body.summary.properties, 2);
    assert.equal(body.summary.eligible, 2);
    assert.equal(body.summary.needsChecking, 0);
    assert.equal(body.summary.excluded, 0);
    assert.ok(
      body.listings.every((row) => row.landSqm !== null && row.landSqm >= 800),
    );
    assert.equal(
      body.listings.length,
      ["all", "eligible"].includes(status) ? 2 : 0,
    );
    assert.ok(
      body.listings.every((row) => row.reasons.length === 6),
      "Old scores are recomputed.",
    );
  }
  assert.equal(
    db.prepare("SELECT COUNT(*) AS n FROM observations").get()?.n,
    5,
    "Rejected source observations remain available for later enrichment.",
  );
});

test("an initialized but unseeded database returns a useful empty result", (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  assert.deepEqual(readListings(db).summary, {
    observations: 0,
    properties: 0,
    duplicates: 0,
    eligible: 0,
    needsChecking: 0,
    excluded: 0,
    lastImportedAt: null,
  });
});

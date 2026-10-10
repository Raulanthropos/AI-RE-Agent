import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import type { Listing, WildfireAssessment } from "@ai-re-agent/contracts";
import { createApp } from "../src/app.js";
import { openDatabase } from "../src/db/database.js";
import { adapters } from "../src/ingestion/adapters/index.js";
import { normalizeObservation } from "../src/ingestion/normalize.js";
import { runImport } from "../src/ingestion/run.js";
import type { ListingObservation } from "../src/ingestion/types.js";
import { readListings } from "../src/repository.js";
import { evaluate } from "../src/scoring.js";
import {
  featureInfoUrl,
  parsePrevalence,
  summarizePrevalence,
  wildfireService,
} from "../src/wildfire/service.js";

type Risk = "high" | "intermediate" | "low";
const start = Date.parse("2026-10-10T12:00:00.000Z");
const hour = 3600000;
const day = 24 * hour;
const responseFor = (risk: Risk, value: number | string) =>
  `<p>${risk[0]!.toUpperCase() + risk.slice(1)} risk (aggr. wildfire risk) (Prevalence in the cell area): ${value}</p>`;
const valuesFor = (
  url: string,
  values = { high: 0.7, intermediate: 0.2, low: 0.1 },
) => {
  const layer = new URL(url).searchParams.get("QUERY_LAYERS")!;
  const risk = layer.split("-")[0] as Risk;
  assert.ok(risk in values, "Only the supported model classes are queried.");
  return responseFor(risk, values[risk]);
};

async function observation(): Promise<ListingObservation> {
  const base = normalizeObservation((await adapters[0]!.fetchListings())[0]!);
  return {
    ...base,
    sourceId: "wildfire-test",
    sourceName: "Synthetic public listing",
    externalId: "visible",
    url: "https://example.org/property/visible",
    title: "Synthetic wildfire integration fixture",
    address: null,
    latitude: null,
    longitude: null,
    locationAccuracy: "unknown",
    landSqm: 1000,
    discovery: {
      basis: "page",
      observedAt: new Date(start).toISOString(),
      lastSeenAt: new Date(start).toISOString(),
      lastAttemptAt: new Date(start).toISOString(),
      pageStatus: "read",
      message: "Synthetic fixture; no external listing is accessed.",
      evidence: [],
    },
    // Deliberately synthetic coordinates, never an assessment of a real parcel.
    areaLocation: {
      latitude: 37.5,
      longitude: 23.5,
      label: "Synthetic settlement centre",
      geonameId: "synthetic",
      sourceUrl: "https://example.org/settlement",
      kind: "settlement",
      explanation: "Test-only settlement lookup.",
    },
  };
}

async function listing(): Promise<Listing> {
  const row = await observation();
  return {
    ...row,
    ...evaluate(row),
    id: "synthetic",
    sources: [row],
    pricePerSqm: null,
  };
}

test("wildfire HTML parsing distinguishes empty NoData from valid zero and rejects bad values", () => {
  assert.equal(parsePrevalence("", "high"), null);
  assert.equal(parsePrevalence("<html><body>  </body></html>", "high"), null);
  assert.equal(parsePrevalence(responseFor("high", 0), "high"), 0);
  assert.equal(parsePrevalence(responseFor("low", 1), "low"), 1);
  assert.equal(
    parsePrevalence(responseFor("intermediate", "5e-4"), "intermediate"),
    0.0005,
  );
  for (const value of [
    "NaN",
    "Infinity",
    "-0.1",
    "1.01",
    "2",
    "50%",
    "0.2 garbage",
    "0.1 0.9",
  ]) {
    assert.throws(
      () => parsePrevalence(responseFor("high", value), "high"),
      undefined,
      value,
    );
  }
  assert.throws(
    () => parsePrevalence(responseFor("low", 0.1), "high"),
    /Unexpected/,
  );
  assert.throws(
    () =>
      parsePrevalence(
        "<ServiceException>Invalid layer</ServiceException>",
        "high",
      ),
    /Unexpected/,
  );
  assert.throws(() => parsePrevalence("x".repeat(20001), "high"), /Oversized/);
});

test("wildfire cell proportions become class percentages with mixed areas preserved", () => {
  assert.deepEqual(
    summarizePrevalence({ high: 0.7, intermediate: 0.2, low: 0.1 }),
    {
      riskClass: "high",
      classShares: { high: 70, intermediate: 20, low: 10 },
    },
  );
  assert.deepEqual(summarizePrevalence({ high: 0, intermediate: 0, low: 1 }), {
    riskClass: "low",
    classShares: { high: 0, intermediate: 0, low: 100 },
  });
  assert.equal(
    summarizePrevalence({ high: 0.5, intermediate: 0.3, low: 0.2 }).riskClass,
    "mixed",
  );
  assert.equal(
    summarizePrevalence({ high: 0.2, intermediate: 0.6, low: 0.2 }).riskClass,
    "intermediate",
  );
  for (const values of [
    { high: 0, intermediate: 0, low: 0 },
    { high: 0.8, intermediate: 0.5, low: 0.2 },
    { high: -0.1, intermediate: 0.5, low: 0.6 },
    { high: Number.NaN, intermediate: 0.5, low: 0.5 },
  ])
    assert.throws(() => summarizePrevalence(values), /Incomplete/);
});

test("WMS 1.1.1 queries use longitude then latitude and the centre pixel of a fixed source layer", () => {
  const url = new URL(featureInfoUrl(37.5, 23.5, "high"));
  assert.equal(url.origin, "https://maps.effis.emergency.copernicus.eu");
  assert.equal(url.pathname, "/effis");
  const q = url.searchParams;
  assert.equal(q.get("VERSION"), "1.1.1");
  assert.equal(q.get("SRS"), "EPSG:4326");
  assert.equal(q.get("BBOX"), "23.490000,37.490000,23.510000,37.510000");
  assert.equal(q.get("REQUEST"), "GetFeatureInfo");
  assert.equal(q.get("LAYERS"), "high-risk-aggr-wildfire-risk");
  assert.equal(q.get("QUERY_LAYERS"), q.get("LAYERS"));
  assert.equal(q.get("WIDTH"), "101");
  assert.equal(q.get("HEIGHT"), "101");
  assert.equal(q.get("X"), "50");
  assert.equal(q.get("Y"), "50");
  assert.equal(q.get("INFO_FORMAT"), "text/html");
  assert.throws(() => featureInfoUrl(Number.NaN, 23, "high"), /coordinates/);
  assert.throws(() => featureInfoUrl(91, 23, "high"), /coordinates/);
  assert.throws(() => featureInfoUrl(37, 181, "high"), /coordinates/);
});

test("wildfire service makes no request for demo properties or missing locations", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  let calls = 0;
  const assess = wildfireService(db, {
    read: async () => {
      calls++;
      throw new Error("Unexpected request");
    },
    now: () => start,
  });
  const row = await listing();
  assert.equal(
    (await assess({ ...row, discovery: undefined })).status,
    "not-applicable",
  );
  const missing = await assess({ ...row, areaLocation: undefined });
  assert.equal(missing.status, "no-location");
  assert.equal(missing.riskClass, null);
  assert.equal(missing.classShares, null);
  assert.equal(missing.location, null);
  assert.equal(calls, 0);
});

test("wildfire cache is shared in SQLite, expires after 30 days and identifies settlement precision", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  let clock = start;
  let calls = 0;
  const options = {
    now: () => clock,
    read: async (url: string) => {
      calls++;
      return valuesFor(url);
    },
  };
  const assess = wildfireService(db, options);
  const row = await listing();
  const first = await assess(row);
  assert.equal(first.status, "available");
  assert.equal(first.stale, false);
  assert.equal(first.checkedAt, new Date(start).toISOString());
  assert.equal(first.modelYear, 2022);
  assert.equal(first.resolutionKm, 12.5);
  assert.equal(first.location?.accuracy, "settlement");
  assert.equal(first.location?.label, row.areaLocation?.label);
  assert.deepEqual(first.classShares, { high: 70, intermediate: 20, low: 10 });
  assert.match(first.message, /not the probability/);
  assert.match(first.message, /exact position is unknown/);
  assert.match(
    first.attribution,
    /European Commission.*Copernicus EFFIS.*2022.*CC BY 4\.0/,
  );
  assert.ok(first.sourceUrl.startsWith("https://effis.jrc.ec.europa.eu/"));
  assert.ok(first.methodologyUrl.startsWith("https://"));
  assert.ok(first.licenseUrl.startsWith("https://"));
  assert.ok(
    first.dailyForecastUrl.startsWith("https://civilprotection.gov.gr/"),
  );
  assert.equal(calls, 3);
  clock += 30 * day - 1;
  const reopenedService = wildfireService(db, options);
  assert.deepEqual(await reopenedService(row), first);
  assert.equal(calls, 3);
  clock++;
  const refreshed = await reopenedService(row);
  assert.equal(calls, 6);
  assert.equal(refreshed.checkedAt, new Date(clock).toISOString());
  assert.equal(
    refreshed.modelYear,
    2022,
    "Fetching again cannot update the model year.",
  );
});

test("wildfire NoData and provider failures stay unavailable and retry no earlier than one hour", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  let clock = start;
  let calls = 0;
  let available = false;
  const assess = wildfireService(db, {
    now: () => clock,
    read: async (url) => {
      calls++;
      return available ? valuesFor(url) : "";
    },
  });
  const row = await listing();
  const missing = await assess(row);
  assert.equal(missing.status, "unavailable");
  assert.equal(missing.riskClass, null);
  assert.equal(missing.classShares, null);
  assert.match(missing.message, /does not indicate low risk/);
  assert.equal(calls, 3);
  available = true;
  clock += hour - 1;
  assert.equal((await assess(row)).status, "unavailable");
  assert.equal(calls, 3);
  clock++;
  assert.equal((await assess(row)).status, "available");
  assert.equal(calls, 6);
  const another = {
    ...row,
    areaLocation: { ...row.areaLocation!, longitude: 23.6 },
  };
  const failing = wildfireService(db, {
    now: () => clock,
    read: async () => {
      throw new Error("Provider unavailable");
    },
  });
  assert.equal((await failing(another)).status, "unavailable");
});

test("a failed wildfire refresh retains the old estimate and timestamp with an explicit stale state", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  let clock = start;
  let calls = 0;
  let fail = false;
  const assess = wildfireService(db, {
    now: () => clock,
    read: async (url) => {
      calls++;
      if (fail) throw new Error("Provider unavailable");
      return valuesFor(url);
    },
  });
  const row = await listing();
  const first = await assess(row);
  fail = true;
  clock += 31 * day;
  const stale = await assess(row);
  assert.equal(stale.status, "available");
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.classShares, first.classShares);
  assert.equal(stale.checkedAt, first.checkedAt);
  assert.match(stale.message, /latest refresh failed/);
  assert.equal(calls, 6);
  clock += hour - 1;
  assert.equal((await assess(row)).stale, true);
  assert.equal(calls, 6);
  clock++;
  fail = false;
  assert.equal((await assess(row)).stale, false);
  assert.equal(calls, 9);
});

test("concurrent wildfire detail requests share one set of layer lookups and source coordinates take priority", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const requests: string[] = [];
  const assess = wildfireService(db, {
    now: () => start,
    read: async (url) => {
      requests.push(url);
      await gate;
      return valuesFor(url);
    },
  });
  const row = {
    ...(await listing()),
    latitude: 38,
    longitude: 24,
    locationAccuracy: "exact" as const,
  };
  const first = assess(row);
  const second = assess(row);
  assert.equal(requests.length, 3);
  release();
  const results = await Promise.all([first, second]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0]!.location?.accuracy, "exact");
  assert.equal(results[0]!.location?.latitude, 38);
  assert.equal(
    new URL(requests[0]!).searchParams.get("BBOX"),
    "23.990000,37.990000,24.010000,38.010000",
  );
});

test("wildfire REST lookup enforces stored listing IDs and the hard land visibility gate", async (t) => {
  const db = openDatabase(":memory:");
  const visible = await observation();
  const hidden = { ...visible, externalId: "no-land", landSqm: null };
  await runImport(db, [
    {
      id: visible.sourceId,
      name: visible.sourceName,
      fetchListings: async () => [visible, hidden],
    },
  ]);
  const audit = readListings(db, "all", "live", "audit").listings;
  const visibleId = audit.find((p) => p.landSqm === 1000)!.id;
  const hiddenId = audit.find((p) => p.landSqm === null)!.id;
  let calls = 0;
  const server = createApp(db, {
    wildfire: {
      now: () => start,
      read: async (url) => {
        calls++;
        return valuesFor(url);
      },
    },
  }).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });
  const { port } = server.address() as { port: number };
  const api = `http://127.0.0.1:${port}/api/listings/`;
  for (const id of ["missing", hiddenId]) {
    const response = await fetch(api + id + "/wildfire");
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), {
      error: "Listing not available.",
    });
  }
  assert.equal(calls, 0);
  const response = await fetch(
    api +
      visibleId +
      "/wildfire?latitude=0&longitude=0&url=https://example.org",
  );
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = (await response.json()) as WildfireAssessment;
  assert.equal(body.status, "available");
  assert.equal(body.location?.accuracy, "settlement");
  assert.equal(
    body.location?.latitude,
    37.5,
    "Coordinates come from the stored listing, never query parameters.",
  );
  assert.equal(body.modelYear, 2022);
  assert.equal(body.resolutionKm, 12.5);
  assert.match(body.attribution, /CC BY 4\.0/);
  assert.equal(calls, 3);
});

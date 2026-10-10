import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import { openDatabase } from "../src/db/database.js";
import { extractListing, parseNumber } from "../src/discovery/extract.js";
import { allowedUrl } from "../src/discovery/network.js";
import { parseSearch } from "../src/discovery/providers/duckduckgo.js";
import { discover, retainPrevious } from "../src/discovery/run.js";
import { identifyListing } from "../src/discovery/sites/registry.js";
import {
  claimRun,
  finishRun,
  heartbeat,
  intervalMs,
  searchStatus,
} from "../src/discovery/state.js";
import { readListings } from "../src/repository.js";
import { runImport } from "../src/ingestion/run.js";
import { adapters } from "../src/ingestion/adapters/index.js";
import { evaluate } from "../src/scoring.js";
import { createApp } from "../src/app.js";

const now = "2026-10-10T09:00:00.000Z";
const url = "https://www.plot.gr/12345678-monokatoikia";
const hit = {
  url,
  title: "Μονοκατοικία 100 τ.μ. για πώληση, Αργολίδα, Ναύπλιο",
  snippet: "Σε οικόπεδο 1.200 τ.μ. Τιμή 250.000 €. Πρόσβαση: άσφαλτος.",
};
const target = identifyListing(url)!;
const extract = (snippet: string) =>
  extractListing({ target, now, hit: { ...hit, snippet } })!;
const schema = (overrides: Record<string, unknown> = {}) =>
  '<script type="application/ld+json">' +
  JSON.stringify({
    "@type": "House",
    name: "House 100 m² for sale",
    description: "Plot 1200 m²; paved access; mature trees; working well.",
    offers: { price: 200000, priceCurrency: "EUR" },
    floorSize: { value: 100, unitCode: "MTK" },
    address: { addressLocality: "Nafplio", addressRegion: "Argolida" },
    geo: { latitude: 37.57, longitude: 22.8 },
    ...overrides,
  }) +
  "</script>";

test("Greek/English numeric formats and explicit plot vs built measurements", () => {
  for (const [text, value] of [
    ["1.200", 1200],
    ["250.000", 250000],
    ["100.00", 100],
    ["1,200", 1200],
    ["100,5", 100.5],
    ["1.234,50", 1234.5],
    ["1,234.50", 1234.5],
  ] as const)
    assert.equal(parseNumber(text), value);
  const row = extract(hit.snippet);
  assert.equal(row.priceEur, 250000);
  assert.equal(row.areaSqm, 100);
  assert.equal(row.landSqm, 1200);
  assert.equal(row.road, "paved");
  assert.equal(
    evaluate(row).status,
    "needs-checking",
    "Indexed availability is not verified.",
  );
  assert.equal(extract("Οικόπεδο 2,5 στρέμματα.").landSqm, 2500);
  assert.equal(extract("Land 1,300 m².").landSqm, 1300);
  assert.equal(extract("Plot unknown; 1.200 €/m².").priceEur, null);
  assert.equal(extract("Price €1,200/m².").priceEur, null);
  assert.equal(extract("€240000. Olive trees.").priceEur, 240000);
  assert.equal(extract("Plot with house 100 m².").landSqm, null);
  assert.equal(extract("Οικόπεδο με κατοικία 100 τ.μ.").landSqm, null);
  assert.equal(extract("10 minutes by car to town.").townMinutes, 10);
  assert.equal(extract("2 km from town.").townMinutes, null);
  assert.equal(extract("1000 m² garden wanted.").landSqm, null);
});

test("unknown features, plans and negation cannot create scoring facts", () => {
  const row = extract(
    "Ηλιακός θερμοσίφωνας. Χωρίς πισίνα. Δυνατότητα κατασκευής στάβλου. No sea view. A well could be installed. Άρτιο και οικοδομήσιμο.",
  );
  assert.equal(row.features.solar, null);
  assert.equal(row.features.pool, null);
  assert.equal(row.features.barn, null);
  assert.equal(row.features.well, null);
  assert.equal(row.features.seaView, null);
  assert.equal(row.permits, "unknown");
  assert.equal(row.electricity, null);
  assert.equal(row.road, "unknown");
  assert.equal(row.townMinutes, null);
  assert.equal(row.latitude, null);
  const positive = extract(
    "Διαθέτει φωτοβολταϊκά. Κήπος με ελαιόδεντρα. Υπάρχει οικοδομική άδεια. Λειτουργικό πηγάδι. Πρόσβαση από άσφαλτο.",
  );
  assert.equal(positive.features.solar, true);
  assert.equal(positive.features.trees, true);
  assert.equal(positive.features.well, true);
  assert.equal(positive.permits, "reported");
  assert.equal(positive.road, "paved");
  assert.equal(extract("Χωματόδρομος.").road, "unpaved");
});

test("structured source facts supply price, coordinates and evaluation, not illustrative assets", () => {
  const row = extractListing({ target, hit, now, html: schema() })!;
  assert.equal(row.priceEur, 200000);
  assert.equal(row.landSqm, 1200);
  assert.equal(row.latitude, 37.57);
  assert.equal(row.locationAccuracy, "approximate");
  assert.equal(row.photo, null);
  assert.equal(row.features.well, true);
  assert.equal(row.discovery?.basis, "page");
  assert.equal(evaluate(row).status, "eligible");
  assert.equal(
    extractListing({
      target,
      hit,
      now,
      html: schema({ offers: { price: 450000, priceCurrency: "EUR" } }),
    })!.priceEur,
    450000,
  );
  const outside = extractListing({
    target,
    hit,
    now,
    html: schema({ geo: { latitude: 0, longitude: 0 } }),
  })!;
  assert.equal(outside.latitude, null);
  assert.throws(
    () =>
      extractListing({
        target,
        hit,
        now,
        html: "<title>Just a moment...</title>",
      }),
    /human check/,
  );
});

test("Indomio reads only the matching public advertisement, including price visibility and approximate location", () => {
  const page = (visible = true, id = 7654321) =>
    '<script id="__NEXT_DATA__" type="application/json">' +
    JSON.stringify({
      props: {
        pageProps: {
          detailData: {
            realEstate: {
              id,
              title: "Μονοκατοικία 105 τμ, Ναύπλιο",
              contract: "sale",
              price: { value: 275000, visible },
              properties: [
                {
                  description: "Σε οικόπεδο 2.000 τ.μ. Πρόσβαση: άσφαλτος.",
                  surface: "105 m²",
                  bedRoomsNumber: 2,
                  location: {
                    city: "Ναύπλιο",
                    region: "Αργολίδα",
                    macrozone: "Κέντρο",
                    latitude: 37.57,
                    longitude: 22.8,
                    marker: "only_area",
                  },
                },
              ],
            },
          },
        },
      },
    }) +
    "</script>";
  const indomio = identifyListing("https://www.indomio.gr/aggelies/7654321/")!;
  const row = extractListing({ target: indomio, hit, now, html: page() })!;
  assert.equal(row.priceEur, 275000);
  assert.equal(row.areaSqm, 105);
  assert.equal(row.landSqm, 2000);
  assert.equal(row.bedrooms, 2);
  assert.equal(row.neighborhood, "Κέντρο");
  assert.equal(row.latitude, 37.57);
  assert.equal(
    extractListing({ target: indomio, hit, now, html: page(false) })!.priceEur,
    null,
  );
  assert.throws(
    () =>
      extractListing({ target: indomio, hit, now, html: page(true, 11111) }),
    /different listing/,
  );
});

test("source identities drop tracking, reject collections and disallow off-site requests", () => {
  assert.equal(
    identifyListing(url + "?utm_source=test&lang=en")?.externalId,
    target.externalId,
  );
  assert.equal(
    identifyListing("https://plot.gr/12345678-different-slug")?.externalId,
    target.externalId,
  );
  for (const invalid of [
    "https://www.plot.gr/search",
    "https://plot.gr.evil.test/12345678",
    "http://www.plot.gr/12345678",
    "https://user:pass@www.plot.gr/12345678",
    "https://127.0.0.1/12345678",
    "https://www.indomio.gr/pwlhsh-monokatoikies/",
  ])
    assert.equal(identifyListing(invalid), null);
  for (const invalid of [
    "http://www.plot.gr/12345678",
    "https://localhost/",
    "https://www.plot.gr:8443/12345678",
    "https://evil.test/",
  ])
    assert.throws(() => allowedUrl(invalid));
  assert.equal(
    identifyListing("https://www.spitogatos.gr/aggelia/11111111")?.sourceId,
    "spitogatos",
  );
  assert.equal(
    identifyListing(
      "https://www.xe.gr/property/d/poliseis-katoikion/123456789/attiki",
    )?.sourceId,
    "xe",
  );
});

test("public search parser decodes URLs, ignores ads and distinguishes challenge from no results", () => {
  const html =
    '<div class="result"><a class="result__a" href="//duckduckgo.com/l/?uddg=' +
    encodeURIComponent(url) +
    '">House &amp; garden</a><a class="result__snippet">Plot <b>1200</b> m²</a></div><div class="result result--ad"><a class="result__a" href="' +
    url +
    '">Ad</a></div>';
  assert.deepEqual(parseSearch(html), [
    { url, title: "House & garden", snippet: "Plot 1200 m²" },
  ]);
  assert.deepEqual(parseSearch('<div class="no-results">No results</div>'), []);
  assert.throws(
    () => parseSearch('<form id="challenge-form"></form>'),
    /human check/,
  );
  assert.throws(
    () => parseSearch("<html>Unexpected markup</html>"),
    /recognised/,
  );
});

test("daily due times and transactional lease prevent overlaps, permit recovery and record history", () => {
  const db = openDatabase(":memory:");
  try {
    const date = new Date(now);
    heartbeat(db, date);
    assert.equal(searchStatus(db, date).workerRunning, true);
    const first = claimRun(db, false, date)!;
    assert.equal(first.status, "running");
    assert.equal(
      claimRun(db, true, date),
      null,
      "Even a manual run must respect an active lease.",
    );
    assert.equal(
      searchStatus(db, new Date(date.getTime() + 21 * 60000)).latestRun?.status,
      "interrupted",
    );
    first.status = "complete";
    first.finishedAt = now;
    finishRun(db, first);
    assert.equal(claimRun(db, false, new Date(date.getTime() + 1000)), null);
    assert.ok(claimRun(db, false, new Date(date.getTime() + intervalMs + 1)));
  } finally {
    db.close();
  }
});

test("discovery imports real leads independently of demo, deduplicates and retains facts after blocked refresh", async () => {
  const db = openDatabase(":memory:");
  try {
    await runImport(db, adapters);
    const io = {
      provider: {
        name: "Fixture search",
        search: async (query: string) =>
          query.includes("site:plot.gr")
            ? [hit, { ...hit, url: hit.url + "?utm_source=duplicate" }]
            : [],
      },
      page: async () => schema(),
    };
    const first = await discover(db, io, true);
    assert.equal(first?.status, "complete");
    assert.equal(first?.found, 1);
    assert.equal(first?.imported, 1);
    const before = readListings(db, "all", "live");
    assert.equal(before.summary.properties, 1);
    assert.equal(before.listings[0]?.priceEur, 200000);
    assert.equal(readListings(db, "all", "demo").summary.properties, 10);
    const second = await discover(
      db,
      {
        ...io,
        page: async () => {
          throw new Error("HTTP 403");
        },
      },
      true,
    );
    assert.equal(second?.status, "partial");
    const after = readListings(db, "all", "live");
    assert.equal(after.summary.properties, 1);
    assert.equal(after.listings[0]?.id, before.listings[0]?.id);
    assert.equal(after.listings[0]?.priceEur, 200000);
    assert.equal(
      after.listings[0]?.discovery?.observedAt,
      before.listings[0]?.discovery?.observedAt,
    );
    assert.equal(after.listings[0]?.discovery?.pageStatus, "unavailable");
    assert.equal(after.listings[0]?.status, "needs-checking");
  } finally {
    db.close();
  }
});

test("search failure stops further queries and does not remove old records or claim complete coverage", async () => {
  const db = openDatabase(":memory:");
  let calls = 0;
  try {
    const result = await discover(
      db,
      {
        provider: {
          name: "Blocked",
          search: async () => {
            calls++;
            throw Error("human check");
          },
        },
        page: async () => {
          throw Error("Should not fetch");
        },
      },
      true,
    );
    assert.equal(calls, 1);
    assert.equal(result?.status, "failed");
    assert.equal(result?.imported, 0);
    assert.match(searchStatus(db).latestRun!.issues[0]!, /human check/);
    assert.equal(readListings(db, "all").summary.properties, 0);
  } finally {
    db.close();
  }
});

test("new indexed observations update indexed prices without downgrading previously read pages", () => {
  const old = extract("Οικόπεδο 1.000 τ.μ., τιμή 290.000 €.");
  const next = extract("Οικόπεδο 1.000 τ.μ., τιμή 280.000 €.");
  assert.equal(
    retainPrevious(old, next, now, "blocked", true)?.priceEur,
    280000,
  );
  const page = extractListing({ target, hit, now, html: schema() })!;
  assert.equal(
    retainPrevious(page, next, now, "blocked", true)?.priceEur,
    200000,
  );
});

test("skipped pages retain their attempt date and do not claim a failed refresh", () => {
  const old = extractListing({ target, hit, now, html: schema() })!;
  const later = "2026-10-12T09:00:00.000Z";
  const kept = retainPrevious(old, null, later, "Not requested", false, false)!;
  assert.equal(kept.discovery?.lastAttemptAt, now);
  assert.equal(kept.discovery?.pageStatus, "read");
  assert.equal(kept.discovery?.observedAt, now);
  const fresh = extract(hit.snippet);
  assert.equal(
    retainPrevious(undefined, fresh, later, "Not requested", true, false)
      ?.discovery?.lastAttemptAt,
    null,
  );
  const foreign = extractListing({
    target,
    hit,
    now,
    html: schema({ address: { addressCountry: "CY" } }),
  })!;
  assert.equal(evaluate(foreign).status, "excluded");
});

test("catalog photos and area persist for enrichment but missing-land records never enter REST results", async (t) => {
  const db = openDatabase(":memory:");
  const catalogHit = {
    url,
    title: "House 392 m² for sale",
    snippet: "39.000 €",
    catalog: {
      sourceUrl: "https://www.plot.gr/search/?category=20034",
      imageUrls: ["https://static.plot.gr/12345678_0_m.jpg"],
      location: { region: "Crete", city: "Heraklion", neighborhood: "Prinias" },
    },
  };
  const result = await discover(
    db,
    {
      acquisition: "browser",
      provider: {
        name: "Unavailable search",
        search: async () => {
          throw Error("human check");
        },
      },
      catalogs: async function* () {
        yield { name: "Portal cards", hits: [catalogHit] };
      },
      page: async () => {
        throw Error("HTTP 403");
      },
    },
    true,
  );
  assert.equal(result?.status, "partial");
  assert.equal(result?.found, 1);
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });
  const address = server.address() as { port: number };
  const response = await fetch(
    "http://127.0.0.1:" +
      address.port +
      "/api/listings?status=all&collection=live",
  );
  const { listings, summary } = await response.json();
  assert.equal(summary.eligible, 0);
  assert.equal(summary.needsChecking, 0);
  assert.equal(summary.properties, 0);
  assert.equal(listings.length, 0);
  const row = readListings(db, "all", "live", "audit").listings[0]!;
  assert.equal(row.priceEur, 39000);
  assert.equal(row.areaSqm, 392);
  assert.equal(row.landSqm, null);
  assert.equal(row.neighborhood, "Prinias");
  assert.equal(
    row.latitude,
    null,
    "A place name never becomes an exact property coordinate.",
  );
  assert.equal(row.discovery.basis, "catalog");
  assert.equal(row.discovery.acquisition, "browser");
  assert.equal(row.sourcePhotos[0].url, catalogHit.catalog.imageUrls[0]);
  assert.equal(row.sourcePhotos[0].sourceUrl, identifyListing(url)!.url);
  assert.equal(row.status, "excluded");
  assert.equal(row.score, null);

  const full = extractListing({ target, hit, now, html: schema() })!;
  const next = extractListing({ target, hit: catalogHit, now })!;
  const kept = retainPrevious(full, next, now, "HTTP 403", true)!;
  assert.equal(
    kept.priceEur,
    200000,
    "Catalog updates cannot downgrade full-page facts.",
  );
  assert.equal(kept.landSqm, 1200);
});

test("REST serves separate collections and persisted search status without private configuration", async (t) => {
  const db = openDatabase(":memory:");
  await runImport(db, adapters);
  const server = createApp(db).listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    db.close();
  });
  const address = server.address() as { port: number };
  const base = "http://127.0.0.1:" + address.port;
  const live = await fetch(
    base + "/api/listings?status=all&collection=live",
  ).then((r) => r.json());
  assert.equal(live.summary.properties, 0);
  const demo = await fetch(
    base + "/api/listings?status=all&collection=demo",
  ).then((r) => r.json());
  assert.equal(demo.summary.properties, 10);
  assert.equal(
    (await fetch(base + "/api/listings?collection=invalid")).status,
    400,
  );
  const response = await fetch(base + "/api/search/status");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const status = await response.json();
  assert.equal(status.intervalHours, 24);
  assert.equal(status.latestRun, null);
  assert.equal("databasePath" in status, false);
});

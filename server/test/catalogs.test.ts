import assert from "node:assert/strict";
import test from "node:test";
import { parsePlotCatalog, publicCatalogs } from "../src/discovery/catalogs.js";
import { extractListing } from "../src/discovery/extract.js";
import { identifyListing } from "../src/discovery/sites/registry.js";

const fixture =
  '<html><body>\n  <aside>Mortgage illustration: 350 € per month</aside>\n  <a class="row-anchor" href="/99999011-monokatoikia-392-tm-gia-pwlisi-test?from-promotion=1">\n    <h2 class="title">Μονοκατοικία 392 τ.μ. για πώληση</h2>\n    <div class="old-price">49.000 €</div>\n    <div class="current-price"><span>39.000</span> <span>€</span></div>\n    <div class="key-features">3 υπνοδωμάτια 392 τ.μ. 1950</div>\n    <div class="loc">Ν. Σάμου » Ικαρία</div>\n    <img src="https://static.plot.gr/_nuxt/img/plot_preview.png">\n    <img src="https://static-cz.car.gr/99999011_fFW_m.jpeg" data-src="https://static-cz.car.gr/99999011_fFW_m.jpeg">\n    <img data-src="https://static-cz.car.gr/99999011_2_m.jpeg">\n    <source srcset="https://static-cz.car.gr/99999011_3_m.jpeg 1x, https://static-cz.car.gr/99999011_3_z.jpeg 2x">\n    <img src="https://static-cz.car.gr/users/123/avatar.jpeg">\n    <img src="https://static-cz.car.gr/99999012_0_m.jpeg">\n    <img src="https://static-cz.car.gr/99999011_4_m.jpeg?token=secret">\n    <img src="https://elsewhere.example/99999011_5_m.jpeg">\n    <img src="https://static-cz.car.gr/static/images/classifieds/real_estate_no_photo.png">\n    <script>window.untrusted = "must not execute";</script>\n  </a>\n  <a href="/99999011-monokatoikia-392-tm-gia-pwlisi-test">Open listing</a>\n  <a href="/99999012-monokatoikia-160-tm-gia-pwlisi-test">\n    <h2>Μονοκατοικία 160 τ.μ. για πώληση</h2>\n    <div class="current-price">310.000 €</div>\n    <div class="loc">Ν. Ηρακλείου » Αγία Βαρβάρα » Πρινιάς</div>\n  </a>\n  <a href="/99999013-monokatoikia-100-tm-gia-pwlisi-test">\n    <h2>Μονοκατοικία 100 τ.μ. για πώληση</h2>\n    <div class="current-price">120.000 €</div>\n    <div class="loc">Ν. Ηρακλείου » Αγία Βαρβάρα » Πρινιάς</div>\n    <img src="https://static-cz.car.gr/static/images/classifieds/real_estate_no_photo.png">\n  </a>\n</body></html>';

test("catalog cards preserve actual photos and location while excluding unrelated images and page text", () => {
  const sourceUrl = "https://www.plot.gr/search/?category=20034";
  const hits = parsePlotCatalog(fixture, sourceUrl);
  assert.equal(hits.length, 2);
  const hit = hits[0]!;
  assert.equal(
    hit.url,
    "https://www.plot.gr/99999011-monokatoikia-392-tm-gia-pwlisi-test",
  );
  assert.equal(hit.title, "Μονοκατοικία 392 τ.μ. για πώληση");
  assert.match(hit.snippet, /39.000/);
  assert.doesNotMatch(hit.snippet, /49.000|350|secret|untrusted/);
  assert.deepEqual(hit.catalog?.imageUrls, [
    "https://static-cz.car.gr/99999011_fFW_m.jpeg",
    "https://static-cz.car.gr/99999011_2_m.jpeg",
    "https://static-cz.car.gr/99999011_3_m.jpeg",
    "https://static-cz.car.gr/99999011_3_z.jpeg",
  ]);
  assert.equal(hit.catalog?.sourceUrl, sourceUrl);
  assert.deepEqual(hit.catalog?.location, {
    region: "Ν. Σάμου",
    city: "Ικαρία",
    neighborhood: "",
  });
  assert.deepEqual(hits[1]!.catalog?.location, {
    region: "Ν. Ηρακλείου",
    city: "Αγία Βαρβάρα",
    neighborhood: "Πρινιάς",
  });
  assert.deepEqual(hits[1]!.catalog?.imageUrls, []);
  assert.equal("landSqm" in hit, false);
});

test("catalog price screening distinguishes an empty result set from an unreadable page", () => {
  const expensiveOnly =
    '<a href="/99999014-house-for-sale"><h2>House for sale</h2><div class="current-price">450.000 €</div></a>';
  assert.deepEqual(parsePlotCatalog(expensiveOnly), []);
  assert.deepEqual(parsePlotCatalog("<p>Δεν βρέθηκαν αγγελίες</p>"), []);
  assert.throws(
    () => parsePlotCatalog("<title>Access denied</title>"),
    /No readable sale cards/,
  );
});

test("catalog extraction keeps source photos and area names without inventing land or an exact location", () => {
  const hit = parsePlotCatalog(fixture)[0]!;
  const observation = extractListing({
    target: identifyListing(hit.url)!,
    hit,
    now: "2026-10-10T00:00:00.000Z",
  })!;
  assert.equal(observation.priceEur, 39000);
  assert.equal(observation.areaSqm, 392);
  assert.equal(observation.landSqm, null);
  assert.equal(observation.city, "Ικαρία");
  assert.equal(observation.region, "Ν. Σάμου");
  assert.equal(observation.latitude, null);
  assert.equal(observation.longitude, null);
  assert.equal(observation.sourcePhotos?.length, 4);
  assert.equal(observation.sourcePhotos?.[0]?.sourceUrl, hit.url);
  assert.equal(observation.discovery?.basis, "catalog");
  assert.match(observation.discovery?.message ?? "", /catalog|result/i);
});

test("Plot's alternate image CDN is retained while its generic placeholder stays excluded", () => {
  const html =
    '<a href="/99999015-house-for-sale"><h2>House for sale</h2><img src="https://static.plot.gr/99999015_1_m.jpg"><img src="https://static.plot.gr/_nuxt/img/plot_preview.png"></a>';
  assert.deepEqual(parsePlotCatalog(html)[0]!.catalog?.imageUrls, [
    "https://static.plot.gr/99999015_1_m.jpg",
  ]);
});

test("catalog enumeration returns observed evidence and stops after a blocked request", async () => {
  const calls: string[] = [];
  const results = [];
  for await (const result of publicCatalogs(async (url) => {
    calls.push(url);
    if (calls.length > 1) throw new Error("HTTP 403 from www.plot.gr");
    return fixture;
  }))
    results.push(result);
  assert.equal(calls.length, 2);
  assert.equal(results.length, 2);
  assert.equal(results[0]!.hits[0]!.catalog?.sourceUrl, calls[0]);
  assert.equal(results[1]!.error, "HTTP 403 from www.plot.gr");
});

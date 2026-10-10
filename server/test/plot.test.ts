import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase } from "../src/db/database.js";
import { extractListing } from "../src/discovery/extract.js";
import { sourcePhotos } from "../src/discovery/photos.js";
import { retainPrevious } from "../src/discovery/run.js";
import { importSavedPage } from "../src/discovery/saved-page.js";
import { identifyListing } from "../src/discovery/sites/registry.js";
import { readListings } from "../src/repository.js";
import { evaluate } from "../src/scoring.js";

const url = "https://www.plot.gr/99999123-test-fixture";
const target = identifyListing(url)!;
const now = "2026-10-01T09:00:00.000Z";
const images = Array.from(
  { length: 5 },
  (_, i) => "https://static-cz.car.gr/99999123_" + i + "_z.jpeg",
);
const specs = [
  ["Αριθμός αγγελίας", "99999123"],
  ["Κατηγορία", "Μονοκατοικία"],
  ["Περιοχή", "Ηράκλειο » Αγία Βαρβάρα » Πρινιάς"],
  ["Εμβαδόν", "160 τ.μ."],
  ["Υπνοδωμάτια", "3 υπνοδωμάτια"],
  ["Μπάνια", "1"],
  ["Έτος κατασκευής", "1950"],
  ["Σύστημα θέρμανσης", "Αυτόνομη θέρμανση"],
  ["Μέσο θέρμανσης", "Πετρέλαιο, Ξύλα"],
  ["Ενεργειακή κλάση", "Δ"],
  ["Σαλόνια", "1"],
  ["Κουζίνες", "1"],
  ["Τηλέφωνο", "CONTACT-MUST-NOT-IMPORT"],
];
function html(price = 200000) {
  return [
    '<link rel="canonical" href="' + url + '">',
    "<h1>Μονοκατοικία 160 τ.μ. για πώληση, Αγία Βαρβάρα</h1>",
    '<script type="application/ld+json">' +
      JSON.stringify({
        "@type": "Product",
        name: "House 160 m² for sale",
        description:
          "Οικόπεδο 1000 τ.μ. Κήπος. Ηλιακός θερμοσίφωνας. Paved access.",
        offers: { price, priceCurrency: "EUR" },
        image: images,
      }) +
      "</script>",
    specs
      .map(
        ([label, value]) =>
          '<div class="spec"><span class="spec-label">' +
          label +
          ':</span><span class="spec-value">' +
          value +
          "</span></div>",
      )
      .join(""),
    "<aside>Financing €500. Other listing €999999.</aside>",
    "<script>throw new Error('SCRIPT-MUST-NOT-EXECUTE')</script>",
  ].join("\n");
}

test("Plot SSR extracts property facts and gallery without executing scripts or reading unrelated prices", () => {
  const row = extractListing({
    target,
    hit: { url, title: "", snippet: "" },
    html: html(),
    now,
  })!;
  assert.equal(row.priceEur, 200000);
  assert.equal(row.areaSqm, 160);
  assert.equal(row.landSqm, 1000);
  assert.equal(row.bedrooms, 3);
  assert.equal(row.sourcePhotos?.length, 5);
  assert.equal(row.sourceDetails?.length, 9);
  assert.equal(
    row.sourceDetails?.find((x) => x.label === "Energy class")?.value,
    "Δ",
  );
  assert.equal(
    row.sourceDetails?.find((x) => x.label === "Year built")?.value,
    "1950",
  );
  assert.equal(
    row.features.solar,
    null,
    "Water heating is not photovoltaic power.",
  );
  assert.equal(
    row.features.trees,
    null,
    "A garden does not establish mature trees.",
  );
  assert.equal(row.latitude, null);
  assert.doesNotMatch(
    JSON.stringify(row),
    /CONTACT-MUST-NOT-IMPORT|SCRIPT-MUST-NOT-EXECUTE/,
  );
  assert.throws(
    () =>
      extractListing({
        target,
        hit: { url, title: "", snippet: "" },
        now,
        html: html().replace(url, url.replace("99999123", "88888123")),
      }),
    /different listing/,
  );
});

test("source photographs are restricted to public image paths belonging to the property", () => {
  const invalid = [
    images[0],
    images[0],
    "https://static-cz.car.gr/11111111_0_z.jpeg",
    "https://example.com/99999123_0_z.jpeg",
    "http://static-cz.car.gr/99999123_0_z.jpeg",
    "https://secret@static-cz.car.gr/99999123_0_z.jpeg",
    images[0] + "?token=private",
    "https://static-cz.car.gr/users/99999123_0_z.jpeg",
    "data:image/png;base64,example",
    null,
  ];
  assert.deepEqual(
    sourcePhotos(invalid, "plot", "99999123", url, "House").map((x) => x.url),
    [images[0]],
  );
  assert.deepEqual(sourcePhotos(images, "other", "99999123", url, "House"), []);
});

test("saved-page imports update one property, retain provenance and survive failed refreshes", async () => {
  const db = openDatabase(":memory:");
  try {
    await importSavedPage(db, html(), now);
    const first = readListings(db, "all", "live").listings[0]!;
    assert.equal(first.priceEur, 200000);
    assert.equal(
      first.status,
      "needs-checking",
      "Saved availability is not live verification.",
    );
    assert.equal(first.discovery?.acquisition, "saved-page");
    assert.equal(first.discovery?.pageStatus, "not-requested");
    assert.equal(first.discovery?.lastAttemptAt, null);
    await importSavedPage(db, html(190000), "2026-10-02T09:00:00.000Z");
    await importSavedPage(db, html(190000), "2026-10-02T09:00:00.000Z");
    await importSavedPage(db, html(200000), now);
    const result = readListings(db, "all", "live");
    assert.equal(result.listings.length, 1);
    assert.equal(result.listings[0]!.id, first.id);
    assert.equal(result.listings[0]!.priceEur, 190000);
    const previous = JSON.parse(
      db.prepare("SELECT payload FROM observations").get()!.payload as string,
    );
    const retained = retainPrevious(
      previous,
      null,
      "2026-10-03T09:00:00.000Z",
      "HTTP 403",
      true,
    )!;
    assert.equal(retained.priceEur, 190000);
    assert.equal(retained.sourcePhotos?.length, 5);
    assert.equal(retained.sourceDetails?.length, 9);
    assert.equal(retained.discovery?.acquisition, "saved-page");
    assert.equal(retained.discovery?.pageStatus, "unavailable");
    assert.equal(retained.observedAt, previous.observedAt);
    assert.equal(evaluate(retained).status, "needs-checking");
    await assert.rejects(
      () => importSavedPage(db, "<h1>No listing identity</h1>", now),
      /must identify/,
    );
    await assert.rejects(
      () => importSavedPage(db, html(), "invalid"),
      /capture time/,
    );
  } finally {
    db.close();
  }
});

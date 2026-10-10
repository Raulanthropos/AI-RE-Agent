import assert from "node:assert/strict";
import test from "node:test";
import { openDatabase } from "../src/db/database.js";
import { extractListing } from "../src/discovery/extract.js";
import { identifyListing } from "../src/discovery/sites/registry.js";
import { enrichObservations } from "../src/enrichment/index.js";
import { locateArea, parsePlaces, placeKey } from "../src/enrichment/places.js";
import { translateTexts, translationKey } from "../src/enrichment/translate.js";
import { evaluate } from "../src/scoring.js";

// Synthetic GeoNames rows, not the downloaded gazetteer or a network service.
function geoRow(
  id: string,
  name: string,
  aliases: string,
  kind: string,
  codes: string[],
  latitude = 35.17,
  longitude = 25.0,
) {
  return [
    id,
    name,
    name,
    aliases,
    latitude,
    longitude,
    kind.startsWith("ADM") ? "A" : "P",
    kind,
    "GR",
    "",
    ...codes,
    "0",
    "",
    "",
    "Europe/Athens",
    "2026-10-01",
  ].join("\t");
}
const rows = [
  geoRow(
    "1",
    "Heraklion Regional Unit",
    "Ηρακλείου,Ν. Ηρακλείου,Ηράκλειο",
    "ADM2",
    ["13", "35", "", ""],
  ),
  geoRow("2", "Attica", "Αττική,Αττικής", "ADM1", ["09", "", "", ""]),
  geoRow("11", "Prinias", "Πρινιάς", "PPL", ["13", "35", "10", ""]),
  geoRow("12", "Agia Varvara", "Αγία Βαρβάρα", "PPL", ["13", "35", "10", ""]),
  geoRow(
    "21",
    "Prinias",
    "Πρινιάς",
    "PPL",
    ["09", "01", "20", ""],
    38.05,
    23.75,
  ),
  geoRow(
    "22",
    "Neo Irakleio",
    "Νέο Ηράκλειο",
    "PPL",
    ["09", "01", "20", ""],
    38.06,
    23.76,
  ),
];
const prinias = {
  countryCode: "GR",
  region: "Ν. Ηρακλείου",
  city: "Αγία Βαρβάρα",
  neighborhood: "Πρινιάς",
};

test("area lookup uses the named region and cannot move Prinias to an unrelated Attica place", () => {
  const places = parsePlaces(rows.join("\n"));
  assert.equal(placeKey("ΠΡΙΝΙΆΣ"), placeKey("Prinias"));
  const area = locateArea(prinias, places)!;
  assert.equal(area.geonameId, "11");
  assert.equal(area.latitude, 35.17);
  assert.equal(area.longitude, 25);
  assert.equal(area.label, "Prinias, Heraklion Regional Unit");
  assert.match(area.explanation, /exact position is unknown/);
  assert.equal(
    locateArea({ ...prinias, countryCode: "IT" }, places),
    undefined,
  );
  assert.equal(locateArea({ ...prinias, region: "" }, places), undefined);
  assert.equal(
    locateArea({ ...prinias, region: "Unrecognized region" }, places),
    undefined,
  );
});

test("ambiguous area names require one region and municipality instead of guessing", () => {
  const duplicateVillage = geoRow("13", "Prinias", "Πρινιάς", "PPL", [
    "13",
    "35",
    "99",
    "",
  ]);
  const places = parsePlaces([...rows, duplicateVillage].join("\n"));
  assert.equal(
    locateArea(prinias, places)?.geonameId,
    "11",
    "The known town disambiguates its municipality.",
  );
  assert.equal(
    locateArea({ ...prinias, city: "Unknown town" }, places),
    undefined,
  );
  const ambiguousRegion = parsePlaces(
    [
      ...rows,
      geoRow("3", "Other region", "Ηρακλείου", "ADM2", ["10", "99", "", ""]),
    ].join("\n"),
  );
  assert.equal(locateArea(prinias, ambiguousRegion), undefined);
});

test("translation deduplicates, preserves English, applies the glossary, and caches by original source text", async () => {
  const db = openDatabase(":memory:");
  try {
    const calls: string[][] = [];
    const fakeTranslate = async (texts: string[]) => {
      calls.push(texts);
      return texts.map((_, i) => "English translation " + i);
    };
    const source = "Πέτρινη κατοικία";
    const region = "Ν. Ηρακλείου";
    const result = await translateTexts(
      db,
      [source, source, region, "Already English", "Μονοκατοικία", "Δ"],
      fakeTranslate,
    );
    assert.deepEqual(calls, [[source, "Περιφερειακή Ενότητα Ηρακλείου"]]);
    assert.equal(result.get("Already English"), "Already English");
    assert.equal(result.get("Μονοκατοικία"), "Detached house");
    assert.equal(result.get("Δ"), "D");
    assert.equal(result.get(source), "English translation 0");
    assert.equal(result.get(region), "English translation 1");
    assert.deepEqual(
      db
        .prepare("SELECT value FROM translation_cache WHERE key = ?")
        .get(translationKey(region))?.value,
      "English translation 1",
    );
    const cached = await translateTexts(db, [region, source], async () => {
      throw new Error("Cached text must not call the translator");
    });
    assert.equal(cached.get(region), result.get(region));
    assert.equal(cached.get(source), result.get(source));
  } finally {
    db.close();
  }
});

test("an empty translation is rejected instead of cached as successful", async () => {
  const db = openDatabase(":memory:");
  try {
    await assert.rejects(
      translateTexts(db, ["Πέτρινη κατοικία"], async () => [" "]),
      /empty result/,
    );
    assert.equal(
      db.prepare("SELECT COUNT(*) AS count FROM translation_cache").get()
        ?.count,
      0,
    );
  } finally {
    db.close();
  }
});

test("English presentation enrichment preserves original facts, coordinates, score and observation date", async () => {
  const db = openDatabase(":memory:");
  try {
    const url = "https://www.plot.gr/99999701-enrichment-fixture";
    const row = extractListing({
      target: identifyListing(url)!,
      hit: {
        url,
        title: "Μονοκατοικία 100 τ.μ. για πώληση",
        snippet: "Οικόπεδο 1500 τ.μ.",
      },
      html: null,
      now: "2026-10-01T09:00:00.000Z",
    })!;
    row.latitude = 35.17;
    row.longitude = 25;
    // A deliberately unknown region keeps this test independent of local data.
    row.region = "Synthetic fixture region";
    const before = structuredClone(row);
    const evaluation = evaluate(row);
    await enrichObservations(db, [row], async (texts) =>
      texts.map(() => "Translated presentation only"),
    );
    const { english, areaLocation: _area, ...factsAfter } = row;
    const {
      english: _previous,
      areaLocation: _previousArea,
      ...factsBefore
    } = before;
    assert.ok(english);
    assert.equal(english.title, "Translated presentation only");
    assert.deepEqual(factsAfter, factsBefore);
    assert.deepEqual(evaluate(row), evaluation);
    assert.equal(row.latitude, 35.17);
    assert.equal(row.longitude, 25);
    assert.equal(row.observedAt, "2026-10-01T09:00:00.000Z");
  } finally {
    db.close();
  }
});

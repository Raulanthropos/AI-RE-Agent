import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import type { ListingsResponse } from '@ai-re-agent/contracts';
import { openDatabase } from '../src/db/database.js';
import { adapters } from '../src/ingestion/adapters/index.js';
import { normalizeObservation, propertyKey } from '../src/ingestion/normalize.js';
import { runImport } from '../src/ingestion/run.js';
import type { ListingAdapter, ListingObservation } from '../src/ingestion/types.js';
import { readListings } from '../src/repository.js';
import { evaluate } from '../src/scoring.js';
import { createApp } from '../src/app.js';

async function fixture() { return (await adapters[0]!.fetchListings())[0]!; }
const adapterFor = (...rows: ListingObservation[]): ListingAdapter => ({
  id: rows[0]!.sourceId, name: 'Test adapter', async fetchListings() { return rows; },
});

test('sample import deduplicates 15 records into 12 properties and is idempotent', async t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const first = await runImport(db, adapters);
  const before = readListings(db, 'all');
  const second = await runImport(db, adapters);
  assert.equal(first.processed, 15);
  for (const result of [first, second]) {
    assert.equal(result.observations, 15);
    assert.equal(result.properties, 12);
    assert.equal(result.duplicates, 3);
    assert.equal(result.eligible, 7);
    assert.equal(result.excluded, 5);
  }
  assert.deepEqual(readListings(db, 'all').listings, before.listings);
  const kypseli = before.listings.find(listing => listing.neighborhood === 'Κυψέλη')!;
  assert.equal(kypseli.sources.length, 2);
  assert.equal(kypseli.priceEur, 132_000, 'newest source supplies canonical details');
  assert.equal(kypseli.score, 77.63);
  assert.ok(kypseli.sources.every(source => !source.url.includes('utm_')));
  assert.equal(before.listings[0]!.score, 80.1);
  for (const listing of before.listings) {
    if (listing.eligible) {
      assert.equal(listing.reasons.length, 5);
      assert.equal(listing.score, Math.round(listing.reasons.reduce((sum, reason) => sum + reason.points, 0) * 100) / 100);
      assert.ok(listing.reasons.every(reason => reason.points >= 0 && reason.points <= reason.maxPoints && reason.reason));
    } else {
      assert.equal(listing.score, null);
      assert.equal(listing.reasons.length, 0);
      assert.ok(listing.filterReasons.length > 0);
    }
  }
});

test('hard filters are inclusive at boundaries and missing core data is excluded', async () => {
  const base = normalizeObservation(await fixture());
  assert.equal(evaluate({ ...base, priceEur: 250_000, areaSqm: 50, bedrooms: 1 }).eligible, true);
  for (const override of [
    { priceEur: 250_001 }, { priceEur: null }, { priceEur: 0 }, { priceEur: NaN },
    { areaSqm: 49.9 }, { areaSqm: null }, { bedrooms: 0 }, { bedrooms: null },
    { city: 'Θεσσαλονίκη' }, { active: false }, { type: 'house' as const }, { transaction: 'rent' as const },
  ]) assert.equal(evaluate({ ...base, ...override }).eligible, false, JSON.stringify(override));
  const rejected = evaluate({ ...base, active: false, priceEur: null, areaSqm: 20, bedrooms: 0 });
  assert.equal(rejected.filterReasons.length, 4);
});

test('fixed scoring reaches 0 and 100, clamps extremes, and explains missing soft fields', async () => {
  const base = normalizeObservation(await fixture());
  const maximum = evaluate({ ...base, priceEur: 100_000, areaSqm: 120, condition: 'new', metroDistanceM: 0 });
  assert.equal(maximum.score, 100);
  assert.equal(evaluate({ ...base, priceEur: 1, areaSqm: 200, condition: 'new', metroDistanceM: 0 }).score, 100);
  const minimum = evaluate({ ...base, priceEur: 250_000, areaSqm: 50, condition: 'unknown', metroDistanceM: 2000 });
  assert.equal(minimum.score, 0);
  const unknown = evaluate({ ...base, condition: 'unknown', metroDistanceM: null });
  assert.equal(unknown.reasons[3]!.points, 0);
  assert.equal(unknown.reasons[4]!.points, 0);
  assert.match(unknown.reasons[4]!.reason, /unknown/);
});

test('Greek normalization matches duplicates but does not merge unknown units or different apartments', async () => {
  const row = normalizeObservation(await fixture());
  const copy = normalizeObservation({ ...row, city: 'Athens', address: '  ΦΩΚΙΩΝΟΣ   ΝΕΓΡΗ 24 ', sourceId: 'another', externalId: 'another-id' });
  assert.equal(propertyKey(row), propertyKey(copy));
  assert.notEqual(propertyKey(row), propertyKey({ ...copy, unit: 'A2' }));
  assert.notEqual(propertyKey({ ...row, unit: null }), propertyKey({ ...copy, unit: null }));
  assert.notEqual(propertyKey({ ...row, address: null }), propertyKey({ ...copy, address: null }));
  assert.throws(() => normalizeObservation({ ...row, url: 'javascript:alert(1)' }), /Invalid listing URL/);
  assert.throws(() => normalizeObservation({ ...row, condition: 'unmapped' as ListingObservation['condition'] }), /Invalid property/);
});

test('a changed listing replaces its source record, older observations never overwrite newer data', async t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const original = await fixture();
  await runImport(db, [adapterFor(original)]);
  const changed = { ...original, priceEur: 125_000, observedAt: '2026-10-03T09:00:00Z' };
  await runImport(db, [adapterFor(changed)]);
  await runImport(db, [adapterFor(original)]);
  assert.equal(readListings(db).listings[0]!.priceEur, 125_000);
  const stats = await runImport(db, [adapterFor({ ...changed, address: 'A corrected address 15', observedAt: '2026-10-04T09:00:00Z' })]);
  assert.equal(stats.observations, 1);
  assert.equal(stats.properties, 1);
  assert.equal(readListings(db).listings[0]!.address, 'A corrected address 15');
});

test('adapter and validation failures leave the last successful import intact', async t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  await runImport(db, adapters);
  const before = readListings(db, 'all');
  const failing: ListingAdapter = { id: 'failed', name: 'Failed', async fetchListings() { throw new Error('Source unavailable'); } };
  await assert.rejects(runImport(db, [adapters[0]!, failing]), /Source unavailable/);
  assert.deepEqual(readListings(db, 'all'), before);
  const invalid = { ...await fixture(), url: 'not a URL' };
  await assert.rejects(runImport(db, [adapterFor(invalid)]));
  assert.deepEqual(readListings(db, 'all'), before);
});

test('SQLite failure rolls back observation changes and materialized scores together', async t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  const original = await fixture();
  await runImport(db, [adapterFor(original)]);
  const before = readListings(db, 'all');
  db.exec("CREATE TRIGGER reject_listing BEFORE INSERT ON listings BEGIN SELECT RAISE(ABORT, 'test failure'); END;");
  await assert.rejects(runImport(db, [adapterFor({ ...original, priceEur: 100_000 })]), /test failure/);
  assert.deepEqual(readListings(db, 'all'), before);
  const stored = db.prepare('SELECT payload FROM observations').get()!;
  assert.equal((JSON.parse(stored.payload as string) as ListingObservation).priceEur, original.priceEur);
});

test('disk database survives reopening and REST serves the worker results with validated filters', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'ai-re-agent-test-'));

  const path = join(directory, 'listings.sqlite');
  const writer = openDatabase(path);
  await runImport(writer, adapters);
  writer.close();
  const reader = openDatabase(path);
  const server = createApp(reader).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    reader.close();
    assert.equal(join(directory, '..'), tmpdir());
    rmSync(directory, { recursive: true, force: true });
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const baseUrl = `http://127.0.0.1:${address.port}`;
  assert.deepEqual(await (await fetch(`${baseUrl}/api/health`)).json(), { status: 'ok', database: 'sqlite' });
  for (const [status, expected] of [['eligible', 7], ['excluded', 5], ['all', 12]] as const) {
    const response = await fetch(`${baseUrl}/api/listings?status=${status}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json() as ListingsResponse;
    assert.equal(body.listings.length, expected);
    assert.equal(body.summary.properties, 12);
    if (status === 'excluded') assert.ok(body.listings.every(listing => listing.score === null && listing.filterReasons.length));
  }
  assert.equal(((await (await fetch(`${baseUrl}/api/listings`)).json()) as ListingsResponse).listings.length, 7);
  assert.equal((await fetch(`${baseUrl}/api/listings?status=unknown`)).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/listings?status=all&status=eligible`)).status, 400);
  assert.equal((await fetch(`${baseUrl}/api/no-such-route`)).status, 404);
});

test('an initialized but unseeded database returns a useful empty result', t => {
  const db = openDatabase(':memory:');
  t.after(() => db.close());
  assert.deepEqual(readListings(db).summary, { observations: 0, properties: 0, duplicates: 0, eligible: 0, excluded: 0, lastImportedAt: null });
});

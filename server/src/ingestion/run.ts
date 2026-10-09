import type { DatabaseSync } from 'node:sqlite';
import type { ListingSource, PropertyDetails } from '@ai-re-agent/contracts';
import { evaluate, POLICY } from '../scoring.js';
import { normalizeObservation, propertyKey } from './normalize.js';
import type { ListingAdapter, ListingObservation } from './types.js';
import { readListings } from '../repository.js';

export async function runImport(db: DatabaseSync, adapters: ListingAdapter[]) {
  if (new Set(adapters.map(adapter => adapter.id)).size !== adapters.length) throw new Error('Adapter IDs must be unique.');
  const observations: ListingObservation[] = [];
  // Finish all external IO and validation before acquiring the SQLite write lock.
  for (const adapter of adapters) {
    for (const row of await adapter.fetchListings()) {
      if (row.sourceId !== adapter.id) throw new Error(`Adapter ${adapter.id} returned a different source ID.`);
      observations.push(normalizeObservation(row));
    }
  }
  const importedAt = new Date().toISOString();
  db.exec('BEGIN IMMEDIATE');
  try {
    const upsert = db.prepare(`
      INSERT INTO observations (source_id, external_id, property_key, payload, imported_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (source_id, external_id) DO UPDATE SET
        property_key = excluded.property_key, payload = excluded.payload, imported_at = excluded.imported_at
      WHERE json_extract(excluded.payload, '$.observedAt') >= json_extract(observations.payload, '$.observedAt')
    `);
    for (const row of observations) upsert.run(row.sourceId, row.externalId, propertyKey(row), JSON.stringify(row), importedAt);
    const groups = new Map<string, ListingObservation[]>();
    for (const stored of db.prepare('SELECT property_key, payload FROM observations').all()) {
      const key = stored.property_key as string;
      const group = groups.get(key) ?? [];
      group.push(JSON.parse(stored.payload as string) as ListingObservation);
      groups.set(key, group);
    }
    // Small local dataset: rebuild the materialized evaluations atomically.
    db.exec('DELETE FROM listings');
    const insert = db.prepare('INSERT INTO listings (id, payload, evaluation, scoring_version, scored_at) VALUES (?, ?, ?, ?, ?)');
    for (const [id, group] of groups) {
      group.sort((a, b) => b.observedAt.localeCompare(a.observedAt) || a.sourceId.localeCompare(b.sourceId) || a.externalId.localeCompare(b.externalId));
      const selected = group[0]!;
      const { sourceId, sourceName, externalId, url, observedAt, ...property } = selected;
      const sources: ListingSource[] = group.map(row => ({
        sourceId: row.sourceId, sourceName: row.sourceName, externalId: row.externalId, url: row.url, observedAt: row.observedAt,
      }));
      const payload: PropertyDetails & { sources: ListingSource[] } = { ...property, sources };
      insert.run(id, JSON.stringify(payload), JSON.stringify(evaluate(property)), POLICY.version, importedAt);
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return { processed: observations.length, ...readListings(db, 'all').summary };
}

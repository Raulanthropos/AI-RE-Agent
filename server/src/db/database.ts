import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { databasePath } from '../config.js';

export function openDatabase(path = databasePath): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;');
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version > 1) {
    db.close();
    throw new Error('Database schema is newer than this application.');
  }
  if (version === 0) {
    db.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS observations (
        source_id TEXT NOT NULL,
        external_id TEXT NOT NULL,
        property_key TEXT NOT NULL,
        payload TEXT NOT NULL CHECK (json_valid(payload)),
        imported_at TEXT NOT NULL,
        PRIMARY KEY (source_id, external_id)
      ) STRICT;
      CREATE INDEX IF NOT EXISTS observations_property_key ON observations(property_key);
      CREATE TABLE IF NOT EXISTS listings (
        id TEXT PRIMARY KEY,
        payload TEXT NOT NULL CHECK (json_valid(payload)),
        evaluation TEXT NOT NULL CHECK (json_valid(evaluation)),
        scoring_version TEXT NOT NULL,
        scored_at TEXT NOT NULL
      ) STRICT;
      PRAGMA user_version = 1;
      COMMIT;
    `);
  }
  return db;
}

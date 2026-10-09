import { openDatabase } from './db/database.js';
import { adapters } from './ingestion/adapters/index.js';
import { runImport } from './ingestion/run.js';

const db = openDatabase();
try {
  console.log(JSON.stringify(await runImport(db, adapters), null, 2));
} catch (error) {
  console.error('Import failed; no partial changes were committed.', error);
  process.exitCode = 1;
} finally {
  db.close();
}

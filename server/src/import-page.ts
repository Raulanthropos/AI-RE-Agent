import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { openDatabase } from "./db/database.js";
import { importSavedPage } from "./discovery/saved-page.js";

const path = process.argv[2];
if (!path || process.argv.length !== 3) {
  console.error('Usage: npm run import:page -- "path/to/saved-page.html"');
  process.exitCode = 1;
} else {
  const db = openDatabase();
  try {
    const file = resolve(path);
    const stat = statSync(file);
    if (!stat.isFile() || stat.size > 2_000_000)
      throw new Error("Provide an HTML/text file smaller than 2 MB.");
    const result = await importSavedPage(
      db,
      readFileSync(file, "utf8"),
      stat.mtime.toISOString(),
    );
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(
      "Saved-page import:",
      error instanceof Error ? error.message : "Unable to import.",
    );
    process.exitCode = 1;
  } finally {
    db.close();
  }
}

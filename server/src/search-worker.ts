import { openDatabase } from "./db/database.js";
import { duckDuckGo } from "./discovery/providers/duckduckgo.js";
import { publicReader } from "./discovery/network.js";
import { discover } from "./discovery/run.js";
import { heartbeat } from "./discovery/state.js";
import { publicBrowser } from "./discovery/browser.js";
import { publicCatalogs } from "./discovery/catalogs.js";

const db = openDatabase();
const once = process.argv.includes("--once");
let stopping = false;
let wake: (() => void) | undefined;
process.on("SIGINT", () => {
  stopping = true;
  wake?.();
});
process.on("SIGTERM", () => {
  stopping = true;
  wake?.();
});
const pulse = once ? undefined : setInterval(() => heartbeat(db), 30000);
try {
  if (!once) heartbeat(db);
  do {
    const browser = publicBrowser();
    const read = publicReader({browser:browser.read});
    const searchRead = publicReader();
    let run;
    try {
      run = await discover(db, {
        provider: duckDuckGo(searchRead), page: read, acquisition:"browser", enrich:true,
        catalogs:()=>publicCatalogs(read),
      }, once);
    } finally { await browser.close(); }
    if (run) console.log(JSON.stringify(run, null, 2));
    else if (once) console.log("Another search is already running.");
    if (once) {
      if (run?.status === "failed") process.exitCode = 1;
      break;
    }
    if (!stopping)
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, 30000);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });
  } while (!stopping);
} catch (error) {
  console.error(
    "Search worker:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
} finally {
  if (pulse) clearInterval(pulse);
  if (!once)
    db.prepare(
      "UPDATE discovery_state SET heartbeat_at = NULL WHERE id = 1",
    ).run();
  db.close();
}

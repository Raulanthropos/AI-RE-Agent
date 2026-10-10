import { openDatabase } from "./db/database.js";
import { runImport } from "./ingestion/run.js";
import type { ListingObservation } from "./ingestion/types.js";
const db=openDatabase();
try {
  const rows=db.prepare("SELECT payload FROM observations WHERE json_extract(payload,'$.discovery') IS NOT NULL").all()
    .map(x=>JSON.parse(x.payload as string) as ListingObservation);
  const ids=[...new Set(rows.map(x=>x.sourceId))];
  const result=await runImport(db,ids.map(id=>({id,name:rows.find(x=>x.sourceId===id)!.sourceName,fetchListings:async()=>rows.filter(x=>x.sourceId===id)})),{enrich:true});
  console.log(JSON.stringify(result,null,2));
} finally { db.close(); }

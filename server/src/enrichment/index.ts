import type { DatabaseSync } from "node:sqlite";
import type { ListingObservation } from "../ingestion/types.js";
import { localPlaces, locateArea, romanizePlace } from "./places.js";
import { translateTexts, translationEngine, type TranslateBatch } from "./translate.js";

/** Presentation enrichment never supplies facts to the scorer or changes the source observation date. */
export async function enrichObservations(db:DatabaseSync, rows:ListingObservation[], translate?:TranslateBatch) {
  const real=rows.filter(x=>x.discovery);
  const places=localPlaces();
  for(const row of real) row.areaLocation=locateArea(row,places);
  const texts=real.flatMap(p=>[p.title,p.description,p.city,p.neighborhood,p.region,
    ...(p.sourceDetails??[]).map(d=>d.value),...(p.discovery?.evidence??[]).flatMap(e=>[e.value,e.excerpt])]);
  let translated:Map<string,string>;
  try {translated=await translateTexts(db,texts,translate);}
  catch(error){console.error("English enrichment:",error instanceof Error?error.message:"Unavailable");return rows;}
  const t=(text:string)=>translated.get(text)??text;
  for(const p of real){
    p.english={title:t(p.title),description:t(p.description),city:romanizePlace(p.city),neighborhood:p.areaLocation?.label.split(", ")[0]??romanizePlace(p.neighborhood),region:p.areaLocation?.label.split(", ").slice(1).join(", ")||romanizePlace(p.region),
      sourceDetails:(p.sourceDetails??[]).map(d=>({...d,value:t(d.value)})),
      evidence:(p.discovery?.evidence??[]).map(e=>({...e,value:t(e.value),excerpt:t(e.excerpt)})),
      engine:translationEngine,translatedAt:new Date().toISOString()};
  }
  return rows;
}

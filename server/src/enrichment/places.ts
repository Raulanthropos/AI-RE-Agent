import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { serverDirectory } from "../config.js";
import type { AreaLocation, PropertyDetails } from "@ai-re-agent/contracts";

const greek: Record<string, string> = { α:"a",β:"v",γ:"g",δ:"d",ε:"e",ζ:"z",η:"i",θ:"th",ι:"i",κ:"k",λ:"l",μ:"m",ν:"n",ξ:"x",ο:"o",π:"p",ρ:"r",σ:"s",ς:"s",τ:"t",υ:"y",φ:"f",χ:"ch",ψ:"ps",ω:"o" };
export const placeKey = (value: string) => value.normalize("NFD").replace(/\p{M}/gu,"").toLowerCase()
  .replace(/^(?:ν\.\s*|νομο[σς]\s+|περιφερειακη ενοτητα\s+|περιφερεια\s+|nomos\s+|perifereiaki enotita\s+)/u,"")
  .replace(/ου/g,"ou").replace(/[α-ω]/g,c=>greek[c] ?? c).replace(/[^a-z0-9]/g,"");
export function romanizePlace(value: string) {
  return value.replace(/^[Νν]\.\s*/, "Regional Unit ").normalize("NFD").replace(/\p{M}/gu,"").replace(/ου/g,"ou").replace(/Ου/g,"Ou").replace(/[Α-Ωα-ω]/g,c=>{const x=greek[c.toLowerCase()]??c;return c===c.toUpperCase()?x[0]!.toUpperCase()+x.slice(1):x;});
}
interface Place { id: string; name: string; keys: string[]; lat: number; lon: number; kind: string; codes: string[]; }
export function parsePlaces(text: string): Place[] {
  return text.split("\n").flatMap(line => {
    const x=line.split("\t");
    if(x[8]!=="GR" || !["P","A"].includes(x[6]??"")) return [];
    return [{id:x[0]!,name:x[2]!,keys:[...new Set([x[1]!,x[2]!,...(x[3]??"").split(",")].filter(Boolean).map(placeKey))],
      lat:Number(x[4]),lon:Number(x[5]),kind:x[7]!,codes:x.slice(10,14)}];
  });
}
export function locateArea(p: Pick<PropertyDetails,"city"|"neighborhood"|"region"|"countryCode">, places: Place[]): AreaLocation | undefined {
  if(p.countryCode!=="GR" || !p.region) return;
  const regionKey=placeKey(p.region);
  const regions=places.filter(x=>/^ADM[12]$/.test(x.kind) && x.keys.includes(regionKey));
  if(regions.length!==1) return;
  const region=regions[0]!;
  const matchesRegion=(x:Place)=>x.codes[0]===region.codes[0] && (region.kind==="ADM1" || x.codes[1]===region.codes[1]);
  const populated=places.filter(x=>/^PPL/.test(x.kind) && matchesRegion(x));
  const city=populated.filter(x=>x.keys.includes(placeKey(p.city)));
  const candidates=populated.filter(x=>x.keys.includes(placeKey(p.neighborhood)));
  let selected=candidates;
  if(candidates.length>1 && city.length===1) selected=candidates.filter(x=>x.codes[2] && x.codes[2]===city[0]!.codes[2]);
  if(!selected.length && city.length===1) selected=city;
  if(selected.length!==1) return;
  const x=selected[0]!;
  if(!Number.isFinite(x.lat)||!Number.isFinite(x.lon)) return;
  return { latitude:x.lat,longitude:x.lon,label:x.name+", "+region.name,geonameId:x.id,
    sourceUrl:"https://www.geonames.org/"+x.id+"/",kind:"settlement",
    explanation:"Village or town centre from the listing's named area. The property's exact position is unknown." };
}
let cached: Place[] | undefined;
export function localPlaces() {
  const path=resolve(serverDirectory,"data/places/GR.txt");
  if(!existsSync(path)) return [];
  return cached ??= parsePlaces(readFileSync(path,"utf8"));
}

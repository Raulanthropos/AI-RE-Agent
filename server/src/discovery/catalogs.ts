import { load } from "cheerio";
import { identifyListing } from "./sites/registry.js";
import type { SearchHit } from "./types.js";
import { parseNumber } from "./extract.js";

/** Public portal result cards. Each portal's catalog parsing is independent of detail parsing. */
export function parsePlotCatalog(html: string): SearchHit[] {
  const $=load(html);const found=new Map<string,SearchHit>();
  $("a[href]").each((_,node)=>{
    const a=$(node);let url:URL;
    try {url=new URL(a.attr("href")!,"https://www.plot.gr");}catch{return;}
    const target=identifyListing(url.href);
    if(target?.sourceId!=="plot")return;
    const text=a.text().replace(/\s+/g," ").trim();
    if(!text || !/πώληση|for sale/iu.test(text))return;
    const asking=text.match(/([\d.,]+)\s*€/u);
    if(asking && (parseNumber(asking[1]!)??0)>300000)return;
    const heading=a.find("h2,h3,h4,.title,.cls-title").first().text().trim();
    found.set(target.externalId,{url:target.url,title:heading||text.slice(0,250),snippet:text.slice(0,900)});
  });
  if(!found.size && !/δεν βρέθηκαν|καμία αγγελία|no results/i.test($("body").text()))
    throw Error("No readable sale cards in the public catalog.");
  return [...found.values()];
}
export async function* publicCatalogs(read:(url:string)=>Promise<string>) {
  const rotatingPage=2+Math.floor(Date.now()/86400000)%12;
  const catalogs=[
    ["Detached houses","https://www.plot.gr/search/?category=20034"],
    ["Detached houses, rotating page","https://www.plot.gr/search/?category=20034&pg="+rotatingPage],
    ["Farms and ranches","https://www.plot.gr/search/?category=20028"],
    ["Land","https://www.plot.gr/search/?category=20011"],
  ];
  for(const [name,url] of catalogs) {
    try {yield {name:"Plot.gr "+name,hits:parsePlotCatalog(await read(url!))};}
    catch(error) {yield {name:"Plot.gr "+name,hits:[],error:error instanceof Error?error.message:"Catalog unavailable"};
      if(error instanceof Error && /HTTP (401|403|429)|human check|robots/i.test(error.message)) break;
    }
  }
}

import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { serverDirectory } from "../config.js";

export const translationEngine = "Argos el-en 1.9 / CTranslate2 4.8.2";
const hasGreek=(s:string)=>/[\u0370-\u03ff\u1f00-\u1fff]/u.test(s);
const glossary: Record<string,string> = {
  "Μονοκατοικία":"Detached house", "Αυτόνομη θέρμανση":"Independent heating", "Πετρέλαιο, Ξύλα":"Oil, wood",
  "Πετρέλαιο":"Oil", "Ξύλα":"Wood", "Δ":"D", "Α":"A", "Β":"B", "Γ":"C", "Ε":"E", "Ζ":"F", "Η":"G",
};
export const translationKey = (text: string) => createHash("sha256").update(translationEngine+"\0v1\0"+text).digest("hex");
export type TranslateBatch = (texts: string[]) => Promise<string[]>;
export async function localTranslate(texts: string[]): Promise<string[]> {
  const python=resolve(serverDirectory,"data/translation/venv",process.platform==="win32"?"Scripts/python.exe":"bin/python");
  if(!existsSync(python)||!existsSync(resolve(serverDirectory,"data/translation/installed.json"))) throw Error("Run npm run setup:local-data to install local translation.");
  return new Promise((resolveResult,reject)=>{
    const child=spawn(python,[resolve(serverDirectory,"scripts/translate.py")], {windowsHide:true,stdio:["pipe","pipe","pipe"],env:{...process.env,PYTHONUTF8:"1"}});
    let output="",error="";
    const timer=setTimeout(()=>{child.kill();reject(Error("Local translation timed out."));},180000);
    child.stdout.on("data",chunk=>{output+=String(chunk);if(output.length>4_000_000){child.kill();}});
    child.stderr.on("data",chunk=>{error=(error+String(chunk)).slice(-500);});
    child.on("error",e=>{clearTimeout(timer);reject(e);});
    child.on("close",code=>{
      clearTimeout(timer);
      if(code!==0){reject(Error("Local translation failed. "+error));return;}
      try{
        const result=JSON.parse(output);
        if(!Array.isArray(result)||result.length!==texts.length||result.some(x=>typeof x!=="string"||x.length>20000))throw Error("Invalid translation response.");
        resolveResult(result.map((x:string)=>x.replace(/▁/g," ").replace(/\s+/g," ").trim()));
      }catch(e){reject(e);}
    });
    child.stdin.on("error",()=>{});
    child.stdin.end(JSON.stringify(texts));
  });
}
export async function translateTexts(db: DatabaseSync, texts: string[], translate: TranslateBatch = localTranslate): Promise<Map<string,string>> {
  db.exec("CREATE TABLE IF NOT EXISTS translation_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL) STRICT");
  const result=new Map<string,string>();
  const missing:string[]=[];
  const read=db.prepare("SELECT value FROM translation_cache WHERE key = ?");
  for(const text of new Set(texts)){
    if(!hasGreek(text)){result.set(text,text);continue;}
    if(glossary[text]){result.set(text,glossary[text]!);continue;}
    const stored=read.get(translationKey(text));
    if(stored) result.set(text,stored.value as string);
    else missing.push(text);
  }
  const save=db.prepare("INSERT OR REPLACE INTO translation_cache (key,value) VALUES (?,?)");
  for(let i=0;i<missing.length;i+=400){
    const batch=missing.slice(i,i+400);
    const translated=await translate(batch.map(x=>x.replace(/(^|,\s*)[Νν]\.\s*/g,"$1Περιφερειακή Ενότητα ")));
    for(let j=0;j<batch.length;j++){
      if(!translated[j]?.trim())throw Error("Local translator returned an empty result.");
      result.set(batch[j]!,translated[j]!);save.run(translationKey(batch[j]!),translated[j]!);
    }
  }
  return result;
}

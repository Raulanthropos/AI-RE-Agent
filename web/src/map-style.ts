import type { StyleSpecification } from "maplibre-gl";
/** English names where available, otherwise the source's Latin transliteration. */
export function englishMapStyle(style: StyleSpecification): StyleSpecification {
  return {...style,layers:style.layers.map(layer=>{
    if(layer.type!=="symbol" || !layer.layout?.["text-field"] || !JSON.stringify(layer.layout["text-field"]).includes("name")) return layer;
    return {...layer,layout:{...layer.layout,"text-field":["coalesce",["get","name_en"],["get","name:en"],["get","name:latin"],["get","name"]]}};
  })};
}

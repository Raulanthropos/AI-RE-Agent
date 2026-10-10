import type { ExpressionSpecification, StyleSpecification } from "maplibre-gl";

const greekLetters: Record<string, string> = {
  α: "a",
  β: "v",
  γ: "g",
  δ: "d",
  ε: "e",
  ζ: "z",
  η: "i",
  θ: "th",
  ι: "i",
  κ: "k",
  λ: "l",
  μ: "m",
  ν: "n",
  ξ: "x",
  ο: "o",
  π: "p",
  ρ: "r",
  σ: "s",
  ς: "s",
  τ: "t",
  υ: "y",
  φ: "f",
  χ: "ch",
  ψ: "ps",
  ω: "o",
  ά: "a",
  έ: "e",
  ή: "i",
  ί: "i",
  ό: "o",
  ύ: "y",
  ώ: "o",
  ϊ: "i",
  ϋ: "y",
  ΐ: "i",
  ΰ: "y",
};

// Some source features put Greek text in name:latin or have only name. MapLibre
// evaluates these standard string expressions in its worker, so they also get
// a readable Latin label without paid translation or rewriting vector tiles.
const replacements = new Map<string, string>([
  ["ου", "ou"],
  ["ού", "ou"],
  ["Ου", "Ou"],
  ["Ού", "Ou"],
  ["ΟΥ", "OU"],
  ["ΟΎ", "OU"],
  ...Object.entries(greekLetters).flatMap(
    ([letter, latin]): [string, string][] => [
      [letter, latin],
      [letter.toUpperCase(), latin[0]!.toUpperCase() + latin.slice(1)],
    ],
  ),
]);
let englishName: ExpressionSpecification = ["coalesce", ["get", "name"], ""];
for (const key of ["name:latin", "name:en", "name_en"]) {
  englishName = [
    "case",
    ["!=", ["coalesce", ["get", key], ""], ""],
    ["get", key],
    englishName,
  ];
}
for (const [letter, latin] of replacements) {
  englishName = ["join", ["split", englishName, letter], latin];
}

/** English names where available, otherwise the source's Latin transliteration. */
export function englishMapStyle(style: StyleSpecification): StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      if (
        layer.type !== "symbol" ||
        !layer.layout?.["text-field"] ||
        !JSON.stringify(layer.layout["text-field"]).includes("name")
      )
        return layer;
      return {
        ...layer,
        layout: {
          ...layer.layout,
          "text-field": englishName,
        },
      };
    }),
  };
}

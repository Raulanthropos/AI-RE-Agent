import { load } from "cheerio";
import { identifyListing } from "./sites/registry.js";
import type { SearchHit } from "./types.js";
import { parseNumber } from "./extract.js";
import { sourcePhotos } from "./photos.js";

const clean = (text: string) => text.replace(/\s+/g, " ").trim();

/** Read only facts attached to a result card, never the surrounding page or scripts. */
export function parsePlotCatalog(
  html: string,
  sourceUrl = "https://www.plot.gr/search/?category=20034",
): SearchHit[] {
  const $ = load(html);
  const found = new Map<string, SearchHit>();
  let readableCards = 0;
  $("a[href]").each((_, node) => {
    const card = $(node);
    let url: URL;
    try {
      url = new URL(card.attr("href")!, "https://www.plot.gr");
    } catch {
      return;
    }
    const target = identifyListing(url.href);
    if (target?.sourceId !== "plot") return;
    const heading = clean(
      card.find("h2,h3,h4,.title,.cls-title").first().text(),
    );
    // A repeated footer or related link must not replace a richer listing card.
    if (!heading || !/πώληση|for sale/iu.test(heading)) return;
    readableCards++;
    const price = clean(card.find(".current-price").first().text());
    const asking = price.match(/([\d.,]+)\s*€/u);
    if (asking && (parseNumber(asking[1]!) ?? 0) > 300000) return;
    const features = clean(card.find(".key-features").first().text());
    const locationText = clean(card.find(".loc").first().text());
    const parts = locationText.split("»").map(clean).filter(Boolean);
    // A named municipality supplies an area, never an exact property address.
    const location = parts.length
      ? {
          region: parts.length > 1 ? parts[0]! : "",
          city: parts.length > 1 ? parts[1]! : parts[0]!,
          neighborhood: parts.slice(2).join(", "),
        }
      : null;
    const images: string[] = [];
    card.find("img,source").each((_, image) => {
      const element = $(image);
      // Lazy images may expose only data-src; retain the actual observed URL.
      for (const attribute of ["data-src", "src"]) {
        const value = element.attr(attribute);
        if (value) images.push(value);
      }
      for (const attribute of ["data-srcset", "srcset"]) {
        for (const candidate of (element.attr(attribute) ?? "").split(",")) {
          const value = candidate.trim().split(/\s+/)[0];
          if (value) images.push(value);
        }
      }
    });
    const imageUrls = sourcePhotos(
      images,
      target.sourceId,
      target.externalId,
      target.url,
      heading,
    ).map((photo) => photo.url);
    const previous = found.get(target.externalId);
    found.set(target.externalId, {
      url: target.url,
      title: heading,
      snippet: [heading, price, features, locationText]
        .filter(Boolean)
        .join(" · ")
        .slice(0, 900),
      catalog: {
        sourceUrl,
        imageUrls: [
          ...new Set([...(previous?.catalog?.imageUrls ?? []), ...imageUrls]),
        ],
        location: location ?? previous?.catalog?.location ?? null,
      },
    });
  });
  if (
    !readableCards &&
    !/δεν βρέθηκαν|καμία αγγελία|no results/i.test($("body").text())
  )
    throw new Error("No readable sale cards in the public catalog.");
  return [...found.values()];
}

export async function* publicCatalogs(read: (url: string) => Promise<string>) {
  const rotatingPage = 2 + (Math.floor(Date.now() / 86400000) % 12);
  const catalogs = [
    ["Detached houses", "https://www.plot.gr/search/?category=20034"],
    [
      "Detached houses, rotating page",
      "https://www.plot.gr/search/?category=20034&pg=" + rotatingPage,
    ],
    ["Farms and ranches", "https://www.plot.gr/search/?category=20028"],
    ["Land", "https://www.plot.gr/search/?category=20011"],
  ];
  for (const [name, url] of catalogs) {
    try {
      yield {
        name: "Plot.gr " + name,
        hits: parsePlotCatalog(await read(url!), url),
      };
    } catch (error) {
      yield {
        name: "Plot.gr " + name,
        hits: [],
        error: error instanceof Error ? error.message : "Catalog unavailable",
      };
      if (
        error instanceof Error &&
        /HTTP (401|403|429)|human check|robots/i.test(error.message)
      )
        break;
    }
  }
}

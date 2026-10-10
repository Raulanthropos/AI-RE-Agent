import { load } from "cheerio";
import { website } from "./base.js";
import type { WebsiteAdapter } from "../types.js";

// Public SSR HTML: Product JSON-LD holds price/description/gallery; .spec holds the facts.
// Read data only. Never evaluate the page's Nuxt script or retain account/advertiser state.
const identity = website(
  "plot",
  "Plot.gr",
  "plot.gr",
  /^\/(\d{5,})(?:-[^/]+)?\/?$/,
);
const clean = (s: string) => s.replace(/\s+/g, " ").trim();
const fields: [string, string][] = [
  ["Κατηγορία", "Property type"],
  ["Υπνοδωμάτια", "Bedrooms"],
  ["Μπάνια", "Bathrooms"],
  ["Έτος κατασκευής", "Year built"],
  ["Σύστημα θέρμανσης", "Heating system"],
  ["Μέσο θέρμανσης", "Heating fuel"],
  ["Ενεργειακή κλάση", "Energy class"],
  ["Σαλόνια", "Living rooms"],
  ["Κουζίνες", "Kitchens"],
];
export const plot: WebsiteAdapter = {
  ...identity,
  pageFacts(html, externalId) {
    const $ = load(html);
    const specs = new Map<string, string>();
    $(".spec").each((_, element) => {
      const label = clean($(element).find(".spec-label").text())
        .replace(/:$/, "")
        .trim();
      const value = clean($(element).find(".spec-value").text());
      if (label && value && !specs.has(label)) specs.set(label, value);
    });
    const canonical =
      $('link[rel="canonical"]').attr("href") ??
      $('meta[property="og:url"]').attr("content");
    if (canonical) {
      const url = new URL(canonical);
      if (
        !["plot.gr", "www.plot.gr"].includes(url.hostname) ||
        identity.identify(url)?.externalId !== externalId
      )
        throw new Error("Plot.gr page identifies a different listing.");
    }
    if (
      specs.has("Αριθμός αγγελίας") &&
      specs.get("Αριθμός αγγελίας") !== externalId
    )
      throw new Error("Plot.gr page identifies a different listing.");
    const products: Record<string, any>[] = [];
    $('script[type="application/ld+json"]').each((_, element) => {
      try {
        const data = JSON.parse($(element).text());
        const nodes = Array.isArray(data)
          ? data
          : [data, ...(Array.isArray(data["@graph"]) ? data["@graph"] : [])];
        for (const node of nodes)
          if (node?.["@type"] === "Product") products.push(node);
      } catch {
        /* Malformed structured data is not executed. */
      }
    });
    if (products.length !== 1 || (!canonical && !specs.has("Αριθμός αγγελίας")))
      return null;
    const product = products[0]!;
    const offer = Array.isArray(product.offers)
      ? product.offers.length === 1
        ? product.offers[0]
        : {}
      : (product.offers ?? {});
    const title = clean($("h1").first().text()) || String(product.name ?? "");
    const description = clean(
      load(String(product.description ?? ""), null, false).text(),
    );
    const location = (specs.get("Περιοχή") ?? "").split("»").map(clean);
    const areaText = specs
      .get("Εμβαδόν")
      ?.match(/^([\d.,]+)\s*(?:τ\.?\s*μ\.?|m²)/i)?.[1];
    const area = areaText
      ?.replace(/([.,])(?=\d{3}(?:[.,]|$))/g, "")
      .replace(",", ".");
    const beds = specs.get("Υπνοδωμάτια")?.match(/^(\d+)(?:\s|$)/)?.[1];
    return {
      title,
      description,
      offer,
      property: {
        ...product,
        ...(area ? { floorSize: { value: area, unitCode: "MTK" } } : {}),
        ...(beds ? { numberOfBedrooms: Number(beds) } : {}),
        address: {
          addressCountry: "GR",
          addressRegion: location[0] || undefined,
          addressLocality: location[1] || undefined,
          addressNeighborhood: location.at(-1) || undefined,
        },
        sourceDetails: fields.flatMap(([key, label]) =>
          specs.has(key) ? [{ label, value: specs.get(key)! }] : [],
        ),
      },
    };
  },
};

import { load } from "cheerio";
import { website } from "./base.js";
import type { WebsiteAdapter } from "../types.js";

// This adapter reads the public page's own embedded data, never a private API.
// Keep it isolated: the NEXT_DATA structure may change independently of other portals.
export const indomio: WebsiteAdapter = {
  ...website(
    "indomio",
    "Indomio",
    "indomio.gr",
    /^\/(?:en\/)?aggelies\/(\d+)\/?$/,
  ),
  pageFacts(html, externalId) {
    const $ = load(html);
    const embedded = $("#__NEXT_DATA__").text();
    if (!embedded) return null;
    let data;
    try {
      data = JSON.parse(embedded)?.props?.pageProps?.detailData?.realEstate;
    } catch {
      return null;
    }
    if (!data) return null;
    if (String(data.id) !== externalId)
      throw new Error("Public page returned a different listing.");
    const properties = Array.isArray(data.properties) ? data.properties : [];
    if (properties.length !== 1) return null;
    const item = properties[0];
    const location = item.location ?? {};
    const description = load(String(item.description ?? ""), null, false)
      .text()
      .split(/Τηλέφωνο Επικοινωνίας:|Contact phone:/i)[0]!
      .trim();
    const size = String(item.surface ?? "").match(/^(\d+(?:[.,]\d+)?)\s*m²$/);
    const price =
      data.price?.visible === true && typeof data.price.value === "number"
        ? data.price.value
        : undefined;
    const title =
      String(data.title ?? "") +
      (data.contract === "sale"
        ? " · Πώληση"
        : data.contract === "rent"
          ? " · Ενοικίαση"
          : "");
    return {
      title,
      description,
      offer: price === undefined ? {} : { price, priceCurrency: "EUR" },
      property: {
        name: title,
        description,
        ...(size
          ? {
              floorSize: { value: size[1]!.replace(",", "."), unitCode: "MTK" },
            }
          : {}),
        numberOfBedrooms: item.bedRoomsNumber,
        address: {
          addressCountry: location.nation?.id,
          addressLocality: location.city,
          addressRegion: location.region,
          addressNeighborhood: location.macrozone ?? location.city,
        },
        geo: { latitude: location.latitude, longitude: location.longitude },
      },
    };
  },
};

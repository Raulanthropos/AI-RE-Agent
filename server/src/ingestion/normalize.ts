import { createHash } from "node:crypto";
import type { ListingObservation } from "./types.js";

const clean = (value: string): string => value.trim().replace(/\s+/g, " ");
export const normalizeText = (value: string): string =>
  clean(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("el-GR")
    .replace(/ς/g, "σ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
const cityAliases = new Set(["athens", "athina", "αθηνα", "αθηναι"]);
const nonnegative = (value: number | null): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
const coordinate = (value: number | null, limit: number) =>
  typeof value === "number" &&
  Number.isFinite(value) &&
  Math.abs(value) <= limit
    ? value
    : null;
const truth = (value: boolean | null): boolean | null =>
  typeof value === "boolean" ? value : null;

export function normalizeObservation(
  input: ListingObservation,
): ListingObservation {
  if (
    !["new", "renovated", "good", "needs-renovation", "unknown"].includes(
      input.condition,
    ) ||
    !["apartment", "house", "land"].includes(input.type) ||
    !["sale", "rent"].includes(input.transaction) ||
    typeof input.active !== "boolean" ||
    !["paved", "unpaved", "unknown"].includes(input.road) ||
    !["documents-listed", "reported", "issues-reported", "unknown"].includes(
      input.permits,
    ) ||
    !["approximate", "exact", "unknown"].includes(input.locationAccuracy)
  ) {
    throw new Error(
      "Invalid property condition, type, transaction, road, permits, location accuracy, or active flag.",
    );
  }
  const url = new URL(input.url);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error(`Invalid listing URL for ${input.externalId}`);
  if (!input.sourceId.trim() || !input.externalId.trim() || !input.title.trim())
    throw new Error("Source ID, external ID, and title are required.");
  if (!Number.isFinite(Date.parse(input.observedAt)))
    throw new Error(`Invalid observation date for ${input.externalId}`);
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith("utm_") || key === "fbclid")
      url.searchParams.delete(key);
  }
  const lat = coordinate(input.latitude, 90),
    lng = coordinate(input.longitude, 180);
  return {
    ...input,
    sourceId: clean(input.sourceId),
    externalId: clean(input.externalId),
    sourceName: clean(input.sourceName),
    title: clean(input.title),
    description: clean(input.description),
    countryCode: clean(input.countryCode).toUpperCase(),
    city: cityAliases.has(normalizeText(input.city))
      ? "Αθήνα"
      : clean(input.city),
    neighborhood: clean(input.neighborhood),
    region: clean(input.region),
    address: input.address?.trim() ? clean(input.address) : null,
    unit: input.unit?.trim() ? clean(input.unit) : null,
    floor:
      input.floor !== null && Number.isInteger(input.floor)
        ? input.floor
        : null,
    priceEur: nonnegative(input.priceEur),
    areaSqm: nonnegative(input.areaSqm),
    landSqm: nonnegative(input.landSqm),
    bedrooms:
      input.bedrooms !== null && Number.isInteger(input.bedrooms)
        ? nonnegative(input.bedrooms)
        : null,
    townMinutes: nonnegative(input.townMinutes),
    electricity: truth(input.electricity),
    mainsWater: truth(input.mainsWater),
    internet: truth(input.internet),
    features: {
      secondUnit: truth(input.features?.secondUnit),
      seaView: truth(input.features?.seaView),
      barn: truth(input.features?.barn),
      trees: truth(input.features?.trees),
      pool: truth(input.features?.pool),
      well: truth(input.features?.well),
      solar: truth(input.features?.solar),
    },
    latitude: lng !== null && lat !== null ? lat : null,
    longitude: lng !== null && lat !== null ? lng : null,
    locationAccuracy:
      lng !== null && lat !== null ? input.locationAccuracy : "unknown",
    photo:
      input.photo &&
      ["stone", "garden", "village", "olive", "cottage", "coast"].includes(
        input.photo,
      )
        ? input.photo
        : null,
    observedAt: new Date(input.observedAt).toISOString(),
    url: url.toString(),
  };
}

/** Unknown address/unit never merges across sites. Plot size avoids conflating neighboring land. */
export function propertyKey(listing: ListingObservation): string {
  const complete =
    listing.address &&
    listing.unit &&
    listing.floor !== null &&
    listing.areaSqm !== null &&
    listing.landSqm !== null &&
    listing.bedrooms !== null;
  const identity = complete
    ? [
        "property",
        listing.countryCode,
        normalizeText(listing.city),
        normalizeText(listing.address!),
        normalizeText(listing.unit!),
        listing.floor,
        listing.areaSqm,
        listing.landSqm,
        listing.bedrooms,
        listing.type,
        listing.transaction,
      ]
    : ["source", listing.sourceId, listing.externalId];
  return createHash("sha256").update(JSON.stringify(identity)).digest("hex");
}

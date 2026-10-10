import {
  isSourcePhotoUrl,
  type Feature,
  type Listing,
} from "@ai-re-agent/contracts";
import type { IconName } from "./components/Icon";

export const money = (value: number | null) =>
  value === null
    ? "Price unknown"
    : new Intl.NumberFormat("en-IE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);
export const area = (value: number | null) =>
  value === null
    ? "Unknown"
    : new Intl.NumberFormat("en-GB").format(value) + " m²";
export const score = (value: number | null) =>
  value === null ? "—" : value.toFixed(1);
export const searchable = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("el-GR")
    .replace(/ς/g, "σ");
export const featureInfo: { key: Feature; label: string; icon: IconName }[] = [
  { key: "trees", label: "Established trees", icon: "tree" },
  { key: "barn", label: "Barn / stable", icon: "home" },
  { key: "seaView", label: "Sea view", icon: "waves" },
  { key: "well", label: "Working well", icon: "waves" },
  { key: "solar", label: "Solar panels", icon: "sun" },
  { key: "secondUnit", label: "Second unit", icon: "home" },
  { key: "pool", label: "Swimming pool", icon: "waves" },
];
const photos = {
  stone: {
    file: "stone",
    author: "Lydia Griva",
    id: "32900236",
    alt: "Illustrative photograph of a stone house in a Greek village",
  },
  garden: {
    file: "garden",
    author: "kwnos Iv",
    id: "16785234",
    alt: "Illustrative photograph of a rustic house and garden",
  },
  village: {
    file: "village",
    author: "Marina Gr",
    id: "18120681",
    alt: "Illustrative photograph of stone houses on a Greek hillside",
  },
  olive: {
    file: "olive",
    author: "Petra Nesti",
    id: "33892897",
    alt: "Illustrative photograph of a Mediterranean olive grove and stone building",
  },
  cottage: {
    file: "cottage",
    author: "Demetra Ioannidou",
    id: "17882222",
    alt: "Illustrative photograph of a traditional stone facade with plants",
  },
};
export interface DisplayPhoto {
  src: string;
  alt: string;
  credit: string;
  author: string;
  kind: "source" | "illustration";
}
export function photosFor(listing: Listing): DisplayPhoto[] {
  const source = (listing.sourcePhotos ?? [])
    .filter((p) => isSourcePhotoUrl(p.url))
    .map((p) => ({
      src: p.url,
      alt: p.alt,
      credit:
        listing.sources.find((s) => s.url === p.sourceUrl)?.url ??
        listing.sources[0]!.url,
      author: listing.sources[0]?.sourceName ?? "Source listing",
      kind: "source" as const,
    }));
  if (source.length) return source;
  if (!listing.photo || listing.discovery) return [];
  const photo = photos[listing.photo === "coast" ? "village" : listing.photo];
  return [
    {
      ...photo,
      src: "/images/" + photo.file + ".jpg",
      credit: "https://www.pexels.com/photo/" + photo.id + "/",
      kind: "illustration",
    },
  ];
}
export function photoFor(listing: Listing): DisplayPhoto | null {
  return photosFor(listing)[0] ?? null;
}
export function englishListing(p: Listing): Listing {
  if (!p.english) return p;
  const { engine: _engine, translatedAt: _at, evidence, ...fields } = p.english;
  return {...p,...fields,sourcePhotos:p.sourcePhotos?.map((photo,i)=>({...photo,alt:fields.title+" — listing photograph "+(i+1)})),
    discovery:p.discovery?{...p.discovery,evidence}:undefined};
}
export function mapPosition(p: Listing) {
  if (p.latitude !== null && p.longitude !== null && p.locationAccuracy !== "unknown")
    return {latitude:p.latitude,longitude:p.longitude,areaOnly:false,label:"Location reported by source"};
  if (p.areaLocation) return {...p.areaLocation,areaOnly:true};
  return null;
}
export const statusLabel = (listing: Listing) =>
  listing.status === "eligible"
    ? "Meets essentials"
    : listing.status === "needs-checking"
      ? "Needs checking"
      : "Outside your brief";

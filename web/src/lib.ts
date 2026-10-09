import type { Feature, Listing } from "@ai-re-agent/contracts";
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
export function photoFor(listing: Listing) {
  if (!listing.photo) return null;
  const photo = photos[listing.photo === "coast" ? "village" : listing.photo];
  return {
    ...photo,
    src: "/images/" + photo.file + ".jpg",
    credit: "https://www.pexels.com/photo/" + photo.id + "/",
  };
}
export const statusLabel = (listing: Listing) =>
  listing.status === "eligible"
    ? "Meets essentials"
    : listing.status === "needs-checking"
      ? "Needs checking"
      : "Outside your brief";

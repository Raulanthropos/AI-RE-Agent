import type { WebsiteAdapter } from "../types.js";
import { spitogatos } from "./spitogatos.js";
import { spiti24 } from "./spiti24.js";
import { indomio } from "./indomio.js";
import { xe } from "./xe.js";
import { plot } from "./plot.js";

export const websites: WebsiteAdapter[] = [
  plot,
  indomio,
  spitogatos,
  xe,
  spiti24,
];
export function identifyListing(raw: string) {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:" || url.username || url.password || url.port)
      return null;
    return (
      websites
        .find(
          (s) =>
            url.hostname === s.domain || url.hostname === "www." + s.domain,
        )
        ?.identify(url) ?? null
    );
  } catch {
    return null;
  }
}

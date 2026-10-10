import { isSourcePhotoUrl, type SourcePhoto } from "@ai-re-agent/contracts";

/** Only known public listing-image paths; no arbitrary URLs, avatars, cookies or signed URLs. */
export function sourcePhotos(
  image: unknown,
  sourceId: string,
  externalId: string,
  sourceUrl: string,
  title: string,
): SourcePhoto[] {
  if (sourceId !== "plot") return [];
  const items = Array.isArray(image) ? image : image ? [image] : [];
  const seen = new Set<string>();
  const result: SourcePhoto[] = [];
  for (const item of items) {
    const value =
      typeof item === "string" ? item : (item?.contentUrl ?? item?.url);
    if (typeof value !== "string" || !isSourcePhotoUrl(value)) continue;
    const url = new URL(value);
    if (!url.pathname.startsWith("/" + externalId + "_") || seen.has(url.href))
      continue;
    seen.add(url.href);
    result.push({
      url: url.href,
      sourceUrl,
      alt: title + " — listing photograph " + (result.length + 1),
    });
    if (result.length === 12) break;
  }
  return result;
}

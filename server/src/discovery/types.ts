import type { ListingObservation } from "../ingestion/types.js";

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
}
export interface ListingTarget {
  sourceId: string;
  sourceName: string;
  externalId: string;
  url: string;
}
export interface WebsiteAdapter {
  id: string;
  name: string;
  domain: string;
  identify(url: URL): ListingTarget | null;
  pageFacts?(
    html: string,
    externalId: string,
  ): {
    title: string;
    description: string;
    property: Record<string, any>;
    offer: Record<string, any>;
  } | null;
}
export interface SearchProvider {
  name: string;
  search(query: string): Promise<SearchHit[]>;
}
export interface DiscoveryIO {
  acquisition?: "http" | "browser";
  enrich?: boolean;
  catalogs?: () => AsyncIterable<{ name: string; hits: SearchHit[]; error?: string }>;
  provider: SearchProvider;
  page(url: string): Promise<string>;
}
export interface ExtractInput {
  target: ListingTarget;
  hit: SearchHit;
  now: string;
  html?: string;
}
export type { ListingObservation };

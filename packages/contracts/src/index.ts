/** Fixed buyer requirement, shared by the server and presentation. */
export const MIN_LAND_SQM = 800;

export type Condition =
  | "new"
  | "renovated"
  | "good"
  | "needs-renovation"
  | "unknown";
export type Feature =
  | "secondUnit"
  | "seaView"
  | "barn"
  | "trees"
  | "pool"
  | "well"
  | "solar";
export type Evidence =
  | "documents-listed"
  | "reported"
  | "issues-reported"
  | "unknown";

export interface DiscoveryEvidence {
  field: string;
  value: string;
  excerpt: string;
}
export interface DiscoveryDetails {
  acquisition?: "http" | "browser" | "saved-page";
  basis: "search" | "catalog" | "page";
  observedAt: string;
  lastSeenAt: string;
  lastAttemptAt: string | null;
  pageStatus: "read" | "unavailable" | "not-requested";
  message: string;
  evidence: DiscoveryEvidence[];
}
export interface SearchRun {
  id: number;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "complete" | "partial" | "failed" | "interrupted";
  queries: number;
  found: number;
  imported: number;
  pagesRead: number;
  issues: string[];
}
export interface SearchStatus {
  intervalHours: number;
  nextRunAt: string | null;
  workerRunning: boolean;
  latestRun: SearchRun | null;
  sources: { name: string; domain: string }[];
}
export type Collection = "live" | "demo" | "all";
export interface SourcePhoto {
  url: string;
  sourceUrl: string;
  alt: string;
}
export interface SourceDetail {
  label: string;
  value: string;
}
/** Public image hosts and paths observed in supported source pages. */
export function isSourcePhotoUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      ["static-cz.car.gr", "static.plot.gr"].includes(url.hostname) &&
      !url.port &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/\d+_[A-Za-z0-9]+_[a-z]+\.(?:jpe?g|png|webp)$/.test(url.pathname)
    );
  } catch {
    return false;
  }
}
export interface AreaLocation {
  latitude: number;
  longitude: number;
  label: string;
  geonameId: string;
  sourceUrl: string;
  kind: "settlement";
  explanation: string;
}
export interface EnglishListingText {
  title: string;
  description: string;
  city: string;
  neighborhood: string;
  region: string;
  sourceDetails: SourceDetail[];
  evidence: DiscoveryEvidence[];
  engine: string;
  translatedAt: string;
}
export interface WildfireAssessment {
  status: "available" | "unavailable" | "no-location" | "not-applicable";
  provider: string;
  dataset: string;
  modelYear: number;
  resolutionKm: number;
  sourceUrl: string;
  methodologyUrl: string;
  licenseUrl: string;
  dailyForecastUrl: string;
  attribution: string;
  checkedAt: string | null;
  stale: boolean;
  location: {
    label: string;
    accuracy: "exact" | "approximate" | "settlement";
    latitude: number;
    longitude: number;
  } | null;
  riskClass: "high" | "intermediate" | "low" | "mixed" | null;
  classShares: { high: number; intermediate: number; low: number } | null;
  message: string;
}

export interface PropertyDetails {
  english?: EnglishListingText;
  areaLocation?: AreaLocation;
  sourcePhotos?: SourcePhoto[];
  sourceDetails?: SourceDetail[];
  discovery?: DiscoveryDetails;
  title: string;
  description: string;
  countryCode: string;
  city: string;
  neighborhood: string;
  region: string;
  address: string | null;
  unit: string | null;
  floor: number | null;
  type: "apartment" | "house" | "land";
  transaction: "sale" | "rent";
  active: boolean;
  priceEur: number | null;
  areaSqm: number | null;
  landSqm: number | null;
  bedrooms: number | null;
  condition: Condition;
  road: "paved" | "unpaved" | "unknown";
  permits: Evidence;
  electricity: boolean | null;
  mainsWater: boolean | null;
  internet: boolean | null;
  townMinutes: number | null;
  features: Record<Feature, boolean | null>;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: "approximate" | "exact" | "unknown";
  // Demo illustrations are local assets, never evidence about a property.
  photo: "stone" | "garden" | "village" | "olive" | "cottage" | "coast" | null;
}
export interface ScoreReason {
  criterion: string;
  label: string;
  points: number;
  maxPoints: number;
  /** Fixed weight supported by reported facts; unknown facts are not assessed. */
  assessedPoints: number;
  reason: string;
}
export interface Evaluation {
  eligible: boolean;
  status: "eligible" | "needs-checking" | "excluded";
  score: number | null;
  /** Percentage of the fixed 100-point policy for which facts are reported. */
  scoreCoverage: number;
  filterReasons: string[];
  missingDetails: string[];
  reasons: ScoreReason[];
}
export interface ListingSource {
  sourceId: string;
  sourceName: string;
  externalId: string;
  url: string;
  observedAt: string;
}
export interface Listing extends PropertyDetails, Evaluation {
  id: string;
  sources: ListingSource[];
  pricePerSqm: number | null;
}
export interface ListingsResponse {
  listings: Listing[];
  summary: {
    observations: number;
    properties: number;
    duplicates: number;
    eligible: number;
    needsChecking: number;
    excluded: number;
    lastImportedAt: string | null;
  };
  policy: {
    version: string;
    filters: string[];
    weights: { label: string; points: number }[];
  };
}

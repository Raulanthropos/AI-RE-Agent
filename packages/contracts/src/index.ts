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

export interface PropertyDetails {
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
  reason: string;
}
export interface Evaluation {
  eligible: boolean;
  status: "eligible" | "needs-checking" | "excluded";
  score: number | null;
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

export type Condition = 'new' | 'renovated' | 'good' | 'needs-renovation' | 'unknown';

export interface PropertyDetails {
  title: string;
  city: string;
  neighborhood: string;
  address: string | null;
  unit: string | null;
  floor: number | null;
  type: 'apartment' | 'house';
  transaction: 'sale' | 'rent';
  active: boolean;
  priceEur: number | null;
  areaSqm: number | null;
  bedrooms: number | null;
  condition: Condition;
  metroDistanceM: number | null;
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
  score: number | null;
  filterReasons: string[];
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
    excluded: number;
    lastImportedAt: string | null;
  };
  policy: {
    version: string;
    filters: string[];
    weights: { label: string; points: number }[];
  };
}

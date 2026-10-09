import type { ListingSource, PropertyDetails } from '@ai-re-agent/contracts';

/** Each site adapter maps its own source format into this contract. */
export interface ListingObservation extends PropertyDetails, ListingSource {}
export interface ListingAdapter {
  readonly id: string;
  readonly name: string;
  /** An adapter failure aborts the run before any database writes. */
  fetchListings(): Promise<ListingObservation[]>;
}

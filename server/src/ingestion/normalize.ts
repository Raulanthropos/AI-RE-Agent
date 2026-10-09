import { createHash } from 'node:crypto';
import type { ListingObservation } from './types.js';

const clean = (value: string): string => value.trim().replace(/\s+/g, ' ');
export const normalizeText = (value: string): string => clean(value).normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('el-GR').replace(/ς/g, 'σ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const cityAliases = new Set(['athens', 'athina', 'αθηνα', 'αθηναι']);
const nonnegative = (value: number | null): number | null => value !== null && Number.isFinite(value) && value >= 0 ? value : null;

export function normalizeObservation(input: ListingObservation): ListingObservation {
  if (!['new', 'renovated', 'good', 'needs-renovation', 'unknown'].includes(input.condition)
    || !['apartment', 'house'].includes(input.type)
    || !['sale', 'rent'].includes(input.transaction)
    || typeof input.active !== 'boolean') {
    throw new Error('Invalid property condition, type, transaction, or active flag.');
  }
  const url = new URL(input.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error(`Invalid listing URL for ${input.externalId}`);
  if (!input.sourceId.trim() || !input.externalId.trim() || !input.title.trim()) throw new Error('Source ID, external ID, and title are required.');
  if (!Number.isFinite(Date.parse(input.observedAt))) throw new Error(`Invalid observation date for ${input.externalId}`);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.startsWith('utm_') || key === 'fbclid') url.searchParams.delete(key);
  }
  return {
    ...input,
    sourceId: clean(input.sourceId), externalId: clean(input.externalId), sourceName: clean(input.sourceName),
    title: clean(input.title),
    city: cityAliases.has(normalizeText(input.city)) ? 'Αθήνα' : clean(input.city),
    neighborhood: clean(input.neighborhood),
    address: input.address?.trim() ? clean(input.address) : null,
    unit: input.unit?.trim() ? clean(input.unit) : null,
    floor: input.floor !== null && Number.isInteger(input.floor) ? input.floor : null,
    priceEur: nonnegative(input.priceEur), areaSqm: nonnegative(input.areaSqm),
    bedrooms: input.bedrooms !== null && Number.isInteger(input.bedrooms) ? nonnegative(input.bedrooms) : null,
    metroDistanceM: nonnegative(input.metroDistanceM),
    observedAt: new Date(input.observedAt).toISOString(), url: url.toString(),
  };
}

/** Unknown address/unit never merges across sites; matching is intentionally conservative. */
export function propertyKey(listing: ListingObservation): string {
  const complete = listing.address && listing.unit && listing.floor !== null && listing.areaSqm !== null && listing.bedrooms !== null;
  const identity = complete
    ? ['property', normalizeText(listing.city), normalizeText(listing.address!), normalizeText(listing.unit!), listing.floor, listing.areaSqm, listing.bedrooms, listing.type, listing.transaction]
    : ['source', listing.sourceId, listing.externalId];
  return createHash('sha256').update(JSON.stringify(identity)).digest('hex');
}

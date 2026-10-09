import type { Evaluation, ListingsResponse, PropertyDetails, ScoreReason } from '@ai-re-agent/contracts';

export const POLICY: ListingsResponse['policy'] = {
  version: 'athens-sale-v1',
  filters: ['Athens only', 'Active apartments for sale', 'Up to €250,000', 'At least 50 m²', 'At least 1 bedroom'],
  weights: [
    { label: 'Budget headroom', points: 30 }, { label: 'Price per m²', points: 30 },
    { label: 'Space', points: 20 }, { label: 'Condition', points: 10 }, { label: 'Metro proximity', points: 10 },
  ],
};
const clamp = (n: number): number => Math.max(0, Math.min(1, n));
const round = (n: number): number => Math.round(n * 100) / 100;
const euros = (n: number): string => `€${Math.round(n).toLocaleString('en-GB')}`;

export function evaluate(property: PropertyDetails): Evaluation {
  const filterReasons: string[] = [];
  if (property.city !== 'Αθήνα') filterReasons.push('Outside Athens.');
  if (!property.active) filterReasons.push('Listing is inactive.');
  if (property.type !== 'apartment') filterReasons.push('Property is not an apartment.');
  if (property.transaction !== 'sale') filterReasons.push('Listing is not for sale.');
  if (property.priceEur === null || !Number.isFinite(property.priceEur) || property.priceEur <= 0) filterReasons.push('A valid asking price is required.');
  else if (property.priceEur > 250_000) filterReasons.push(`Asking price ${euros(property.priceEur)} exceeds €250,000.`);
  if (property.areaSqm === null || !Number.isFinite(property.areaSqm) || property.areaSqm < 50) filterReasons.push('At least 50 m² of floor area is required.');
  if (property.bedrooms === null || !Number.isInteger(property.bedrooms) || property.bedrooms < 1) filterReasons.push('At least 1 bedroom is required.');
  if (filterReasons.length) return { eligible: false, score: null, filterReasons, reasons: [] };
  const price = property.priceEur!;
  const area = property.areaSqm!;
  const perSqm = price / area;
  const conditionPoints = { new: 10, renovated: 10, good: 7, 'needs-renovation': 2, unknown: 0 }[property.condition];
  const reasons: ScoreReason[] = [
    { criterion: 'budget', label: 'Budget headroom', points: round(30 * clamp((250_000 - price) / 150_000)), maxPoints: 30, reason: `${euros(price)} asking price; ${euros(250_000 - price)} below the cap. Full points at €100,000 or less; zero at €250,000.` },
    { criterion: 'value', label: 'Price per m²', points: round(30 * clamp((4_000 - perSqm) / 2_500)), maxPoints: 30, reason: `${euros(perSqm)}/m². Full points at €1,500/m² or less; zero at €4,000/m² or more.` },
    { criterion: 'space', label: 'Space', points: round(20 * clamp((area - 50) / 70)), maxPoints: 20, reason: `${area} m². Points increase linearly from zero at 50 m² to full points at 120 m².` },
    { criterion: 'condition', label: 'Condition', points: conditionPoints, maxPoints: 10, reason: property.condition === 'unknown' ? 'Condition is unknown; no points awarded.' : `${property.condition.replace('-', ' ')}: new/renovated = 10, good = 7, needs renovation = 2 points.` },
    { criterion: 'metro', label: 'Metro proximity', points: property.metroDistanceM === null ? 0 : round(10 * clamp((1_500 - property.metroDistanceM) / 1_500)), maxPoints: 10, reason: property.metroDistanceM === null ? 'Metro distance is unknown; no points awarded.' : `${property.metroDistanceM} m from a metro station. Full points at 0 m, falling linearly to zero at 1,500 m.` },
  ];
  return { eligible: true, score: round(reasons.reduce((sum, reason) => sum + reason.points, 0)), filterReasons: [], reasons };
}

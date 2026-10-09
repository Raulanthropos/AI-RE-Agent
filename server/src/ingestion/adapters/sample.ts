import type { PropertyDetails } from '@ai-re-agent/contracts';
import type { ListingAdapter, ListingObservation } from '../types.js';

const base: PropertyDetails = {
  title: '', city: 'Αθήνα', neighborhood: '', address: null, unit: 'A1', floor: 2,
  type: 'apartment', transaction: 'sale', active: true, priceEur: 150_000,
  areaSqm: 75, bedrooms: 2, condition: 'good', metroDistanceM: 600,
};
// Entirely fictional data, including addresses and reserved .example source URLs.
const properties: PropertyDetails[] = [
  { ...base, title: 'Sunny apartment in Kypseli', neighborhood: 'Κυψέλη', address: 'Φωκίωνος Νέγρη 24', priceEur: 135_000, areaSqm: 85, condition: 'renovated', metroDistanceM: 800 },
  { ...base, title: 'Room to grow in Patissia', neighborhood: 'Πατήσια', address: 'Πατησίων 210', priceEur: 115_000, areaSqm: 76, metroDistanceM: 350 },
  { ...base, title: 'A quiet corner of Pangrati', neighborhood: 'Παγκράτι', address: 'Φιλολάου 48', priceEur: 225_000, areaSqm: 82, condition: 'renovated', metroDistanceM: 1100 },
  { ...base, title: 'City living in Koukaki', neighborhood: 'Κουκάκι', address: 'Δράκου 18', priceEur: 245_000, areaSqm: 62, bedrooms: 1, condition: 'new', metroDistanceM: 150 },
  { ...base, title: 'Family space in Neos Kosmos', neighborhood: 'Νέος Κόσμος', address: 'Κασομούλη 32', priceEur: 185_000, areaSqm: 95, bedrooms: 3, metroDistanceM: 250 },
  { ...base, title: 'An Ampelokipoi home to make your own', neighborhood: 'Αμπελόκηποι', address: 'Πανόρμου 56', priceEur: 168_000, areaSqm: 70, condition: 'unknown', metroDistanceM: null },
  { ...base, title: 'A fresh start in Sepolia', neighborhood: 'Σεπόλια', address: 'Δυρραχίου 14', priceEur: 98_000, areaSqm: 90, condition: 'needs-renovation', metroDistanceM: 500 },
  { ...base, title: 'Kolonaki apartment above budget', neighborhood: 'Κολωνάκι', address: 'Σκουφά 40', priceEur: 320_000, areaSqm: 100, condition: 'renovated' },
  { ...base, title: 'Compact studio in Exarchia', neighborhood: 'Εξάρχεια', address: 'Στουρνάρη 20', priceEur: 95_000, areaSqm: 40, bedrooms: 0 },
  { ...base, title: 'Seaside apartment in Thessaloniki', city: 'Θεσσαλονίκη', neighborhood: 'Κέντρο', address: 'Τσιμισκή 80', priceEur: 145_000 },
  { ...base, title: 'Petralona apartment for rent', neighborhood: 'Πετράλωνα', address: 'Τρώων 30', transaction: 'rent', priceEur: 700 },
  { ...base, title: 'Previously listed in Goudi', neighborhood: 'Γουδή', address: 'Ζωγράφου 12', active: false, priceEur: 155_000 },
];

export const sampleAthens: ListingAdapter = {
  id: 'sample-athens', name: 'Athens Homes · sample',
  async fetchListings() {
    return properties.map((property, i): ListingObservation => ({
      ...property, sourceId: this.id, sourceName: this.name, externalId: `ath-${i + 1}`,
      url: `https://athens-homes.example/listings/${i + 1}?utm_source=sample`,
      observedAt: '2026-10-01T09:00:00.000Z',
    }));
  },
};
export const sampleAttica: ListingAdapter = {
  id: 'sample-attica', name: 'Attica Homes · sample',
  async fetchListings() {
    return properties.slice(0, 3).map((property, i): ListingObservation => ({
      ...property, city: 'Athens', address: property.address!.toLocaleUpperCase('el-GR'),
      priceEur: i === 0 ? 132_000 : property.priceEur,
      sourceId: this.id, sourceName: this.name, externalId: `att-${i + 101}`,
      url: `https://attica-homes.example/property/${i + 101}`,
      observedAt: '2026-10-02T09:00:00.000Z',
    }));
  },
};

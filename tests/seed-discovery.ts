// Synthetic discovery observations used only in the isolated browser-test database.
// No real network requests, accounts or user database are involved.
import { openDatabase } from "../server/src/db/database.js";
import { discover } from "../server/src/discovery/run.js";
const db = openDatabase();
db.exec(
  "DELETE FROM discovery_runs; UPDATE discovery_state SET lease_until = NULL, next_run_at = NULL",
);
const hits = [
  {
    url: "https://www.plot.gr/99999001-test-fixture",
    title: "Test fixture: house 100 m² for sale, Nafplio",
    snippet: "Plot 1200 m², €240000. Olive trees.",
  },
  {
    url: "https://www.plot.gr/99999002-test-fixture",
    title: "Test fixture: cottage 95 m² for sale",
    snippet: "Plot 1400 m², €220000.",
  },
];
await discover(
  db,
  {
    provider: {
      name: "Offline test fixture",
      search: async (query) => (query.includes("site:plot.gr") ? hits : []),
    },
    page: async (url) => {
      if (url.includes("99999001"))
        throw new Error("Source page unavailable (test fixture).");
      return (
        '<script type="application/ld+json">' +
        JSON.stringify({
          "@type": "House",
          name: hits[1]!.title,
          description: "Plot 1400 m²; paved access; mature trees.",
          offers: { price: 220000, priceCurrency: "EUR" },
          floorSize: { value: 95, unitCode: "MTK" },
          address: { addressLocality: "Nafplio", addressRegion: "Argolida" },
          geo: { latitude: 37.57, longitude: 22.8 },
          image: [
            "https://static-cz.car.gr/99999002_0_z.jpeg",
            "https://static-cz.car.gr/99999002_1_z.jpeg",
            "https://static-cz.car.gr/99999002_2_z.jpeg",
          ],
          sourceDetails: [
            { label: "Bedrooms", value: "3" },
            { label: "Year built", value: "1950" },
          ],
        }) +
        "</script>"
      );
    },
  },
  true,
);
db.close();

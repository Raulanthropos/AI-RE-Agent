import type { Page } from "@playwright/test";
import type { WildfireAssessment } from "@ai-re-agent/contracts";

// Browser tests never trigger the server's external EFFIS lookup.
export const wildfireFixture: WildfireAssessment = {
  status: "available",
  provider: "Copernicus EFFIS / European Commission JRC",
  dataset: "Pan-European wildfire risk assessment",
  modelYear: 2022,
  resolutionKm: 12.5,
  sourceUrl: "https://effis.jrc.ec.europa.eu/apps/fire.risk.viewer/",
  methodologyUrl:
    "https://forest-fire.emergency.copernicus.eu/about-effis/technical-background/wildfire-risk-assessment",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  dailyForecastUrl: "https://civilprotection.gov.gr/arxeio-imerision-xartwn",
  attribution:
    "Synthetic browser fixture based on the EFFIS response contract.",
  checkedAt: "2026-10-10T10:00:00Z",
  stale: false,
  location: {
    label: "Example village, Example region",
    accuracy: "settlement",
    latitude: 35.5,
    longitude: 25.5,
  },
  riskClass: "high",
  classShares: { high: 100, intermediate: 0, low: 0 },
  message:
    "The surrounding reference cell is predominantly in the higher-risk class.",
};

export async function mockWildfire(
  page: Page,
  overrides: Partial<WildfireAssessment> = {},
) {
  await page.route("**/api/listings/*/wildfire", (route) =>
    route.fulfill({ json: { ...wildfireFixture, ...overrides } }),
  );
}

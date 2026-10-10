import type {
  Evaluation,
  Feature,
  PropertyDetails,
  ScoreReason,
} from "@ai-re-agent/contracts";

import { MIN_LAND_SQM } from "@ai-re-agent/contracts";

export const POLICY = {
  version: "greece-land-v4",
  filters: [
    "For sale in Greece",
    "Up to €300,000",
    "Explicitly stated plot of at least 800 m²",
    "Paved access to the property",
  ],
  weights: [
    { label: "Infrastructure", points: 25 },
    { label: "Building permits", points: 20 },
    { label: "Useful extras", points: 20 },
    { label: "Close to town", points: 15 },
    { label: "Around 100 m² built", points: 10 },
    { label: "Within purchase budget", points: 10 },
  ],
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number) => Math.round(n * 100) / 100;
const known = (n: number | null): n is number =>
  n !== null && Number.isFinite(n) && n >= 0;
export const hasRequiredLand = (p: Pick<PropertyDetails, "landSqm">): boolean =>
  known(p.landSqm) && p.landSqm >= MIN_LAND_SQM;

const extras: [Feature, string, number][] = [
  ["barn", "barn / stable", 4],
  ["trees", "established trees", 4],
  ["well", "working well", 4],
  ["solar", "solar panels", 4],
  ["seaView", "sea view", 2],
  ["secondUnit", "second unit", 1],
  ["pool", "pool", 1],
];

export function evaluate(p: PropertyDetails): Evaluation {
  const filterReasons: string[] = [];
  const missingDetails: string[] = [];
  if (!p.active) filterReasons.push("This listing is no longer active.");
  if (p.transaction !== "sale")
    filterReasons.push("This property is not for sale.");
  if (p.countryCode !== "GR")
    filterReasons.push("The property is outside Greece.");
  if (!known(p.priceEur) || p.priceEur === 0)
    missingDetails.push("Confirm the asking price.");
  else if (p.priceEur > 300_000)
    filterReasons.push("The asking price exceeds €300,000.");
  if (!known(p.landSqm))
    filterReasons.push(
      "Plot size is not stated; at least 800 m² of land is required.",
    );
  else if (p.landSqm < MIN_LAND_SQM)
    filterReasons.push("The plot is smaller than 800 m².");
  if (p.road === "unpaved")
    filterReasons.push("Access includes an unpaved road.");
  else if (p.road !== "paved")
    missingDetails.push("Confirm paved access all the way to the property.");
  if (p.discovery?.basis === "search" || p.discovery?.basis === "catalog")
    missingDetails.push(
      "Search result only: confirm availability and extracted details on the source website.",
    );
  if (p.discovery?.basis === "page" && p.discovery.pageStatus === "unavailable")
    missingDetails.push(
      "Latest page refresh failed; previously reported details need reconfirming.",
    );
  if (p.discovery?.acquisition === "saved-page")
    missingDetails.push(
      "Details came from a saved page; confirm current availability.",
    );
  if (filterReasons.length)
    return {
      eligible: false,
      status: "excluded",
      score: null,
      scoreCoverage: 0,
      filterReasons,
      missingDetails,
      reasons: [],
    };

  const utilities: [boolean | null, string, number][] = [
    [p.electricity, "electricity", 10],
    [p.mainsWater, "mains water", 10],
    [p.internet, "internet", 5],
  ];
  const utilitiesText = utilities
    .map(
      ([value, label, points]) =>
        label +
        ": " +
        (value === true
          ? "reported (+" + points + ")"
          : value === false
            ? "not available (+0)"
            : "unknown (not assessed)"),
    )
    .join("; ");
  const extrasText = extras
    .map(
      ([key, label, points]) =>
        label +
        ": " +
        (p.features[key] === true
          ? "reported (+" + points + ")"
          : p.features[key] === false
            ? "reported absent (+0)"
            : "unknown (not assessed)"),
    )
    .join("; ");
  const permitsPoints =
    p.permits === "documents-listed" ? 20 : p.permits === "reported" ? 10 : 0;
  const permitsText = {
    "documents-listed":
      "Permit documents are listed as available. They still need professional review.",
    reported: "Permits are reported, but documents have not been supplied.",
    "issues-reported":
      "A permit issue is reported. Resolve it before progressing.",
    unknown: "Permit information is unknown and is not assessed.",
  }[p.permits];
  const townKnown = known(p.townMinutes);
  const areaKnown = known(p.areaSqm);
  const reasons: ScoreReason[] = [
    {
      criterion: "infrastructure",
      label: "Infrastructure",
      maxPoints: 25,
      assessedPoints: utilities.reduce(
        (sum, [value, , points]) => sum + (value !== null ? points : 0),
        0,
      ),
      points: utilities.reduce(
        (sum, [value, , points]) => sum + (value === true ? points : 0),
        0,
      ),
      reason:
        utilitiesText + ". Connections and service quality need checking.",
    },
    {
      criterion: "permits",
      label: "Building permits",
      maxPoints: 20,
      assessedPoints: p.permits === "unknown" ? 0 : 20,
      points: permitsPoints,
      reason: permitsText,
    },
    {
      criterion: "extras",
      label: "Useful extras",
      maxPoints: 20,
      assessedPoints: extras.reduce(
        (sum, [key, , points]) => sum + (p.features[key] !== null ? points : 0),
        0,
      ),
      points: extras.reduce(
        (sum, [key, , points]) => sum + (p.features[key] === true ? points : 0),
        0,
      ),
      reason: extrasText + ".",
    },
    {
      criterion: "town",
      label: "Close to town",
      maxPoints: 15,
      assessedPoints: townKnown ? 15 : 0,
      points: townKnown ? round(15 * clamp((30 - p.townMinutes!) / 20)) : 0,
      reason: townKnown
        ? p.townMinutes +
          " minutes by car, reported by the source. Full points at 10 minutes or less, decreasing to zero at 30. Not a calculated route."
        : "Driving time to town is unknown and is not assessed.",
    },
    {
      criterion: "space",
      label: "Around 100 m² built",
      maxPoints: 10,
      assessedPoints: areaKnown ? 10 : 0,
      points: areaKnown
        ? round(10 * (Math.min(p.areaSqm!, 100) / Math.max(p.areaSqm!, 100)))
        : 0,
      reason: areaKnown
        ? p.areaSqm +
          " m² built. Fit is the smaller of this area and 100 m² divided by the larger. 100 m² is optimal; larger or smaller homes remain allowed."
        : "Built area is unknown and is not assessed; this is a preference, not an exclusion.",
    },
    {
      criterion: "budget",
      label: "Within purchase budget",
      maxPoints: 10,
      assessedPoints: known(p.priceEur) && p.priceEur > 0 ? 10 : 0,
      points: known(p.priceEur) && p.priceEur > 0 ? 10 : 0,
      reason:
        known(p.priceEur) && p.priceEur > 0
          ? "The reported asking price is within the €300,000 purchase budget. Every price within that limit earns full budget fit; purchase costs are not included."
          : "The asking price is unknown and is not assessed.",
    },
  ];
  const assessedPoints = reasons.reduce((sum, r) => sum + r.assessedPoints, 0);
  const earnedPoints = reasons.reduce((sum, r) => sum + r.points, 0);
  return {
    eligible: !missingDetails.length,
    status: missingDetails.length ? "needs-checking" : "eligible",
    score: assessedPoints ? round((earnedPoints / assessedPoints) * 100) : null,
    scoreCoverage: round(assessedPoints),
    filterReasons,
    missingDetails,
    reasons,
  };
}

import type {
  Evaluation,
  Feature,
  PropertyDetails,
  ScoreReason,
} from "@ai-re-agent/contracts";

export const POLICY = {
  version: "greece-land-v2",
  filters: [
    "For sale in Greece",
    "Up to €300,000",
    "At least 1,000 m² of land",
    "Paved access to the property",
  ],
  weights: [
    { label: "Infrastructure", points: 25 },
    { label: "Building permits", points: 20 },
    { label: "Useful extras", points: 20 },
    { label: "Close to town", points: 15 },
    { label: "Around 100 m² built", points: 10 },
    { label: "Budget headroom", points: 10 },
  ],
};
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const round = (n: number) => Math.round(n * 100) / 100;
const known = (n: number | null): n is number =>
  n !== null && Number.isFinite(n) && n >= 0;
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
    missingDetails.push("Confirm the plot is at least 1,000 m².");
  else if (p.landSqm < 1_000)
    filterReasons.push("The plot is smaller than 1,000 m².");
  if (p.road === "unpaved")
    filterReasons.push("Access includes an unpaved road.");
  else if (p.road !== "paved")
    missingDetails.push("Confirm paved access all the way to the property.");
  if (filterReasons.length)
    return {
      eligible: false,
      status: "excluded",
      score: null,
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
            : "unknown (+0)"),
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
            ? "not listed (+0)"
            : "unknown (+0)"),
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
    unknown: "Permit information is unknown. No points awarded.",
  }[p.permits];
  const townKnown = known(p.townMinutes);
  const areaKnown = known(p.areaSqm);
  const reasons: ScoreReason[] = [
    {
      criterion: "infrastructure",
      label: "Infrastructure",
      maxPoints: 25,
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
      points: permitsPoints,
      reason: permitsText,
    },
    {
      criterion: "extras",
      label: "Useful extras",
      maxPoints: 20,
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
      points: townKnown ? round(15 * clamp((30 - p.townMinutes!) / 20)) : 0,
      reason: townKnown
        ? p.townMinutes +
          " minutes by car, reported by the source. Full points at 10 minutes or less, decreasing to zero at 30. Not a calculated route."
        : "Driving time to town is unknown. No points awarded.",
    },
    {
      criterion: "space",
      label: "Around 100 m² built",
      maxPoints: 10,
      points: areaKnown
        ? round(10 * clamp(1 - Math.abs(p.areaSqm! - 100) / 100))
        : 0,
      reason: areaKnown
        ? p.areaSqm +
          " m² built. Closest to 100 m² earns the most points; there is no minimum building size."
        : "Built area is unknown. No points awarded; this is a preference, not an exclusion.",
    },
    {
      criterion: "budget",
      label: "Budget headroom",
      maxPoints: 10,
      points:
        known(p.priceEur) && p.priceEur > 0
          ? round(10 * clamp((300_000 - p.priceEur) / 200_000))
          : 0,
      reason:
        known(p.priceEur) && p.priceEur > 0
          ? "Lower asking prices leave more room in the €300,000 purchase budget. Full points at €100,000 or less. Purchase costs are not included."
          : "The asking price is unknown. No points awarded.",
    },
  ];
  return {
    eligible: !missingDetails.length,
    status: missingDetails.length ? "needs-checking" : "eligible",
    score: round(reasons.reduce((sum, r) => sum + r.points, 0)),
    filterReasons,
    missingDetails,
    reasons,
  };
}

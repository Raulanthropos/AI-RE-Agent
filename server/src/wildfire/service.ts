import { load } from "cheerio";
import type { DatabaseSync } from "node:sqlite";
import type { Listing, WildfireAssessment } from "@ai-re-agent/contracts";

export const wildfireSources = {
  provider: "European Commission JRC / Copernicus EFFIS",
  dataset: "Pan-European wildfire risk assessment",
  modelYear: 2022,
  resolutionKm: 12.5,
  sourceUrl: "https://effis.jrc.ec.europa.eu/apps/fire.risk.viewer/",
  methodologyUrl:
    "https://forest-fire.emergency.copernicus.eu/about-effis/technical-background/wildfire-risk-assessment",
  licenseUrl:
    "https://forest-fire.emergency.copernicus.eu/about-effis/data-license",
  dailyForecastUrl: "https://civilprotection.gov.gr/arxeio-imerision-xartwn",
  attribution:
    "European Commission Joint Research Centre / Copernicus EFFIS, Pan-European wildfire risk assessment (2022), CC BY 4.0. Point lookup, percentage formatting and predominant-class summary by Estía.",
};
const day = 86400000;
const freshness = 30 * day;
const retryAfter = 3600000;
const layers = {
  high: "high-risk-aggr-wildfire-risk",
  intermediate: "intermediate-risk-aggr-wildfire-risk",
  low: "low-risk-aggr-wildfire-risk",
} as const;
type RiskClass = keyof typeof layers;
type RiskData = Pick<WildfireAssessment, "riskClass" | "classShares">;
type CacheRow = {
  payload: string;
  checked_at: string | null;
  attempted_at: string;
};
export type WildfireOptions = {
  read?: (url: string) => Promise<string>;
  now?: () => number;
};

export function featureInfoUrl(
  latitude: number,
  longitude: number,
  risk: RiskClass,
): string {
  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 ||
    Math.abs(longitude) > 180
  )
    throw new Error("Invalid lookup coordinates.");
  const url = new URL("https://maps.effis.emergency.copernicus.eu/effis");
  url.search = new URLSearchParams({
    map: "/mnt/nfs/mapfiles/wfra.map",
    SERVICE: "WMS",
    VERSION: "1.1.1",
    REQUEST: "GetFeatureInfo",
    LAYERS: layers[risk],
    QUERY_LAYERS: layers[risk],
    STYLES: "",
    SRS: "EPSG:4326",
    BBOX: [longitude - 0.01, latitude - 0.01, longitude + 0.01, latitude + 0.01]
      .map((x) => x.toFixed(6))
      .join(","),
    WIDTH: "101",
    HEIGHT: "101",
    X: "50",
    Y: "50",
    INFO_FORMAT: "text/html",
    FEATURE_COUNT: "1",
  }).toString();
  return url.href;
}

/** The official HTML format contains one text value; empty HTTP 200 means NoData. */
export function parsePrevalence(body: string, risk: RiskClass): number | null {
  if (Buffer.byteLength(body) > 20000)
    throw new Error("Oversized wildfire response.");
  const text = load(body).text().replace(/\s+/g, " ").trim();
  if (!text) return null;
  const title = risk[0]!.toUpperCase() + risk.slice(1);
  const prefix =
    title + " risk (aggr. wildfire risk) (Prevalence in the cell area): ";
  if (!text.startsWith(prefix))
    throw new Error("Unexpected wildfire response.");
  const raw = text.slice(prefix.length).trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(raw))
    throw new Error("Invalid wildfire value.");
  const proportion = Number(raw);
  if (!Number.isFinite(proportion) || proportion < 0 || proportion > 1)
    throw new Error("Invalid wildfire value.");
  return proportion;
}

export function summarizePrevalence(
  values: Record<RiskClass, number>,
): RiskData {
  if (
    Object.values(values).some((x) => !Number.isFinite(x) || x < 0 || x > 1) ||
    Math.abs(values.high + values.intermediate + values.low - 1) > 0.02
  )
    throw new Error("Incomplete wildfire class distribution.");
  const predominant =
    (Object.keys(layers) as RiskClass[]).find((key) => values[key] > 0.5) ??
    "mixed";
  const percent = (n: number) => Math.round(n * 1000) / 10;
  return {
    riskClass: predominant,
    classShares: {
      high: percent(values.high),
      intermediate: percent(values.intermediate),
      low: percent(values.low),
    },
  };
}

async function readRemote(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { Accept: "text/html" },
    signal: AbortSignal.timeout(12000),
    redirect: "error",
  });
  if (!response.ok) throw new Error("Wildfire service HTTP " + response.status);
  if (Number(response.headers.get("content-length") ?? 0) > 20000) {
    await response.body?.cancel();
    throw new Error("Oversized wildfire response.");
  }
  const body = await response.text();
  if (Buffer.byteLength(body) > 20000)
    throw new Error("Oversized wildfire response.");
  return body;
}

function position(listing: Listing): WildfireAssessment["location"] {
  if (
    Number.isFinite(listing.latitude) &&
    Number.isFinite(listing.longitude) &&
    listing.latitude !== null &&
    listing.longitude !== null &&
    Math.abs(listing.latitude) <= 90 &&
    Math.abs(listing.longitude) <= 180
  ) {
    return {
      latitude: listing.latitude,
      longitude: listing.longitude,
      accuracy: listing.locationAccuracy === "exact" ? "exact" : "approximate",
      label:
        [
          listing.english?.neighborhood ?? listing.neighborhood,
          listing.english?.region ?? listing.region,
        ]
          .filter(Boolean)
          .join(", ") || "Source map position",
    };
  }
  const area = listing.areaLocation;
  if (
    area &&
    Number.isFinite(area.latitude) &&
    Number.isFinite(area.longitude) &&
    Math.abs(area.latitude) <= 90 &&
    Math.abs(area.longitude) <= 180
  )
    return {
      latitude: area.latitude,
      longitude: area.longitude,
      label: area.label,
      accuracy: "settlement",
    };
  return null;
}

/** External requests use only fixed EFFIS layers, with coordinates from stored listings. */
export function wildfireService(
  db: DatabaseSync,
  options: WildfireOptions = {},
) {
  db.exec(`CREATE TABLE IF NOT EXISTS wildfire_cache (
    cache_key TEXT PRIMARY KEY,
    payload TEXT NOT NULL CHECK (json_valid(payload)),
    checked_at TEXT,
    attempted_at TEXT NOT NULL
  ) STRICT`);
  const read = options.read ?? readRemote;
  const now = options.now ?? Date.now;
  const pending = new Map<
    string,
    Promise<{ data: RiskData | null; checkedAt: string | null; stale: boolean }>
  >();

  async function lookup(latitude: number, longitude: number) {
    const key =
      "effis-wra-2022:" + latitude.toFixed(5) + "," + longitude.toFixed(5);
    const cached = db
      .prepare(
        "SELECT payload, checked_at, attempted_at FROM wildfire_cache WHERE cache_key = ?",
      )
      .get(key) as CacheRow | undefined;
    const data = cached
      ? (JSON.parse(cached.payload) as RiskData | null)
      : null;
    const stamp = now();
    const fresh =
      !!data &&
      !!cached?.checked_at &&
      stamp - Date.parse(cached.checked_at) < freshness;
    if (
      fresh ||
      (cached && stamp - Date.parse(cached.attempted_at) < retryAfter)
    )
      return {
        data,
        checkedAt: cached?.checked_at ?? cached?.attempted_at ?? null,
        stale: !!data && !fresh,
      };
    const existing = pending.get(key);
    if (existing) return existing;
    const task = (async () => {
      let result: RiskData | null = null;
      let success = false;
      try {
        const classes = Object.keys(layers) as RiskClass[];
        const responses = await Promise.all(
          classes.map(
            async (risk) =>
              [
                risk,
                parsePrevalence(
                  await read(featureInfoUrl(latitude, longitude, risk)),
                  risk,
                ),
              ] as const,
          ),
        );
        if (responses.some(([, value]) => value === null))
          throw new Error("No wildfire data at this location.");
        result = summarizePrevalence(
          Object.fromEntries(responses) as Record<RiskClass, number>,
        );
        success = true;
      } catch {
        // Missing cells, provider failure and malformed values are unknown, never low risk.
      }
      const attemptedAt = new Date(stamp).toISOString();
      const checkedAt = success ? attemptedAt : (cached?.checked_at ?? null);
      const retained = success ? result : data;
      db.prepare(
        `INSERT INTO wildfire_cache (cache_key, payload, checked_at, attempted_at)
        VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET
        payload=excluded.payload, checked_at=excluded.checked_at, attempted_at=excluded.attempted_at`,
      ).run(key, JSON.stringify(retained), checkedAt, attemptedAt);
      return {
        data: retained,
        checkedAt: checkedAt ?? attemptedAt,
        stale: !success && !!retained,
      };
    })();
    pending.set(key, task);
    try {
      return await task;
    } finally {
      pending.delete(key);
    }
  }

  return async (listing: Listing): Promise<WildfireAssessment> => {
    const base: WildfireAssessment = {
      ...wildfireSources,
      status: "unavailable",
      location: position(listing),
      checkedAt: null,
      stale: false,
      riskClass: null,
      classShares: null,
      message: "",
    };
    if (!listing.discovery)
      return {
        ...base,
        status: "not-applicable",
        message: "Sample properties do not have real wildfire assessments.",
      };
    if (!base.location)
      return {
        ...base,
        status: "no-location",
        message:
          "No usable source or area location is available. Wildfire exposure is unknown.",
      };
    const result = await lookup(
      base.location.latitude,
      base.location.longitude,
    );
    if (!result.data)
      return {
        ...base,
        checkedAt: result.checkedAt,
        message:
          "An area estimate is unavailable from EFFIS at this location. This does not indicate low risk.",
      };
    return {
      ...base,
      ...result.data,
      status: "available",
      checkedAt: result.checkedAt,
      stale: result.stale,
      message:
        (result.stale
          ? "The latest refresh failed; showing the previously retrieved estimate. "
          : "") +
        "Regional context from the 2022 model, using an approximately 12.5 km reference grid. " +
        (base.location.accuracy === "settlement"
          ? "The lookup uses the named settlement centre; the property's exact position is unknown. "
          : "The lookup uses the source's map position. ") +
        "Class percentages describe prevalence within the model cell, not the probability that this property will burn. This is not a parcel-level safety assessment or a daily fire forecast.",
    };
  };
}

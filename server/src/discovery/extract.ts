import { load } from "cheerio";
import type { DiscoveryEvidence, Feature } from "@ai-re-agent/contracts";
import type { ExtractInput, ListingObservation } from "./types.js";
import { websites } from "./sites/registry.js";
import { sourcePhotos } from "./photos.js";

const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/ς/g, "σ");
const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const numberPattern = String.raw`\d+(?:[.,]\d+)*`;
const unit = String.raw`(?:τ\.?\s*μ\.?|m[²2]|sq\.?\s*m\.?|sqm|square met(?:er|re)s)`;

/** Greek grouping and English/Greek decimals, without rounding an area into a price. */
export function parseNumber(value: string): number | null {
  let text = value.replace(/\s/g, "");
  if (!/^\d+(?:[.,]\d+)*$/.test(text)) return null;
  if (text.includes(".") && text.includes(",")) {
    const decimal = text.lastIndexOf(".") > text.lastIndexOf(",") ? "." : ",";
    text = text.replace(decimal === "." ? /,/g : /\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(?:[.,]\d{3})+$/.test(text))
    text = text.replace(/[.,]/g, "");
  else text = text.replace(",", ".");
  const valueAsNumber = Number(text);
  return Number.isFinite(valueAsNumber) && valueAsNumber >= 0
    ? valueAsNumber
    : null;
}
type ObjectValue = Record<string, any>;
function schemaNodes(value: unknown): ObjectValue[] {
  if (Array.isArray(value)) return value.flatMap(schemaNodes);
  if (!value || typeof value !== "object") return [];
  const node = value as ObjectValue;
  return [
    node,
    ...["@graph", "mainEntity", "itemOffered", "about"].flatMap((key) =>
      schemaNodes(node[key]),
    ),
  ];
}
function pageData(html: string) {
  const $ = load(html);
  if (
    $('form[action*="captcha"], #challenge-form, #cf-challenge-running')
      .length ||
    /just a moment|access denied|verify you are human/i.test($("title").text())
  )
    throw new Error("Listing website requested a human check.");
  const nodes: ObjectValue[] = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      nodes.push(...schemaNodes(JSON.parse($(element).text())));
    } catch {
      /* Not valid structured data. */
    }
  });
  const properties = nodes.filter((node) =>
    []
      .concat(node["@type"] ?? [])
      .some((type) =>
        /^(House|SingleFamilyResidence|Residence|Apartment|Product|RealEstateListing|Accommodation)$/.test(
          type,
        ),
      ),
  );
  // Multiple products generally means a search/related-listings page, not a single advertisement.
  const property =
    properties.length === 1
      ? properties[0]!
      : (properties.find((node) =>
          /^(House|SingleFamilyResidence|Residence|Apartment|Accommodation)$/.test(
            node["@type"],
          ),
        ) ?? {});
  const meta = (name: string) =>
    $('meta[property="' + name + '"],meta[name="' + name + '"]')
      .first()
      .attr("content") ?? "";
  const title =
    clean(String(property.name ?? meta("og:title") ?? "")) ||
    clean($("h1").first().text()) ||
    clean($("title").text());
  const description = clean(
    String(
      property.description ?? (meta("description") || meta("og:description")),
    ),
  );
  const offer = Array.isArray(property.offers)
    ? property.offers.length === 1
      ? property.offers[0]
      : {}
    : (property.offers ?? {});
  return { title, description, property, offer };
}
function assertion(text: string, pattern: RegExp): string | null {
  // Only explicit present-tense facts; plans, negation and questions are not evidence.
  for (const sentence of text.split(/[;!?\n]|\.(?!\d)/)) {
    const normalized = fold(sentence);
    if (
      pattern.test(normalized) &&
      !/\b(no|not|without|potential|possible|planned|could|can|optional|disconnected)\b|δεν |χωρισ |δυνατοτητα|δυνατον|μελλοντικ|κατασκευαστει|προβλεπεται|απαιτειται|χρειαζεται|αναμενεται|προκειται να|διακοπει|κομμενο ρευμα|θα (?:εχει|γινει|διαθετει|τοποθετηθει|εγκατασταθει)/.test(
        normalized,
      )
    )
      return clean(sentence).slice(0, 180);
  }
  return null;
}
export function extractListing(input: ExtractInput): ListingObservation | null {
  const page = input.html
    ? (websites
        .find((site) => site.id === input.target.sourceId)
        ?.pageFacts?.(input.html, input.target.externalId) ??
      pageData(input.html))
    : null;
  const title = page?.title || input.hit.title;
  const description = page?.description || (page ? "" : input.hit.snippet);
  const text = clean(title + " · " + description);
  const normalized = fold(text);
  const type =
    /μονοκατοικ|κατοικια|μεζονετα|detached|house|villa|cottage|maisonette/.test(
      normalized,
    )
      ? "house"
      : /διαμερισμα|apartment/.test(normalized)
        ? "apartment"
        : /οικοπεδ|αγροτεμαχ|land|plot/.test(normalized)
          ? "land"
          : null;
  const sale = /πωλησ|πωλειται|for sale|sale of|buy /.test(normalized);
  const rent = /ενοικιασ|ενοικιαζεται|for rent|to rent/.test(normalized);
  if (!type || (!sale && !rent)) return null;
  const evidence: DiscoveryEvidence[] = [];
  const record = (field: string, value: unknown, excerpt: string) => {
    evidence.push({
      field,
      value: String(value),
      excerpt: clean(excerpt).slice(0, 180),
    });
  };
  function numeric(
    field: string,
    patterns: RegExp[],
    source = text,
  ): number | null {
    for (const pattern of patterns) {
      const match = fold(source).match(pattern);
      if (!match?.[1]) continue;
      const value = parseNumber(match[1]);
      if (value !== null) {
        record(field, value, match[0]);
        return value;
      }
    }
    return null;
  }
  const pricePatterns = [
    new RegExp(
      "(" +
        numberPattern +
        String.raw`)\s*(?:€|ευρω|eur\b)(?!\s*(?:\/|ανα|per|το)\s*(?:τ|m|sq))`,
      "i",
    ),
    new RegExp(
      String.raw`(?:€|eur)\s*(` +
        numberPattern +
        String.raw`)(?!\d|[.,]\d|\s*(?:\/|ανα|per)\s*(?:τ|m|sq))`,
      "i",
    ),
  ];
  let priceEur = numeric("priceEur", pricePatterns);
  if (page?.offer.priceCurrency === "EUR" && page.offer.price !== undefined) {
    const price = Number(page.offer.price);
    if (Number.isFinite(price) && price > 0) {
      priceEur = price;
      record("priceEur", price, "Structured offer: EUR " + price);
    }
  }
  const landLabel = String.raw`(?:οικοπεδ[\p{L}]*|αγροτεμαχ[\p{L}]*|γηπεδ[\p{L}]*|plot(?: area)?|land(?: area)?)`;
  const landSqm =
    numeric("landSqm", [
      new RegExp(
        landLabel +
          String.raw`(?:\s+(?:εμβαδου|εκτασησ|επιφανειασ|συνολικησ|συνολικου|περιπου|of|area|size|total|approximately)|[ :,.-]){0,6}\s*(` +
          numberPattern +
          ")\\s*" +
          unit,
        "iu",
      ),
      new RegExp(
        "(" + numberPattern + ")\\s*" + unit + "\\s*(?:of\\s+)?" + landLabel,
        "iu",
      ),
    ]) ??
    (() => {
      const value = numeric("landSqm", [
        new RegExp(
          landLabel +
            String.raw`(?:\s+(?:εμβαδου|εκτασησ|επιφανειασ|συνολικησ|συνολικου|περιπου|of|area|size|total|approximately)|[ :,.-]){0,6}\s*(` +
            numberPattern +
            ")\\s*στρεμμ",
          "iu",
        ),
      ]);
      if (value === null) return null;
      evidence.pop();
      record("landSqm", value * 1000, "Plot area in stremmata: " + value);
      return value * 1000;
    })();
  let areaSqm =
    type === "land"
      ? null
      : numeric("areaSqm", [
          new RegExp(
            String.raw`(?:μονοκατοικια|κατοικια|μεζονετα|διαμερισμα|house|villa|apartment|built area)\s*[:,]?\s*(` +
              numberPattern +
              ")\\s*" +
              unit,
            "iu",
          ),
          new RegExp(
            String.raw`(?:εμβαδον του ακινητου ειναι|συνολικησ επιφανειασ|built area|floor area)\s*[:,]?\s*(` +
              numberPattern +
              ")\\s*" +
              unit,
            "iu",
          ),
        ]);
  const floorSize = page?.property.floorSize;
  if (
    type !== "land" &&
    floorSize &&
    /^(MTK|m2|m²|SQM)$/i.test(floorSize.unitCode ?? floorSize.unitText ?? "")
  ) {
    const value = Number(floorSize.value);
    if (Number.isFinite(value) && value >= 0) {
      areaSqm = value;
      record("areaSqm", value, "Structured floor size: " + value + " m²");
    }
  }
  const features: Record<Feature, boolean | null> = {
    secondUnit: null,
    seaView: null,
    barn: null,
    trees: null,
    pool: null,
    well: null,
    solar: null,
  };
  const featurePatterns: [Feature, RegExp][] = [
    [
      "trees",
      /δεντρ|ελαιοδεντρ|ελαιων|πορτοκαλιεσ|\b(?:mature trees|olive trees|olive grove|fruit trees)\b/,
    ],
    ["barn", /σταβλοσ|σταβλουσ|αχυρωνασ|αχυρωνα|\b(?:barn|stable|stables)\b/],
    ["pool", /πισινα|\bswimming pool\b/],
    ["seaView", /θεα (?:στη |προσ τη |στην )?θαλασσα|\bsea view\b/],
    [
      "well",
      /(?:λειτουργικ[οη]|ενεργ[οη]) (?:πηγαδι|γεωτρηση)|(?:πηγαδι|γεωτρηση) (?:σε λειτουργια|που λειτουργει)|working well/,
    ],
    ["solar", /φωτοβολταικ|\b(?:solar panels|photovoltaic)\b/],
    [
      "secondUnit",
      /ανεξαρτητ[ηο] (?:δευτερ[ηο] )?(?:κατοικια|διαμερισμα|ξενωνασ)|\b(?:separate guest house|second dwelling|independent apartment)\b/,
    ],
  ];
  for (const [key, pattern] of featurePatterns) {
    const excerpt = assertion(description, pattern);
    if (excerpt) {
      features[key] = true;
      record(key, true, excerpt);
    }
  }
  let road: ListingObservation["road"] = "unknown";
  const unpaved = assertion(
    description,
    /προσβαση.{0,25}χωματοδρομ|χωματοδρομοσ|\b(?:dirt road|unpaved access)\b/,
  );
  const paved = assertion(
    description,
    /προσβαση\s*[:,-]?\s*(?:απο |με |μεσω )?(?:ασφαλτο|ασφαλτιν)|ασφαλτοστρωμεν[ηοσ]+ (?:δρομοσ|προσβαση)|\b(?:paved access|asphalt road access)\b/,
  );
  if (unpaved) {
    road = "unpaved";
    record("road", road, unpaved);
  } else if (paved) {
    road = "paved";
    record("road", road, paved);
  }
  let permits: ListingObservation["permits"] = "unknown";
  const permit = assertion(
    description,
    /(?:διαθετει|υπαρχει|με) (?:εγκυρη )?οικοδομικη αδεια|building permit (?:issued|available)/,
  );
  if (permit) {
    permits = "reported";
    record("permits", permits, permit);
  }
  const utility = (field: string, pattern: RegExp): boolean | null => {
    const excerpt = assertion(description, pattern);
    if (!excerpt) return null;
    record(field, true, excerpt);
    return true;
  };
  const catalogLocation = input.hit.catalog?.location;
  const address =
    page?.property.address ??
    (catalogLocation
      ? {
          addressCountry: "GR",
          addressRegion: catalogLocation.region,
          addressLocality: catalogLocation.city,
          addressNeighborhood: catalogLocation.neighborhood,
        }
      : undefined);
  const location = title
    .split(/(?:για πώληση|προς πώληση|for sale)[,:]?\s*/i)[1]
    ?.replace(/\s*[|–]\s*(?:plot.gr|indomio|spitogatos|xe.gr).*$/i, "")
    .trim();
  let latitude: number | null = null,
    longitude: number | null = null;
  const geo = page?.property.geo;
  if (geo && geo.latitude !== null && geo.longitude !== null) {
    const lat = Number(geo.latitude),
      lng = Number(geo.longitude);
    if (lat >= 34 && lat <= 42 && lng >= 19 && lng <= 30) {
      latitude = lat;
      longitude = lng;
      record(
        "coordinates",
        lat + ", " + lng,
        "Coordinates reported in listing structured data; may be approximate.",
      );
    }
  }
  return {
    ...input.target,
    observedAt: input.now,
    title: title.slice(0, 250),
    description:
      description.slice(0, 2000) ||
      "No property description was available in the search result.",
    countryCode:
      typeof address?.addressCountry === "string"
        ? /^(GR|Greece|Ελλάδα)$/i.test(address.addressCountry)
          ? "GR"
          : address.addressCountry
        : typeof address?.addressCountry?.name === "string"
          ? /^(Greece|Ελλάδα)$/i.test(address.addressCountry.name)
            ? "GR"
            : address.addressCountry.name
          : "GR",
    city:
      typeof address?.addressLocality === "string"
        ? address.addressLocality
        : "Greece",
    neighborhood:
      typeof address?.addressNeighborhood === "string"
        ? address.addressNeighborhood
        : location || "Location not provided",
    region:
      typeof address?.addressRegion === "string" ? address.addressRegion : "",
    address: null,
    unit: null,
    floor: null,
    type,
    transaction: sale ? "sale" : "rent",
    active: !/SoldOut|Discontinued|OutOfStock/.test(
      String(page?.offer.availability ?? ""),
    ),
    priceEur,
    areaSqm,
    landSqm,
    bedrooms:
      Number.isInteger(page?.property.numberOfBedrooms) &&
      page!.property.numberOfBedrooms >= 0
        ? (record(
            "bedrooms",
            page!.property.numberOfBedrooms,
            "Bedrooms reported by source: " + page!.property.numberOfBedrooms,
          ),
          page!.property.numberOfBedrooms)
        : numeric("bedrooms", [/(\d+)\s*(?:υπνοδωματι|υ\/δ|bedrooms?\b)/iu]),
    condition: "unknown",
    road,
    permits,
    electricity: utility(
      "electricity",
      /συνδεδεμεν[οη].{0,20}(?:ρευμα|δικτυο δεη)|ηλεκτροδοτειται|(?:αυτονομο|ξεχωριστο|ανεξαρτητο)\s+(?:ρολοι|μετρητησ?)\s+(?:δεη|ρευματοσ)|connected to (?:mains )?electricity/,
    ),
    mainsWater: utility(
      "mainsWater",
      /συνδεδεμεν[οη].{0,20}δικτυο υδρευσησ|υδρευση\s*:\s*δικτυο|connected to (?:mains|municipal) water/,
    ),
    internet: utility(
      "internet",
      /ενεργη συνδεση (?:ιντερνετ|internet)|working (?:broadband|internet)/,
    ),
    townMinutes: numeric(
      "townMinutes",
      [
        /(\d+)\s*λεπτα\s*(?:με το αυτοκινητο|οδικωσ)\s*(?:απο|εωσ|μεχρι)\s*(?:την?\s+)?(?:πολη|κωμοπολη|κεντρο)/iu,
        /(\d+)\s*minutes?\s*(?:by car|drive)\s*(?:to|from)\s*(?:the\s+)?(?:town|city)/iu,
      ],
      description,
    ),
    features,
    latitude,
    longitude,
    locationAccuracy: latitude === null ? "unknown" : "approximate",
    photo: null,
    sourcePhotos: sourcePhotos(
      page?.property.image ?? input.hit.catalog?.imageUrls,
      input.target.sourceId,
      input.target.externalId,
      input.target.url,
      title,
    ),
    sourceDetails: Array.isArray(page?.property.sourceDetails)
      ? page.property.sourceDetails
      : [],
    discovery: {
      basis: page ? "page" : input.hit.catalog ? "catalog" : "search",
      acquisition: "http",
      observedAt: input.now,
      lastSeenAt: input.now,
      lastAttemptAt: page ? input.now : null,
      pageStatus: page ? "read" : "unavailable",
      message: page
        ? "Extracted from the listing's structured data and description; source claims need confirmation."
        : input.hit.catalog
          ? "Extracted from the portal’s search-results card. Photos and named area are reported by the source; land, availability and other missing details need confirmation on the full listing."
          : "Search result only. Availability and missing details need confirmation on the source website.",
      evidence,
    },
  };
}

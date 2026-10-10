# Listing adapters

Each adapter owns one source's fetching and field mapping. The pipeline owns normalization, deduplication, SQLite writes, filtering and scoring.

Before implementing a real site, research its supported access method, published access constraints, stable IDs, pagination, field availability, timestamps and inactive-listing behaviour. Record the findings alongside that adapter.

1. Create a separate file or directory for the site and implement `ListingAdapter`.
2. Map prices to euros, land and built areas to square metres, and reported town travel time to minutes. Never infer land area from built area.
3. Use null for missing numbers and boolean features, and unknown for unsupported enum evidence. A working well is distinct from an unspecified well; internet availability is distinct from service quality.
4. Supply source ID, external ID, the original HTTP(S) listing URL and an ISO observation timestamp. Use a trustworthy source update time when possible, otherwise fetch time. Apply source-specific timeouts and rate limits.
5. Map road surface, permits and utility claims only when supported by source data. “Documents listed” does not mean the documents were reviewed. Coordinate accuracy must be explicit. Unknown coordinates stay null.
6. Keep `photo: null` for real adapters; that enum selects demo illustrations only. Use `sourcePhotos` for original listing photographs. Plot.gr's public listing-image paths are currently supported and validated against the listing ID; new hosts require a reviewed allowlist/extractor and source attribution. Do not persist signed URLs, authentication state or downloaded images.
7. Throw on source failure or unusable payloads rather than returning a successful empty response. Do not import database code in an adapter.
8. Register in `index.ts` and test mapping, duplicates, missing fields, price changes and inactive records.

Deduplication is deliberately conservative: matching address/unit, built area AND plot area are required along with the remaining identity fields. Do not merge based only on a similar title or village centroid.

The adapters in this directory are fictional. Live discovery uses the same ingestion interface; see [the discovery worker](../../discovery/README.md) for public search, per-site parsers and current research. Historical source IDs remain stable to replace the original demo fixtures on import: `sampleAthens` now emits 12 Greece-wide properties, and `sampleAttica` emits three newer duplicates with changed capitalization and one changed price. Live access is documented separately so demo imports remain deterministic and offline.

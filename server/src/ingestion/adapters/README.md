# Listing adapters

An adapter owns one source's fetching and field mapping. The pipeline owns normalization, deduplication, SQLite writes, filtering, and scoring.

Before implementing a real source, research its supported access method, published access constraints, stable listing IDs, pagination, available fields, update timestamps, and inactive-listing behavior. Save the findings alongside that adapter. Determine which address/unit fields are reliable enough for cross-source identity.

1. Add a separate file or directory for the site.
2. Implement `ListingAdapter` from `../types.ts`.
3. Map prices to euros, areas to square metres, distances to metres, and source fields to the shared enums. Use `null` for missing numeric/address/unit fields and `unknown` for missing condition. Do not invent unknown values.
4. Supply stable `sourceId`/`externalId`, the original HTTP(S) listing URL, and an ISO `observedAt` timestamp. Use the source's update timestamp when trustworthy; otherwise use the fetch timestamp. Keep future fetches bounded with explicit timeouts and source-specific rate limits.
5. Throw on a failed source fetch or unusable source payload. The orchestrator will stop before committing; do not silently turn a source failure into a successful empty response.
6. Register the adapter in `index.ts` and test mapping with saved source fixtures, duplicates, missing fields, price updates, and inactive records.

Do not import database code in an adapter. Do not reuse a generic scraper for unrelated sites without researching their distinct formats and access methods.

Current adapters are fictional and deterministic. `sampleAthens` emits 12 properties; `sampleAttica` emits three later duplicates with changed capitalization and one changed price. No real listing websites have been implemented or researched.

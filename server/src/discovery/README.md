# Local internet discovery

This is a free, best-effort search worker, not a portal API subscription or an exhaustive market feed. It needs no account, API key, billing details, LLM or third-party scheduler. It searches the public DuckDuckGo HTML interface and reads accessible public listing pages. Page extraction is automated reading of public HTML (commonly called scraping); it is not access to a free private portal API.

## Running it

- `npm run dev` starts the API, web app and daily search worker. `npm start` does the same for a built app.
- `npm run search:once` requests an immediate cycle; an active database lease prevents overlapping imports.
- `npm run search:watch` runs just the daily worker.
- The interval is fixed at 24 hours after a completed cycle. The worker must be running and the PC awake; there is no Windows startup task or cloud job.
- Due time, a 20-minute run lease, worker heartbeat and the last 60 run reports live in SQLite. Restarts retain the due time. Interrupted leases expire; normal scheduling resumes when due. Manual runs also respect a live lease.

The database is the same ignored local SQLite file used by the server. Never commit captured pages, real listing exports or browser state. Tests use invented HTML/data and make no external search or tile requests.

## Saved-page import

Run `npm run import:page -- "private/listing.html"` with a page saved by the user. The CLI uses the file modification time as its capture time, requires canonical/og:url listing identity, and feeds the same site parser, normalizer and transactional importer as the worker. Repeated imports update the same source record; older snapshots cannot overwrite newer facts. Only selected property fields and public photo URLs enter SQLite. Raw HTML, browser state and local file paths do not enter the API or repository.

`discovery.acquisition: "saved-page"` distinguishes the snapshot from an automatic HTTP read. Prior attempt status is retained, or is `not-requested` if there was no attempt. Saved-page availability always needs checking. A failed refresh retains the snapshot facts/photos and their original evidence date. This workflow does not remove a portal HTTP 403 or guarantee unattended enrichment. Keep captures under ignored `private/` and refresh the frontend after importing.

## Pipeline and limits

`providers/duckduckgo.ts → sites/registry.ts → extract.ts / per-site pageFacts → existing ingestion/scoring → SQLite → REST`

Each cycle rotates broad Greek/English queries and the starting portal, makes up to five search requests and twelve page attempts (at most three per portal), and processes at most 60 candidates. Older known listings are also revisited, even if not in today's results. There is a minimum 2.5-second interval per host, 15-second request timeout, 2 MB response limit and three-redirect limit. Only HTTPS URLs on the fixed portal/search allowlist are fetched. Listing IDs deduplicate translated slugs and tracking URLs.

The HTTP reader checks public robots rules, observes crawl delays and stops requests to a host after 401/403/429. Unknown robots rules are treated as unavailable, not permissive. Search challenges stop the remaining search queries; there is no CAPTCHA solving, login access, proxy rotation, browser impersonation or private endpoint discovery. Run reports distinguish complete, partial, failed and interrupted runs. “Complete” means the planned bounded queries completed, not that every property was found.

Public search may block even low-volume automated requests and has no reliability guarantee. There is no guaranteed free unattended whole-market search API here. Partial results remain usable. The UI shows the last run, next due time, worker state and errors.

## Website support and research notes

Reviewed public pages on 2026-10-10:

| Adapter    | Current support                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Plot.gr    | Recognises numeric listing IDs. Dedicated parser reads Product JSON-LD for price, description and public photographs, plus `.spec` fields for bedrooms, bathrooms, construction year, heating and energy class. Validated against user-provided SSR HTML; Nuxt scripts are never executed. Public robots rules permit listing paths, but tested listing pages returned HTTP 403. This is Car.gr's property marketplace; vehicle classifieds are not queried. |
| Indomio    | Recognises /aggelies/ IDs; dedicated parser for the public page's embedded **NEXT_DATA** detailData.realEstate. Checks the ID, a single property, price visibility, description, built area, bedrooms and source location. Only these fields are selected; advertiser contacts and auth/translation tokens are not stored. Locations are always treated as approximate. Two normal public pages were readable; other URLs can return 403.                    |
| Spitogatos | URL identification plus common public metadata/JSON-LD or search snippets. No site-specific page extraction validated yet.                                                                                                                                                                                                                                                                                                                                   |
| XE         | URL identification plus common public metadata/JSON-LD or search snippets. No site-specific page extraction validated yet.                                                                                                                                                                                                                                                                                                                                   |
| Spiti24    | URL identification plus common public metadata/JSON-LD or search snippets. No site-specific page extraction validated yet.                                                                                                                                                                                                                                                                                                                                   |

Public references: [DuckDuckGo HTML robots](https://html.duckduckgo.com/robots.txt), [Plot.gr robots](https://www.plot.gr/robots.txt), [Indomio robots](https://www.indomio.gr/robots.txt). Robots rules are fetched again at runtime; these notes do not override current restrictions. No read-access credentials have been obtained for these portals. Spiti24 is the explicitly configured domain; an unrelated service called House24 has not been assumed to be the same site.

To add or improve a portal, research its public access and markup, add a separate module under `sites/`, register it, and add representative sanitized tests. The shared normalizer, scorer, database writer and React UI do not need a rewrite.

## Evidence, freshness and uncertainty

- Numeric extraction understands Greek and English decimal/grouping conventions and stremmata (1 = 1,000 m²). Plot and built area have distinct labels. €/m² is not an asking price.
- Only explicit facts earn points. “Buildable” does not establish a building permit; a solar water heater is not photovoltaic panels; a potential well is not a working well. Unknown fields stay null/unknown. Descriptions are parsed by conservative rules, so some genuine features will be missed.
- Reported town travel times are not routed; absent coordinates are not geocoded or invented. Plot.gr public listing photographs appear in cards and a mobile gallery with source links. Only HTTPS image paths on `static-cz.car.gr` matching the listing ID are accepted; avatars, credentials, query strings and arbitrary hosts are rejected. No images are downloaded into the repository; failed images show a placeholder. Other portals still use a placeholder.
- A search-only observation always needs checking. Evidence excerpts identify the fields behind the score. Dates distinguish when facts were observed, when a result was last seen and when its page was last attempted.
- A blocked refresh retains older page facts with their original evidence date and changes the listing to needs-checking. A newer snippet cannot overwrite a previously read page. Newer snippets can update earlier snippet-only records.
- Missing search results, errors and 404s do not prove a sale and never delete old listings or silently mark them sold. Availability needs confirmation; old observations are visibly labelled after seven days.
- Deduplication across portals remains conservative: incomplete addresses never merge merely because titles/coordinates look similar. Repeated listings within a portal update one record.
- No wildfire, permit legality, taste or infrastructure-quality assessment is inferred.

## API and UI

`GET /api/listings?collection=live|demo|all&status=eligible|needs-checking|excluded|all` defaults to live/eligible. Collection summaries are calculated independently.

`GET /api/search/status` returns the persisted latest run, next due date, recent worker heartbeat and portal names. It does not expose local paths, environment values, credentials or a public import endpoint.

The frontend defaults to Internet listings / Needs checking, can switch to the separate sample collection, and refreshes after a newly completed worker run. Save, sorting, filters, evidence, score reasons and map interaction use the same existing UI. Only listings with reported coordinates appear on the map.

# Local internet discovery

This is a free, best-effort search worker, not a portal API subscription or an exhaustive market feed. It needs no account, API key, billing details, LLM or third-party scheduler. It searches public DuckDuckGo HTML, reads Plot.gr's public category results, and reads accessible public listing pages. Page extraction is automated reading of public HTML (commonly called scraping); it is not access to a free private portal API.

## Running it

- `npm run dev` starts the API, web app and daily search worker. `npm start` does the same for a built app.
- `npm run search:once` requests an immediate cycle; an active database lease prevents overlapping imports.
- `npm run search:watch` runs just the daily worker.
- Windows uses installed Microsoft Edge in an isolated context. Other platforms default to Playwright Chromium; install it with `npx playwright install chromium`. `SEARCH_BROWSER_CHANNEL` selects an installed channel and `SEARCH_BROWSER_HEADLESS=true` opts into headless mode. The default browser starts minimized on Windows and never uses the user's normal profile, cookies or accounts.
- `npm run setup:local-data` uses Python to install local Greek-to-English translation and the Greek GeoNames dataset under ignored `server/data/`. Worker imports then enrich presentation automatically. `npm run enrich` updates existing records without searching or changing their source observation dates.
- The interval is fixed at 24 hours after a completed cycle. The worker must be running and the PC awake; there is no Windows startup task or cloud job.
- Due time, a 20-minute run lease, worker heartbeat and the last 60 run reports live in SQLite. Restarts retain the due time. Interrupted leases expire; normal scheduling resumes when due. Manual runs also respect a live lease.

The database is the same ignored local SQLite file used by the server. Never commit captured pages, real listing exports or browser state. Tests use invented HTML/data and make no external search or tile requests.

## Saved-page import

Run `npm run import:page -- "private/listing.html"` with a page saved by the user. The CLI uses the file modification time as its capture time, requires canonical/og:url listing identity, and feeds the same site parser, normalizer and transactional importer as the worker. Repeated imports update the same source record; older snapshots cannot overwrite newer facts. Only selected property fields and public photo URLs enter SQLite. Raw HTML, browser state and local file paths do not enter the API or repository.

`discovery.acquisition: "saved-page"` distinguishes the snapshot from an automatic HTTP/browser read. Prior attempt status is retained, or is `not-requested` if there was no attempt. Saved-page availability always needs checking. A failed refresh retains the snapshot facts/photos and their original evidence date. This workflow does not remove a portal HTTP 403 or guarantee unattended enrichment. Keep captures under ignored `private/`, run `npm run enrich` if needed for translation/location, and refresh the frontend after importing.

## Pipeline and limits

`providers/duckduckgo.ts + catalogs.ts → sites/registry.ts → extract.ts / per-site pageFacts → local presentation enrichment → existing ingestion/scoring → SQLite → REST`

Each cycle rotates broad Greek/English queries and the starting portal, makes up to five general-search requests and four Plot.gr catalog requests, and attempts at most **30 listing pages**, **24 per portal**, while processing at most **200 candidates**. Catalogs cover detached houses, a rotating detached-house page, farms/ranches and land. They continue independently when general search is unavailable. Older known listings are also revisited. These are bounded samples, not exhaustive pagination.

Requests have a minimum 2.5-second interval per host and a 2 MB HTML limit. Direct HTTP requests have a 15-second timeout and three-redirect limit. Browser navigation has a 30-second timeout and can wait up to 20 further seconds for ordinary page initialization. Main-document navigation stays on the supported HTTPS portal and preserves listing identity; browser images, fonts and media are skipped. Listing IDs deduplicate translated slugs and tracking URLs.

The shared reader checks public robots rules, observes crawl delays and stops further requests to a host during that run after 401/403/429 or a detected human check. Unknown robots rules are treated as unavailable, not permissive. Search challenges stop the remaining general-search queries. Portal pages use ordinary browser rendering with normal website JavaScript; extraction parsers do not evaluate embedded script blocks themselves. There is no CAPTCHA solving, login access, stealth modification, proxy rotation or private endpoint discovery. Run reports distinguish complete, partial, failed and interrupted runs. “Complete” means the planned bounded work completed, not that every property was found.

Public search may block even low-volume automated requests and has no reliability guarantee. There is no guaranteed free unattended whole-market search API here. Partial results remain usable. The UI shows the last run, next due time, worker state and errors.

## Website support and research notes

Reviewed public pages on 2026-10-10:

| Adapter    | Current support                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plot.gr    | Recognises numeric listing IDs. Public catalog parser reads each card's price, built-size text, named area and observed photo URLs, including lazy images and srcsets. Dedicated full-page parser reads Product JSON-LD and `.spec` fields for price, description, photos, bedrooms, bathrooms, construction year, heating and energy class. The parser does not evaluate Nuxt scripts. Ordinary Edge has returned readable public pages, but other requests still return 403 or human checks. This is Car.gr's property marketplace; vehicle classifieds are not queried. |
| Indomio    | Recognises /aggelies/ IDs; dedicated parser for the public page's embedded **NEXT_DATA** detailData.realEstate. Checks the ID, a single property, price visibility, description, built area, bedrooms and source location. Only these fields are selected; advertiser contacts and auth/translation tokens are not stored. Locations are always treated as approximate. Two normal public pages were readable; other URLs can return 403.                                                                                                                                  |
| Spitogatos | URL identification plus common public metadata/JSON-LD or search snippets. No site-specific page extraction validated yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| XE         | URL identification plus common public metadata/JSON-LD or search snippets. No site-specific page extraction validated yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Spiti24    | URL identification plus common public metadata/JSON-LD or search snippets. No site-specific page extraction validated yet.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |

Public references: [DuckDuckGo HTML robots](https://html.duckduckgo.com/robots.txt), [Plot.gr robots](https://www.plot.gr/robots.txt), [Indomio robots](https://www.indomio.gr/robots.txt). Robots rules are fetched again at runtime; these notes do not override current restrictions. No read-access credentials have been obtained for these portals. Spiti24 is the explicitly configured domain; an unrelated service called House24 has not been assumed to be the same site.

To add or improve a portal, research its public access and markup, add a separate module under `sites/`, register it, and add representative sanitized tests. The shared normalizer, scorer, database writer and React UI do not need a rewrite.

## Evidence, freshness and uncertainty

- Numeric extraction understands Greek and English decimal/grouping conventions and stremmata (1 = 1,000 m²). Plot and built area have distinct labels. €/m² is not an asking price.
- Only explicit facts earn points. “Buildable” does not establish a building permit; a solar water heater is not photovoltaic panels; a potential well is not a working well. Unknown fields stay null/unknown. Descriptions are parsed by conservative rules, so some genuine features will be missed.
- Reported town travel times are not routed. Missing property coordinates stay null. An unambiguous named settlement within its reported region can acquire a separate GeoNames `areaLocation`: a village/town centre, never an exact property pin. Ambiguous names remain unlocated.
- Plot.gr photographs from a result card or full page appear in cards and a mobile gallery with source links. Only observed HTTPS image paths on `static-cz.car.gr` or `static.plot.gr`, matching the listing ID and supported image suffix format, are accepted. Avatars, credentials, query strings and arbitrary hosts are rejected. URLs are not guessed. No images are downloaded into the repository; failed images show a placeholder. Other portals still use a placeholder.
- `discovery.basis` distinguishes `search`, `catalog` and `page`. Search-only and catalog-only observations can appear in Needs checking only when their explicitly reported land is at least 800 m² and no other hard failure applies; a photo or catalog price does not establish eligibility. Unknown land and plots below 800 m² are excluded internally and never returned for browsing. Evidence excerpts identify the fields behind the score. Dates distinguish when facts were observed, when a result was last seen and when its page was last attempted. `acquisition` distinguishes HTTP, browser and saved-page reads.
- A blocked refresh retains older page facts with their original evidence date and requires an availability check. A listing can enter Needs checking only if its retained facts meet the explicit 800 m² land requirement and have no other hard failure. A newer snippet or catalog card cannot overwrite a previously read full page. New catalog/snippet observations can update earlier incomplete records.
- The land minimum is fixed at 800 m². Missing plot information is a hard exclusion, not a request for the user to confirm a plot. Excluded source observations remain in SQLite so a later full-page read can supply missing land evidence. There is no arbitrary minimum-price filter; advertised asking prices remain source claims.
- Missing search results, errors and 404s do not prove a sale and never delete old listings or silently mark them sold. Availability needs confirmation; old observations are visibly labelled after seven days.
- Deduplication across portals remains conservative: incomplete addresses never merge merely because titles/coordinates look similar. Repeated listings within a portal update one record.
- No wildfire, permit legality, taste or infrastructure-quality assessment is inferred.

## English presentation and area lookup

`server/src/enrichment/` uses the downloaded Argos Greek-English 1.9 model with CTranslate2 locally. Translations are cached in SQLite by input text and engine version. Titles, descriptions, property details and evidence receive English presentation text; original title/description remain available in the UI. Place names use GeoNames English/ASCII names or Latin transliteration. This is a dedicated neural translation model, not an LLM or hosted translation service.

Enrichment does not change the source facts used for scoring, the observation date or the precise-coordinate fields. Translation can be imperfect; unavailable local translation leaves source text intact. GeoNames Greek place data is kept in ignored `server/data/places/` with attribution (CC BY 4.0). Missing or ambiguous regions/settlements get no area marker.

## API and UI

`GET /api/listings?collection=live|demo|all&status=eligible|needs-checking|excluded|all` defaults to live/eligible. Every status, including excluded/all, returns only properties whose land area is explicitly stated as at least 800 m². Unknown or smaller plots are retained internally for later enrichment and are unavailable in all tabs, saved views and maps. API collection summary counts apply the same land requirement; worker import reports retain internal audit counts.

`GET /api/search/status` returns the persisted latest run, next due date, recent worker heartbeat and portal names. It does not expose local paths, environment values, credentials or a public import endpoint.

The frontend defaults to **Internet listings / Matches**, can switch to the separate sample collection, and refreshes after a newly completed worker run. When no listing qualifies, it explains the essentials. Any unconfirmed leads offered for review already have explicitly stated land of at least 800 m². Needs checking shows **Unconfirmed** cards, remaining checks and provisional scores inside details; unknown plot size is excluded rather than shown with a request to confirm it. Around 100 m² built remains an ideal, not a minimum or maximum.

The map distinguishes source coordinates and approximate GeoNames area markers. OpenFreeMap labels prefer English/Latin names; its MapLibre worker is bundled locally. If the street layer is unavailable, the bundled Natural Earth Greece overview stays usable. Listings with no supported location have no pin.

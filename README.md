# AI-RE-Agent / Estía

A local TypeScript npm-workspaces monorepo for exploring Greek property listings. React + Vite talks to an Express REST API; only the server reads and writes SQLite. A daily worker discovers real listings through public web search and accessible pages, then deduplicates, filters and scores them. A separate sample importer provides fictional listings for demonstrations.

The mobile-first UI takes its visual direction from [Mindtrip on Mobbin](https://mobbin.com/screens/4dcb8696-8b17-4d0f-b2b9-c5f90500633b): rounded photo cards, a connected map, a listing sheet, quiet colours and compact navigation. Internet listings and the fictional sample collection are kept separate. The app opens on **Matches**; incomplete leads remain in **Needs checking** with an **Unconfirmed** badge. Live details carry source evidence and uncertainty. Demo photographs are illustrative. Plot.gr cards and galleries display observed original photographs from public result cards or listing pages, with links to their source; other sources show a placeholder until supported.

## Run locally

Requires Node.js 24+ and npm 10+. Tested on Windows with Node 24.11.1. Node's built-in SQLite currently prints an experimental-feature notice.

Live portal reading uses installed Microsoft Edge on Windows in a separate browser context. Other platforms use Playwright Chromium (`npx playwright install chromium`). Python 3, available as `python`, is needed for the local translation/place-data setup below.

From this directory:

```sh
npm install
npm run setup:local-data
npm run dev
```

On PowerShell use `npm.cmd` if execution policy blocks `npm.ps1`.

- Web: http://127.0.0.1:5173
- API health: http://127.0.0.1:3001/api/health
- Matches: http://127.0.0.1:3001/api/listings

The dev command builds shared contracts, initializes/imports the sample collection, and starts both apps plus the daily search worker. Stop with Ctrl+C. No environment file, API key, account, billing setup or manual Leaflet download is needed.

`setup:local-data` downloads the Greek-to-English Argos neural translation model, its Python runtime packages, and the Greek GeoNames place dataset into ignored `server/data/`. Translation then runs locally and caches results in SQLite. This is a dedicated translation model, not an LLM or a hosted translation API. If setup is skipped or fails, discovery still works, but English translations and area lookup may be unavailable. Run `npm run enrich` to enrich records already stored in SQLite, then refresh the app.

| Command                                         | Purpose                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------- |
| `npm run db:init`                               | Create the SQLite schema without importing                                |
| `npm run worker` or `npm run db:seed`           | Import samples, deduplicate and evaluate                                  |
| `npm run search:once`                           | Search public results now, enrich accessible pages, and import real leads |
| `npm run search:watch`                          | Run the daily internet-search worker on its own                           |
| `npm run setup:local-data`                      | Install local Greek-to-English translation and Greek place lookup data    |
| `npm run enrich`                                | Add English presentation text and area locations to stored live records   |
| `npm run import:page -- "private/listing.html"` | Import selected facts from a user-saved listing page                      |
| `npm run dev:server` / `npm run dev:web`        | Run one app separately                                                    |
| `npm run build`                                 | Build contracts, server and web                                           |
| `npm start`                                     | Run compiled API and Vite preview on port 4173                            |
| `npm test`                                      | Backend, persistence and HTTP integration tests                           |
| `npm run test:e2e`                              | Build and run desktop/mobile browser tests                                |

For a compiled run: `npm run build`, `npm run db:seed`, then `npm start`. Vite preview is for local inspection.

SQLite defaults to `server/data/listings.sqlite`. Optional server settings are in `server/.env.example`; relative `DATABASE_PATH` values resolve from `server/`. Worker and API must use the same database. If changing the API port, set `API_TARGET=http://127.0.0.1:<port>` in the shell running Vite.

To test on a phone on the same trusted Wi-Fi, keep the API running locally and run the web workspace with `npm run dev:web -- --host 0.0.0.0`. Open Vite's displayed network URL on the phone. The Vite proxy keeps SQLite and the API on the server side. LAN access exposes the local UI and its listings on that network.

## Internet search

Open **Internet listings** in the header. The worker searches every **24 hours while the local app is running and the PC is awake**. The search status opens a report with the last run, next due time and unavailable sources. For an immediate run: `npm run search:once`.

It combines public DuckDuckGo results with Plot.gr's public category result pages, with no account, paid API or LLM. Public portal pages are opened in ordinary Edge/Chromium automation with an isolated context: no user profile, saved login, stealth plugin or CAPTCHA solver. The browser renders the site's normal JavaScript; parsers select property fields from the resulting HTML. This page extraction is commonly called scraping. Robots rules, request pacing and host blocks still apply. Access can succeed for one page and fail on another, so this is best-effort discovery, not guaranteed market coverage.

Real records pass through the existing hard filters and fixed scorer. A snippet or public results card alone cannot establish a match, even if it includes a photo and price. Missing price, land, road, permits and utilities stay unknown. Needs checking shows the missing essentials; its detailed score is provisional. Supported photographs load directly from the source's public image host, with source attribution and an unavailable-image fallback. Photo URLs are extracted from the actual page/card, never guessed. A named location can resolve to a clearly labelled town/village centre; exact property coordinates remain unknown unless supplied by the source.

[Worker architecture, per-site support, limits and evidence rules](server/src/discovery/README.md) describe exactly what is implemented. Dedicated Plot.gr and Indomio parsers extract site-specific details; other portals use the metadata/snippet fallback. Source adapters can be improved independently.

A saved listing page can also enrich an existing record: `npm run import:page -- "private/listing.html"`. Plot.gr HTML contains price, description, photographs and visible property characteristics. The import selects these fields without executing scripts or storing the raw page. Keep captures in the ignored `private/` directory. Saved-page facts are labelled and need availability confirmation; importing a page does not resolve HTTP blocks for the automatic worker. Refresh the app after importing.

## What works

- **15 observations → 12 properties:** 7 meet essentials, 2 need checking, 3 are excluded. Three duplicates retain both source URLs. Stable demo IDs update the earlier Athens apartment fixtures on the next import.
- Greece-wide search, accent-insensitive Greek search, sorting by score/price/land, optional feature filters, and explicit eligibility tabs.
- Connected Leaflet price pins and cards; selecting a pin shows a preview, opening a card shows details, and “On map” highlights its location.
- Mobile map/list controls, a listing sheet, native accessible dialogs and a desktop split view.
- Saved places in browser localStorage, with a clear message if storage is unavailable. Only property IDs are saved; this is not account sync.
- Visible score contributions, evidence labels, all source URLs and observation dates. Refresh reloads results after a worker run.
- Local English translation for listing text and evidence, with the original title/description available in details. Translation changes presentation only; scoring uses the original extracted facts.
- Loading, empty, API retry and map fallback states.

Sample listing URLs use reserved `.example` domains and are not live advertisements. Sample photos and coordinates are illustrative. Internet listings have real source URLs; map markers distinguish source coordinates from GeoNames area locations. Wildfire exposure and visual taste are not assessed.

## Free map setup

Leaflet 1.9.4 is installed through npm and bundled locally. A ZIP in Downloads does not need to be extracted or copied into the repository.

Normal interactive browsing uses the free [OpenFreeMap](https://openfreemap.org/) Positron vector style through MapLibre inside Leaflet. Labels prefer English names, then Latin transliteration, then the source name when neither is available. OpenFreeMap, OpenMapTiles and OpenStreetMap attribution remains visible. The MapLibre worker is bundled as a local asset for both Vite development and production. There is no Google Maps dependency, API key or billing account. Remote map availability still depends on the provider and internet connection.

A bundled public-domain [Natural Earth](https://www.naturalearthdata.com/about/terms-of-use/) regional outline is shown beneath street tiles. If the street layer fails to load, its empty canvas is hidden and the map returns to a labelled Greece overview with usable pins and a limited overview zoom. The overview is not a street map. Automated tests block public OpenFreeMap and OSM requests and exercise this fallback.

Optional map style and raster tile overrides are documented in `web/.env.example`. A raster alternative requires both a tile URL and attribution, and compliance with that provider's terms. Do not add a paid provider without choosing it explicitly.

An offline [GeoNames](https://www.geonames.org/) lookup resolves unambiguous named settlements within their reported Greek region. Its **area markers** represent town/village centres, not an address, parcel or building. Ambiguous or missing areas get no pin. There is no street-address geocoder, satellite imagery, routing or calculated travel time. Sample town travel times are fictional; real times remain unknown unless explicitly reported by a source. Source coordinates retain their stated accuracy.

## API and architecture

```text
source adapters → normalization → deduplication → hard filters → fixed scoring → SQLite
                                                                               ↓
React + Leaflet ← JSON REST API ← Express (SQLite reader)
```

- `packages/contracts/src/index.ts`: shared data contracts, no database code.
- `server/src/ingestion/adapters/`: fictional sample sources.
- `server/src/discovery/`: search provider, per-site public page parsers, bounded network reader and persisted daily scheduling.
- `server/src/enrichment/`: local translation/cache and conservative GeoNames settlement lookup.
- `server/src/ingestion/normalize.ts`: normalization and conservative identity keys.
- `server/src/ingestion/run.ts`: transactional source upserts and evaluations.
- `server/src/scoring.ts`: fixed rules and explicit reasons.
- `server/src/db/database.ts`: SQLite setup.
- `web/src/components/`: map, cards, dialogs, details and icons.

`GET /api/health` returns `{ "status": "ok", "database": "sqlite" }`.

`GET /api/listings?collection=live|demo|all&status=eligible|needs-checking|excluded|all` returns listings, collection-specific import summary and the fixed policy. Defaults are `live` and `eligible`. `GET /api/search/status` returns the latest search report and schedule. Results are sorted by descending score, ascending price, then stable ID. Invalid status values return 400; unknown endpoints return JSON 404; an empty database returns 200 with an empty array.

There is no web-triggered import endpoint. The UI refreshes after a new search completes; its refresh button reloads SQLite results without issuing external searches.

## Fixed criteria and scoring

Essentials: active, for sale in Greece, positive asking price ≤ €300,000, land ≥ 1,000 m², and paved access. Known failures are excluded and have no score. Unknown price, land size or access surface produces **needs-checking**, a provisional score, and explicit missing details.

**Around 100 m² built is a preference, not a minimum.** Smaller houses, renovations, unknown built area and land without a house are not excluded on that basis. Permit and infrastructure evidence affects ranking and is displayed for review; it is not a claim of legal verification.

| Factor              | Maximum | Fixed rule                                                                              |
| ------------------- | ------: | --------------------------------------------------------------------------------------- |
| Infrastructure      |      25 | Reported electricity 10, mains water 10, internet 5                                     |
| Building permits    |      20 | Documents listed 20; merely reported 10; unknown/issues 0                               |
| Useful extras       |      20 | Barn/stable, trees, working well, solar 4 each; sea view 2; second unit and pool 1 each |
| Close to town       |      15 | Full at ≤10 reported driving minutes, decreasing linearly to 0 at 30                    |
| Around 100 m² built |      10 | `10 × clamp(1 − abs(area − 100) / 100)`                                                 |
| Budget headroom     |      10 | `10 × clamp((300000 − price) / 200000)`                                                 |

Each factor is clamped and rounded to two decimals before summing. Unknown information earns zero points. Eligible card totals use one decimal; incomplete cards show **Unconfirmed**, with their provisional total and factor reasons available in details. Expanded factors use two decimals. A score measures fit with the brief, not probability, safety, legal status or investment quality. Purchase costs, renovation budgets, fire risk and aesthetics are not part of the score. Weights are code constants; feature filters only narrow the displayed results.

## Persistence and future sources

Each `(sourceId, externalId)` is upserted, making repeat imports idempotent. Cross-source identity requires matching country, normalized city/address/unit, floor, built area, plot area, bedroom count, type and transaction. Unknown identity fields fall back to source/external ID. This intentionally leaves uncertain duplicates separate.

Newest observations supply canonical details, with deterministic source/external-ID tie breaks. Older observations cannot overwrite newer records. Sources are retained. Source reads and validation finish before a transaction; observations and materialized scores commit together or roll back together. SQLite uses WAL and a five-second busy timeout.

Missing records in later source responses are not automatically removed or marked inactive. A future adapter must define its source lifecycle. See [the adapter guide](server/src/ingestion/adapters/README.md) before adding a website. Plot.gr and Indomio have dedicated public-page parsers; other configured portals currently rely on generic metadata or search snippets.

## Verification

Install Chromium once with `npx playwright install chromium`, or use installed Edge:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm.cmd run test:e2e
```

Tests use ports **3101 and 4174**, and an isolated `.test-data/browser.sqlite`, so ordinary dev ports remain available. Browser tests block public OpenFreeMap and OSM requests, verify the fallback map, selection, scoring, unknown-land status, sources, saved places, filters, mobile views and API recovery. Screenshots go into ignored `test-results/`.

## Public repository and private data

Keep real credentials in ignored `server/.env` or `web/.env.local`, real listing databases in ignored `server/data/`, and personal notes/exports in ignored `private/`. Commit only sanitized environment templates. All `VITE_` variables are public in browser bundles, so never put secrets in them. No map key is used.

`.gitignore` does not detect credentials embedded inside tracked source code and does not remove previously committed secrets. Review staged changes before publishing. See [asset credits](web/public/ASSET-CREDITS.md) for the demo photo and map sources.

No LLM, OpenAI API, AWS deployment, notifications or configurable weights are included.

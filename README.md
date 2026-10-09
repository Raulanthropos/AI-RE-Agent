# AI-RE-Agent

A local TypeScript monorepo with npm workspaces. **Estía**, the React UI, displays a ranked shortlist of fictional Greek properties. An independent Node worker imports and evaluates the records; Express serves the saved results from SQLite.

## Run locally

Requires **Node.js 24+** and npm 10+. Tested with Node 24.11.1 on Windows. Node 24 prints an experimental-feature notice for its built-in SQLite module.

From `AI-RE-Agent/`:

```sh
npm install
npm run dev
```

`dev` builds the shared types, initializes and imports the sample database, then starts both apps:

- UI: http://127.0.0.1:5173
- API health: http://127.0.0.1:3001/api/health
- Ranked matches: http://127.0.0.1:3001/api/listings

On PowerShell, use `npm.cmd` if execution policy blocks `npm.ps1`. Stop both apps with Ctrl+C.

Other commands:

| Command | Purpose |
| --- | --- |
| `npm run db:init` | Create/migrate SQLite without importing records |
| `npm run db:seed` or `npm run worker` | Import sample adapters, deduplicate, filter, and score |
| `npm run dev:server` | Run the API with TypeScript watch |
| `npm run dev:web` | Run Vite separately |
| `npm run build` | Build shared contracts, compile the server, type-check and bundle React |
| `npm start` | Run compiled API and local Vite preview at http://127.0.0.1:4173 |
| `npm run worker:start -w @ai-re-agent/server` | Run the compiled worker after a build |
| `npm test` | Run backend, persistence, and HTTP integration tests |
| `npm run test:e2e` | Build and run browser tests against isolated compiled apps |

For a compiled local run: `npm run build`, `npm run db:seed`, then `npm start`. Vite preview is for local inspection.

The database defaults to `server/data/listings.sqlite`. No credentials or environment file are needed. Optional `server/.env` settings are documented in `server/.env.example`. Relative `DATABASE_PATH` values resolve from `server/` in both development and compiled builds. Both the worker and API must use the same path. If changing the API port, set `API_TARGET=http://127.0.0.1:<port>` in the shell running Vite.

## Working flow

```text
sample adapters → normalization → source upserts / property deduplication
                → hard filters → fixed scoring → SQLite
                                                  ↓
React + Vite ← JSON REST API ← Express (SQLite reader)
```

Only code inside `server/` opens SQLite. `packages/contracts/` contains the shared API types, with no database or server implementation exposed to the web workspace.

```text
AI-RE-Agent/
  packages/contracts/src/index.ts   Shared DTOs
  server/src/
    ingestion/adapters/             Independently registered data sources
    ingestion/normalize.ts         Greek text, URLs, identity keys
    ingestion/run.ts               Transactional worker pipeline
    db/database.ts                 Versioned schema setup
    scoring.ts                     Fixed hard filters and scoring rules
    repository.ts                  Read saved results
    app.ts                         Express REST API
    index.ts                       API entry point
    worker.ts                      Import CLI entry point
  server/test/                     Node integration tests
  web/src/                         React UI and styles
  tests/                           Playwright browser tests
```

The sample import produces **15 source records → 12 unique properties → 7 matches and 5 exclusions**. Three properties appear in both adapters; their source links are retained. The newest source supplies the canonical property details. The sample Kypseli price therefore becomes €132,000, and its score is 77.63. Sepolia ranks first at 80.10.

All homes, addresses, and source URLs are fictional. The reserved `.example` URLs demonstrate source attribution and are not live listing pages. The UI supports neighborhood/text search, score/price sorting, exclusions, score explanations, and refresh after running the worker.

## API

`GET /api/health` returns `{ "status": "ok", "database": "sqlite" }`.

`GET /api/listings?status=eligible|excluded|all` returns:

- `listings`: property fields, all source URLs, eligibility, total score, weighted reasons, and hard-filter failures.
- `summary`: observations, properties, duplicates, matches, exclusions, and last import time.
- `policy`: the fixed scoring version, filter descriptions, and weights for display.

The default is `eligible`, ordered by descending score, then ascending price, then stable property ID. Excluded properties have `score: null`, no scoring factors, and all failed-filter reasons. Unknown status values return HTTP 400, unknown endpoints return JSON 404, and an empty database returns HTTP 200 with an empty list.

There is no web-triggered import endpoint; run the worker locally and click **Refresh**. The browser calls relative `/api` paths through the Vite development/preview proxy.

## Fixed rules

A match must be an **active apartment for sale in Athens**, with a valid positive asking price **≤ €250,000**, **≥ 50 m²**, and **≥ 1 bedroom**. Missing required numeric values are rejected. English/Greek Athens aliases normalize to `Αθήνα`.

Each factor is clamped to its allowed range. `clamp(x)` below means between 0 and 1.

| Factor | Points | Formula |
| --- | ---: | --- |
| Budget headroom | 30 | `30 × clamp((250000 − price) / 150000)` |
| Price per m² | 30 | `30 × clamp((4000 − price/area) / 2500)` |
| Space | 20 | `20 × clamp((area − 50) / 70)` |
| Condition | 10 | New/renovated: 10; good: 7; needs renovation: 2; unknown: 0 |
| Metro proximity | 10 | `10 × clamp((1500 − distance) / 1500)`; unknown: 0 |

Factors round to two decimal places **before** summing, so visible factor contributions match the stored total. The UI's compact score badge rounds to one decimal; expanded contributions show two decimals. Prices per m² shown in the UI are rounded for display; scoring uses the original ratio.

Rules and weights are code constants in `server/src/scoring.ts`, not configurable via the UI, API, environment, or database. After a future code change, update the policy version and rerun the worker to regenerate saved evaluations.

## Deduplication and persistence

- Each `(sourceId, externalId)` is upserted, so repeated imports do not grow the database.
- Cross-source identity requires the same normalized city, full address, unit, floor, exact area, bedroom count, property type, and transaction. Greek case, accents, punctuation, and repeated whitespace are normalized.
- Without a full address/unit or the other identity fields, identity falls back to the source and external ID. This intentionally leaves uncertain duplicates separate. There is no fuzzy matching, geocoding, or inferred unit identity.
- Canonical details come from the newest `observedAt`; ties break by source ID and external ID. Older observations cannot overwrite newer records from the same source.
- All source payloads are retained, even when their prices differ. The API exposes source identity, URL, and observation time.
- The worker finishes adapter reads and normalization before starting a transaction. Upserts and all materialized scores commit together; an adapter or database failure leaves the previous result intact.
- SQLite uses WAL and a five-second busy timeout so a worker and API can use the same local file. Reads use one query to obtain a consistent snapshot.
- Missing records in a later adapter response are **not automatically deleted or marked inactive**. A future real adapter must supply explicit inactive updates or implement a researched source lifecycle policy.

## Add a real listing site later

See [the adapter guide](server/src/ingestion/adapters/README.md). This version performs no network ingestion.

## Browser verification

Install a test browser once:

```sh
npx playwright install chromium
npm run test:e2e
```

Or use an installed Microsoft Edge browser in PowerShell:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'msedge'
npm.cmd run test:e2e
```

Stop local dev servers first; tests require ports 3001 and 4173. Browser tests use `.test-data/browser.sqlite`, separate from the development database. They cover ranked results, expanded explanations, duplicate links, exclusions, Greek search, sorting, refresh, mobile layout, and retry after an API failure. Screenshots are written into ignored `test-results/`.

There is no LLM, OpenAI API, AWS deployment, notification system, or configurable weighting in this version.

Technical references: [Node SQLite documentation](https://nodejs.org/docs/latest-v24.x/api/sqlite.html), [Vite documentation](https://vite.dev/guide/).

# AGENTS.md — cuanto-vale-mi-auto

npm workspaces monorepo: `shared/` (API contract) + `backend/` (Express API + valuation pipeline) + `frontend/` (React 19 + Vite). Single-service prod deploy: backend serves `frontend/dist`.

## Commands (run from repo root)

- `npm install` → `npm run dev` — backend `:3000` + frontend `:5173` concurrently. Frontend proxies `/api` → `localhost:3000` (`frontend/vite.config.ts`).
- `npm run build` — order matters: `shared` → `backend` (`tsc`) → `frontend` (`tsc && vite build`). Prod `backend/dist/index.js` serves `../../frontend/dist` if it exists.
- `npm start` — prod, same-origin on `PORT` (default 3000). Health: `GET /api/health`.
- `npm test --workspace=backend` — `vitest run` (27 tests: `pipeline.test.ts`, `scrapers.test.ts` + real HTML in `backend/fixtures/`). No frontend tests.
- `npm run format` / `format:check` — prettier (`printWidth: 120`, single quotes). CI (`.github/workflows/ci.yml`): `format:check` → `build` → backend tests.

## Types: `shared/` is the source of truth

- `shared/types.ts` owns `ValuationResponse`, `CarListing`, `CarDataSource`, `DollarStrategy`, etc. Backend re-exports via `src/types.ts`; frontend imports `import type ... from 'shared'` (type-only, erased at build).
- `shared/package.json` `exports` needs the `"types"` condition for backend `NodeNext` resolution. Build `shared` before `backend`/`frontend`, or their `tsc` fails.
- Never duplicate API types in frontend again; formatting helpers (`fmtARS`, `titleCase`) stay in `frontend/src/types.ts`.

## Backend (`backend/src/`)

- ESM + TypeScript strict + `NodeNext`: relative imports need `.js` suffix (`./config.js`). Dev via `tsx watch src/index.ts`.
- Entry: `index.ts` (helmet, rate-limit: `/api` 120/15min, `/api/valuation` 20/10min, CORS for `FRONTEND_ORIGIN` + localhost:5173) → `routes/` → `services/orchestrator.ts` (`runValuation`).
- Routes: `GET /api/valuation?brand&model&year&mileage?&version?&condition?&dollar=OFICIAL|BLUE|MEP&refresh?` (Zod-validated) · `GET /api/dollar` (oficial/blue/mep quotes) · `GET /api/brands` (hardcoded 16, duplicated in frontend `SearchForm` via `App.tsx`) · `GET /api/og?title&price?&min?&max?` (1200×630 SVG share image, no deps).
- Pipeline order in `orchestrator.ts`: exact search → broad search (if `used < MIN_COMPARABLES=8` or weight `< MIN_EFFECTIVE_WEIGHT=5`) → rescore → relax optional filters (version, then mileage). Optional filters are **soft weights, never hard gates** (`services/comparables.ts`).
- `dollar` flows `route → runValuation({dollarStrategy}) → getExchangeRate(strategy)`; cache key includes strategy. `exchangeRate` keeps a per-strategy in-memory entry with fallback chain; never silent (`fallback: true`).
- Add a source = new class implementing `CarDataSource` + one line in `scrapers/registry.ts`. Scrapers use HTTP + cheerio/JSON-LD only, no browser. Concurrency `MAX_CONCURRENT_SCRAPERS` (3) + `SCRAPE_DELAY_MS` (400); `User-Agent` rotates per request (`utils/http.ts`).
- Cache is process-local `Map` with TTL (`CACHE_TTL_MINUTES=60`, max 500 entries). Render free has ephemeral disk, so no file DB. Bypass with `?refresh=true`.
- `/` with `?brand&model&year` injects per-search OG tags (`og:title`, `og:image` → `/api/og`) into `index.html` for WhatsApp/Twitter crawlers. Static middleware runs with `{ index: false }` so `/` reaches that route.
- Env (`config.ts`): `PORT`, `FRONTEND_ORIGIN`, `DOLLAR_STRATEGY`, `CACHE_TTL_MINUTES`, `YEAR_WINDOW=3`, `MAX_PAGES_PER_SOURCE=4`, `MAX_PAGES_BROAD=6`. `.env` gitignored, no `.env.example` at root.

## Frontend (`frontend/src/`)

- Components: `App.tsx` (state + fetch + deep link + history) · `SearchForm.tsx` · `Result.tsx` (price, ARS/USD + Oficial/Blue/MEP selectors, `Distribution.tsx` chart) · `Listings.tsx` (sort + pagination `PAGE_SIZE=15`).
- `Distribution.tsx` renders P10/median/P90 markers + per-year bars with pure CSS, no chart deps (keeps $0-cost constraint).
- State: `localStorage` keys `cvma-theme`, `cvma-history` (max 6). Deep link `?brand=&model=&year=&mileage=&version=&condition=NEW&dollar=` auto-runs search. `mileage=0` ⇒ `condition=NEW`. Changing dollar refetches when a search is active.
- Share link includes `dollar` (when not OFICIAL) + `price` (feeds OG image).

## Gotchas

- Prettier must NOT touch `backend/fixtures/` (real scraped HTML; reformatting breaks the mercadolibre embedded-JSON test) — excluded in `.prettierignore` alongside `*.md`.
- `render.yaml` env only sets `CACHE_TTL_MINUTES` + `YEAR_WINDOW`; dollar default comes from `DOLLAR_STRATEGY` (OFICIAL).

## Deploy

- `Dockerfile` (node:22-slim, `npm ci` → build → prune; runtime copies `backend/dist` + `shared/dist` + `frontend/dist`) + `render.yaml` (free plan, `healthCheckPath: /api/health`).

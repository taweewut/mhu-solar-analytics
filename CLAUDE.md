# mhu-solar-analytics — working notes for Claude

Home-solar dashboard for two homes, switched with the ▾ in the header:
**MomHome** (7.44 kWp Solis + 16 kWh battery, PEA, zero export) and **MhuHome** (5 kWp Huawei,
no battery, MEA, since 20/09/2020). A static Vite + React app reads processed CSVs; an optional
FastAPI serves the same rows as JSON. Laid out like findash. `README.md` is the spec: data
layout, savings formulas, missing-data rules. Read the relevant section before changing a KPI.

## Layout

- `src/momsolar/` — the Python package (named `momsolar`, not the repo name). `schema.py` is the
  data contract (CSV columns). Fetchers: `fetch_solis_day.py` (Solis exports + PEA Log),
  `fetch_solis_api.py` / `solis_api.py` (SolisCloud API), `fetch_huawei.py` (FusionSolar reports
  + MEA Log), `fetch_weather.py` (Open-Meteo), `bills.py` / `sheets.py`. `api/` = FastAPI.
  `guest.py` = expiring guest links (the NAS `gate` service).
- `frontend/src/` — `lib/` holds all the math, each with a `*.test.ts` (tariff, energy, sankey,
  estimate, tou, trends…); `pages/` (Overview, Day, Trends, Savings, Battery, Health, Tv);
  `lib/api.ts` switches between static CSVs (default) and the API (`VITE_API_BASE_URL`).
  Routing is hash-based: `#/<home>/<page>`.
- `scripts/` — `refresh_all.sh` (re-import both homes), `make_sample_data.py`, `solis_poll.sh` +
  `install_poll.sh` (Mac launchd poller), `guest_link.sh`.
- `deploy/nas/` — Docker deploy for the Synology NAS. `sample_data/` — invented data for tests
  and fresh clones. `tests/` — pytest.

## Commands

Backend (from repo root; virtualenv at `.venv/`):

```bash
.venv/bin/ruff check src tests                              # lint (line length 100, py311)
.venv/bin/pytest -q                                         # ~58 tests, run on sample_data/
.venv/bin/uvicorn momsolar.api.app:app --reload --port 8020 # optional API (8000 is findash's)
scripts/refresh_all.sh                                      # re-import raw exports (folders from .env)
```

Frontend (`/usr/local/bin/node` works; the Docker build uses Node 20):

```bash
cd frontend
npm run typecheck      # tsc --noEmit
npm test               # vitest (~154 tests)
npm run build          # tsc + vite → frontend/dist
npm run dev            # Vite on 127.0.0.1:5173
```

`predev` / `prebuild` seed `frontend/public/data/` from `sample_data/` only when it has no
`homes.json`, so they never overwrite real data.

## Running it

- **Local:** Caddy (`:8080`) serves **solar.localhost:8080** straight from `frontend/dist`, with
  `/data/*` read live from `frontend/public/data`. New data shows on reload. Code changes need
  `npm run build`. **solar-dev.localhost:8080** → Vite :5173, **solar-api.localhost:8080** → :8020.
  Don't use findash's ports (:8000, :3001).
- **Production = the NAS** (`deploy/nas/docker-compose.yml`, app at
  `/volume1/docker/mhu-solar/app`, `ssh nas`). Three services: `web` (Caddy + the built site;
  a `?key=` secret link sets a family cookie), `gate` (`momsolar.guest`, checks `?guest=` tokens),
  and `poller` (15-min loop: SolisCloud, weather, MhuHome's monthly Gmail report). Use the
  `synology-deploy` skill for deploys. The Cloudflare Tunnel connector is **not** part of this
  project (it's shared, in `/volume1/docker/cloudflared`); don't add it back to the compose.
- **The NAS poller replaced the Mac's launchd poller.** Don't run `install_poll.sh` while the NAS
  poller is up: both would spend the same SolisCloud budget.
- The build targets `chrome79` / `safari14` for the LG webOS TV (`vite.config.ts`,
  `polyfills.ts`). Don't raise it.

## Conventions

- **SolisCloud limits:** 200 calls per endpoint per UTC day (undocumented; an `R0000` locks out
  until 07:00 Thai time). Calls are counted in `.solis_usage.json`, and the budget is
  `MOMSOLAR_SOLIS_DAILY_BUDGET` (180). Never add loops that bypass `solis_api`'s counter. A
  backfill costs 1 call per day.
- **Missing data is never drawn as zero.** Missing days are hatched, cards show "—", and
  estimates (`lib/estimate.ts`) are always marked **est.** The raw CSVs are never changed.
  Known outages go in `homes.json` → `dataGaps`.
- **Imports are idempotent:** rows merge by key (day, 5-min time, usage month). Raw files are
  recognised by **header row, not file name**. Bills match solar data by **usage month**.
- **Savings** follow the README's "How savings are estimated" (Type 1.2 tiers, Ft, VAT, TOU,
  `meterNetsExport`). Change the formula and its `*.test.ts` together.
- **Units:** kWh below 1,000, MWh from 1,000. Bills, per-day figures and charts stay in kWh.
- Every card and Sankey node carries a hover explanation. New KPIs need one too.
- **Verify before claiming done:** ruff + pytest for Python; `npm run typecheck` + `npm test`
  for the frontend; `npm run build` when the local site should show the change.

## Data & secrets — do not commit

**The GitHub repo is PUBLIC.** Everything committed, including commit messages, is world-readable.
Real data never goes in git. All of these are git-ignored; never add them, and never paste their
contents into logs, URLs or commit messages:

- `.env`, `deploy/nas/.env`: SolisCloud keys, `SOLAR_WEB_KEY`, `SOLAR_GUEST_SECRET`.
  `guest_link.sh` reads the guest secret over ssh without printing it. Keep it that way.
- `frontend/public/data/`: real CSVs + `homes.json`. `homes.json` holds the homes' locations,
  rounded to 2 decimals before they go to Open-Meteo.
- `raw_samples/`, `raw_api/` (SolisCloud replies), `.solis_usage.json`, `docs/v2-compare/`,
  `deploy/nas/{data,state,reports,pipeline}/`.

`sample_data/` is the only data in the repo and must stay invented (regenerate with
`scripts/make_sample_data.py`). Only the tariffs and `ft_rates.csv` are real (both public).
The API has no auth: keep it LAN-only.

## Neighbours

- `~/dev/electric_solar/solar_pipeline`: the Gmail fetcher that saves MhuHome's monthly
  FusionSolar report (mounted into the NAS poller at `/pipeline`).
- `~/dev/electric_solar/MhuHomeSolar`: raw inverter exports and older Power BI / Excel work.

## Git

Default branch is **`master`** (remote `taweewut/mhu-solar-analytics`, **public**). Branch off it for
anything non-trivial; commit/push only when asked. End commit messages with the
`Co-Authored-By: Claude …` trailer for the model in use.

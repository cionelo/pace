# PACE — Pacing Analysis for Collegiate Events

A full-stack data pipeline and interactive visualization tool for analyzing split-by-split pacing data from NCAA Division I and Division II distance races. Built to surface tactical patterns that raw results pages can't show.

**Live:** [pace-kappa.vercel.app](https://pace-kappa.vercel.app)

---

## What It Does

PACE scrapes race results from 10+ timing providers across 35+ conference championship meets, normalizes the data into a unified schema, and serves it through an interactive chart interface where users can:

- Compare lap-by-lap pacing across athletes, events, and conferences
- Visualize tactical moves with four chart modes (Virtual Gap, Lap Pace, Position, Time Gain/Loss)
- Overlay field averages and athlete averages to spot pacing strategies
- Filter by distance, gender, division, and season
- Cross-reference athletes across different meets with fuzzy name matching

### By the Numbers

| Metric | Count |
|--------|-------|
| Events ingested | ~375 |
| Conferences covered | 35+ (24 D1, 11 D2) |
| Timing providers supported | 10 |
| Cached event datasets | 596 |
| Distances tracked | 800m, Mile, 3000m, 5000m, DMR |
| Seasons | Indoor, Outdoor, XC |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  Frontend (React + Vite + TypeScript)                   │
│  Recharts · Zustand · Tailwind CSS · Supabase JS SDK    │
│  Deployed on Vercel (auto-deploy from main)             │
└────────────────────┬────────────────────────────────────┘
                     │ anon key (read-only RLS)
┌────────────────────▼────────────────────────────────────┐
│  Supabase (PostgreSQL)                                  │
│  5 tables: teams, events, athletes, results, splits     │
│  pg_trgm for fuzzy athlete search                       │
└────────────────────▲────────────────────────────────────┘
                     │ service key (write)
┌────────────────────┴────────────────────────────────────┐
│  Python Data Pipeline                                   │
│  Discover → Scrape → Normalize → Validate → Upload      │
│  Playwright + urllib · Multi-provider · Cached locally   │
└─────────────────────────────────────────────────────────┘
```

### Pipeline Stages

| Stage | Script | Purpose |
|-------|--------|---------|
| **Discover** | `py/pace_discover.py` | Takes a meet URL, finds all events, classifies distance events |
| **Scrape** | `py/pace_scraper.py` | Multi-provider Playwright/HTTP scraper (XHR + DOM + REST API) |
| **Normalize** | `py/pace_normalize.py` | Converts provider JSON → unified `pace.v1` schema |
| **Validate** | `py/pace_validate.py` | Time bounds, monotonic splits, sanity checks |
| **Upload** | `py/pace_upload.py` | Upserts into Supabase with athlete/team deduplication |
| **Orchestrate** | `py/pace_ingest_meet.py` | End-to-end: discover → scrape → normalize → validate → upload |

### Supported Timing Providers

- **legacy_spa** — AthleticLIVE white-label sites (15+ domains)
- **trackscoreboard** / **trackscoreboard_html** — TrackScoreboard XHR and SSR variants
- **pttiming** — Firebase RTDB REST API (no browser needed)
- **milesplit_live** — DOM click scraper with Firestore-rendered data
- **flashresults** — Static HTML parser
- **rtspt_html**, **leone_xc** — Additional providers

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 18, TypeScript, Vite 5 |
| Charts | Recharts 2 |
| State | Zustand 5 |
| Styling | Tailwind CSS 3 |
| Database | Supabase (PostgreSQL + Row Level Security) |
| Scraping | Playwright (Chromium), urllib |
| Backend | Python 3.9 |
| Hosting | Vercel (frontend), Supabase Cloud (database) |
| CI/CD | Push to `main` → Vercel auto-deploy (~30s) |

---

## Frontend Features

### Chart Modes

- **Virtual Gap** — Detrended elapsed time; shows pacing variation relative to even-pace baseline
- **Lap Pace** — Raw lap-by-lap times with optional overlays (athlete avg, field avg, field/split avg)
- **Position** — Rank at every split point; inverted Y-axis shows race position flow
- **Time Gain/Loss** — Per-segment delta vs. field average lap pace

### UI

- Multi-window layout for side-by-side comparisons
- Fuzzy athlete search with trigram matching
- Distance-aligned X-axis with linear interpolation (enables cross-conference overlays)
- Gender and division (D1/D2) filtering
- Legend with hover tooltips, source links back to original timing pages
- Interactive FAQ modal explaining each chart mode

---

## Database Schema

Five normalized tables with referential integrity and RLS for public read access:

```
teams ──┐
        ├── athletes ──┐
events ─┘              ├── results ── splits
                       │
```

- **teams** — deduplicated by name, with optional hex color and logo
- **events** — one row per race (source_id, distance, gender, season, source_url)
- **athletes** — unique on (name, team_id)
- **results** — one row per athlete per event (place, time_s, time_str)
- **splits** — one row per split point per result (label, ordinal, elapsed_s, lap_s, distance_m)

---

## Project Structure

```
pace/
├── apps/web/              # React frontend
│   └── src/
│       ├── components/    # 9 components (SplitChart, AthleteSearch, etc.)
│       ├── lib/           # Supabase client, DB queries, constants
│       └── stores/        # Zustand state management
├── py/                    # Python data pipeline
│   ├── pace_scraper.py    # Multi-provider scraper (1,354 LOC)
│   ├── pace_normalize.py  # Schema normalizer (796 LOC)
│   ├── pace_discover.py   # Event discovery (351 LOC)
│   ├── pace_validate.py   # Data validation (197 LOC)
│   ├── pace_upload.py     # Supabase uploader (143 LOC)
│   ├── pace_ingest_meet.py # End-to-end orchestrator
│   └── data/              # Cached scrape output (596 events)
├── supabase/migrations/   # SQL schema migrations
├── docs/                  # Design docs and plans
└── scripts/               # Batch ingest scripts
```

---

## Getting Started

### Prerequisites

- Node.js 18+
- Python 3.9+ with Playwright (`python -m playwright install chromium`)
- Supabase project with schema applied

### Frontend

```bash
cd apps/web
npm install
cp .env.example .env.local  # add Supabase URL + anon key
npm run dev
```

### Pipeline

```bash
# Ingest a full meet (discover → scrape → normalize → validate → upload)
python py/pace_ingest_meet.py \
  --url "https://live.example.com/meets/12345" \
  --auto --season indoor \
  --meet-name "2026 Conference Indoor Championships" \
  --date "2026-02-21" \
  --data-root py/data
```

Cache is automatic — re-running skips already-scraped events. Uploads are upsert-safe.

---

## Key Design Decisions

- **Provider-agnostic normalization**: Every timing system outputs different JSON/HTML. The normalizer abstracts this into a single `pace.v1` schema so the frontend never thinks about providers.
- **Cache-first scraping**: Raw scrape data is cached locally. This enables re-normalization when the schema evolves without re-hitting timing servers.
- **Distance-aligned charts**: X-axis uses actual meters (not split ordinal) with linear interpolation. This means a 200m-lap indoor race and a 400m-lap outdoor race overlay correctly.
- **Fuzzy athlete search**: PostgreSQL `pg_trgm` handles name variations across different timing systems.
- **Read-only public access**: Row Level Security on all tables. Frontend uses anon key; pipeline uses service key for writes.

---

## Author

**Nehemiah Cionelo** — [itsnemo.dev](https://itsnemo.dev/work) | [nemocionelo@gmail.com](mailto:nemocionelo@gmail.com)

## License

MIT

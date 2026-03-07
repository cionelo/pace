# PACE Session Handoff

> Context document for the next AI session to pick up where we left off.

## Current State (March 7, 2026)

### What's Working

Full end-to-end pipeline verified:

1. **Scraper** (`py/pace_scraper.py`) — Multi-provider Playwright scraper (XHR + DOM).
2. **Discover** (`py/pace_discover.py`) — Takes a meet URL, finds all events, classifies them.
3. **Normalizer** (`py/pace_normalize.py`) — Converts provider JSON to `pace.v1` schema.
4. **Validator** (`py/pace_validate.py`) — Time bounds, monotonic splits, non-empty names.
5. **Uploader** (`py/pace_upload.py`) — Upserts into Supabase (athlete/team dedup).
6. **Meet Ingest** (`py/pace_ingest_meet.py`) — Orchestrates discover → scrape → normalize → validate → upload.
7. **Frontend** (`apps/web/`) — React + Vite + TypeScript + Zustand + Recharts, Supabase anon key.

### Data in Supabase (~March 5, 2026)

- ~120 events across 12 conferences
- Indoor 2026: NSIC, GNAC, SIAC, RMAC, MEAC, Conference Carolinas, Gulf South, G-MAC, CIAA, Peach Belt, NE10
- 5 XC events from Fall 2025 (Sun Belt, GSC, ACCC)

---

## Frontend Features (as of March 7, 2026)

### Chart Modes (SplitChart.tsx)

Three-mode toggle in `SplitChart.tsx` — `ChartMode = "gap" | "virtual" | "raw"`:

- **Gap** (default): cumulative time gap vs first athlete. Y-axis in ±seconds. Zero line = leader.
- **Virtual**: detrended elapsed — subtract average even-pace line. Shows pacing variation (positive = slow lap, negative = fast lap).
- **Raw Splits**: lap-by-lap times. Y-axis in mm:ss.

Gap/Virtual tooltips show ±s with elapsed and lap context. Y-axis formats as `+/-Xs` in gap modes, `mm:ss` in raw.

Chart aligns athletes by `distance_m` with linear interpolation when available, falling back to ordinal position. Enables cross-conference overlays where split intervals differ (e.g. 200m vs 400m laps).

### Other UI (completed March 5–6)

- Logo (nemo-favicon-2, 40px), Ko-fi link (`https://ko-fi.com/devbynemo`), ContactModal (Formspree, 3 form types)
- Reset button on window header — returns to distance selector
- Clear "x" buttons on athlete search inputs
- Legend hover tooltip: semi-transparent + backdrop blur; conditional `source_url` link (field added to `Event` type, backend backfill pending)
- Gender filter applies immediately on change; events sorted fastest-first; descriptive empty state

---

## How to Ingest a Meet

```bash
cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace

python3 py/pace_ingest_meet.py \
  --url "https://live.example.com/meets/12345" \
  --auto \
  --season indoor \
  --meet-name "2026 Conference Name Indoor Championships" \
  --date "2026-02-21" \
  --data-root py/data
```

- `--auto` — selects all distance events automatically
- `--data-root py/data` — **always include** when running from `pace/` root
- Cache is automatic: scraper skips Playwright if JSON files exist
- Upsert-safe: re-running updates metadata without duplicating athletes

### Discover only

```bash
python3 py/pace_discover.py --url "https://live.example.com/meets/12345" --distance-only
```

---

## Supported Providers

### legacy_spa (AthleticLIVE white-labels)

All handled by `capture_legacy_spa()`. Known domains in `detect_provider()` (~line 124 of `pace_scraper.py`):

- `live.xpresstiming.com` (Gulf South), `live.athletictiming.net` (GNAC)
- `live.jdlfasttrack.com` (Conf Carolinas), `live.timinginc.com` (Peach Belt outdoor)
- `blueridgetiming.live` (MEAC), `live.fstiming.com` (GLIAC — no splits, don't re-ingest)
- `live.herostiming.com` (NSIC), `live.athletic.net` (G-MAC)
- `live.dcracetiming.com` (SIAC), `live.rapidresultstiming.com` (RMAC)
- `snapresults.snaptiming.com` (CIAA)
- `results.adkinstrak.com`, `live.deltatiming.com` (others)

To add a new domain: add it to `detect_provider()` in `py/pace_scraper.py`.

### trackscoreboard

`rt.trackscoreboard.com` — XHR interception via `capture_trackscoreboard()`.

### trackscoreboard_html

DOM scraper for TrackScoreboard v4.1.187 Angular SSR sites (no XHR — data is server-rendered):

- `lancer.trackscoreboard.com` (NE10), `live.halfmiletiming.com` (Indoor Peach Belt)

URL pattern: `/meets/{meet_id}/events/{event_id}/{round}`. Scraper dir = `{meet_id}_{event_id}_{round}`. `pace_ingest_meet.py` uses `event_id_from_url(href)` as secondary lookup to handle the ID mismatch between discover output and scraper dir names.

### Other providers

`rtspt_html`, `leone_xc`, `pttiming`, `milesplit_live` — see `pace_scraper.py`.

---

## Known Issues / Don't Fix

- **GNAC Men 4000mDMR** (`382102`): timing error in source (21.7s split at 1400m). Blocked by validator.
- **G-MAC Men/Women DMR** (`387088`, `387089`): no athletes in relay data. Known relay gap.
- **GLIAC** (`live.fstiming.com/meets/62261`): no per-lap splits. Athletes + finish times in DB but splits empty. Don't re-ingest.
- **Decathlon 1500m false positive**: classified as distance event by regex. Harmless low-athlete event.

---

## Environment

- Python: `/usr/bin/python3` (3.9) — `.venv` is broken, never use it
- Node: 18.x in `apps/web/`
- Supabase project: `zlvtnrtkqfhkjimbpkmp`
- Credentials: `py/.env` (service key for writes), `apps/web/.env.local` (anon key for frontend)
- Playwright + Chromium: installed via `/usr/bin/python3 -m pip`

---

## Architecture Reference

```
py/pace_discover.py      → event list from meet URL
py/pace_scraper.py       → raw JSON per event (split_report.json, ind_res_list.json)
py/pace_normalize.py     → pace_normalized.json (pace.v1 schema)
py/pace_validate.py      → BLOCK/WARN diagnostics
py/pace_upload.py        → Supabase upsert
py/pace_ingest_meet.py   → end-to-end orchestrator
py/pace_ingest.py        → (legacy single-event ingest, see pace_ingest_meet.py for full pipeline)
py/pace_renormalize_all.py → batch re-normalize cached events (used when normalizer changes)
py/data/                 → cached scrape output (always pass --data-root py/data from pace/ root)

apps/web/src/lib/supabase.ts       → Supabase client
apps/web/src/lib/db.ts             → Query functions
apps/web/src/stores/window-store.ts → Zustand state
apps/web/src/components/SplitChart.tsx → Three-mode chart (gap/virtual/raw)
apps/web/src/components/           → All UI components

supabase/migrations/001_initial_schema.sql → DB schema (5 tables)
supabase/migrations/002_add_distance_m.sql → adds distance_m column to splits
docs/plans/                        → Session design docs and implementation plans
docs/d2 indoor conf urls 2026.md   → Conference meet URLs with notes
```

### Split data format

- Indoor: 200m laps (25 splits for 5000m, ~8 for Mile, ~4 for 800m)
- Outdoor: 400m laps
- XC: varies — typically 1K splits (5 for 5K)
- DMR: 4 legs (1200m, 400m, 800m, 1600m)

---

## Next Steps

1. **Vercel deploy** — Plan at `docs/plans/2026-03-05-vercel-deploy.md`. Not yet done.
2. **Outdoor season ingestion** — Separate session once outdoor conference meets are posted.

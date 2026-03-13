# PACE Session Handoff

> Context document for the next AI session to pick up where we left off.

## Current State (March 12, 2026)

Full stack live and deployed. End-to-end pipeline verified:

1. **Scraper** (`py/pace_scraper.py`) — Multi-provider Playwright scraper (XHR + DOM).
2. **Discover** (`py/pace_discover.py`) — Takes a meet URL, finds all events, classifies them.
3. **Normalizer** (`py/pace_normalize.py`) — Converts provider JSON to `pace.v1` schema.
4. **Validator** (`py/pace_validate.py`) — Time bounds, monotonic splits, non-empty names.
5. **Uploader** (`py/pace_upload.py`) — Upserts into Supabase (athlete/team dedup).
6. **Meet Ingest** (`py/pace_ingest_meet.py`) — Orchestrates discover → scrape → normalize → validate → upload.
7. **Frontend** (`apps/web/`) — React + Vite + TypeScript + Zustand + Recharts, Supabase anon key.

### Data in Supabase (March 12, 2026)

- **~375 events** across D2 + D1 conferences
- **D2 Indoor 2026 (all complete):** NSIC, GNAC, SIAC, RMAC, MEAC, Conference Carolinas, Gulf South, G-MAC, CIAA, Peach Belt, NE10
- **D1 Indoor 2026 (ingested, 24/27):** AAC, ASUN, A10, ACC, Big East, Big Sky, CAA, CUSA, Horizon League, MAAC, MAC, MEAC (D1), MWC, Patriot League, SEC, SoCon, Southland, Summit League, Sun Belt, SWAC, WAC, America East, Big 12, Big Ten, OVC
- **5 XC events from Fall 2025:** Sun Belt, GSC, ACCC

---

## ⚠️ INCOMPLETE: Remaining D1 Indoor 2026 Ingestion

**New session must complete these conferences.** Run from `cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace`.

### CRITICAL: Always use `/usr/bin/python3`, NOT bare `python3`

Bare `python3` resolves to Homebrew Python 3.14 which lacks Playwright and supabase packages. This will cause `ModuleNotFoundError: No module named 'playwright'` on every scraper call.

```bash
# WRONG — do not use:
python3 py/pace_ingest_meet.py ...

# CORRECT — always use full path:
/usr/bin/python3 py/pace_ingest_meet.py ...
```

### 1. Ivy League (legacy_spa)
URL was updated — use `armorytrack.live` not `live.athletic.net`:
```bash
/usr/bin/python3 py/pace_ingest_meet.py \
  --url "https://armorytrack.live/meets/58419" \
  --auto --season indoor \
  --meet-name "2026 Ivy League Indoor Championships" \
  --date "2026-02-22" --data-root py/data
```

### 2. Mountain West (rtspt_html)
Provider `rtspt_html` exists but this specific meet URL is untested:
```bash
/usr/bin/python3 py/pace_ingest_meet.py \
  --url "https://www.rtspt.com/events/mw/2026-Indoor/" \
  --auto --season indoor \
  --meet-name "2026 Mountain West Indoor Championships" \
  --date "2026-02-27" --data-root py/data
```

### 3. MVC / Missouri Valley (pttiming — two-step process)

`pace_ingest_meet.py` cannot discover pttiming events (JS-rendered SPA). Use the two-step workaround:

**Step 1 — Scrape all events:**
```bash
/usr/bin/python3 py/pace_ingest.py \
  --url "https://live.pttiming.com/?mid=8717" \
  --data-root py/data
```
This populates cache at `py/data/8717_*/`.

**Step 2 — Upload each distance event manually:**
Identify distance events from the cached scrape (`8717_{enr}_*/split_report.json` files where `has_spd=True`), then for each:
```bash
/usr/bin/python3 py/pace_upload.py \
  --data-root py/data \
  --event-dir "py/data/8717_{enr}_1" \
  --meta '{"id":"8717_{enr}_1","provider":"pttiming","name":"EVENT NAME","season":"indoor","meet_name":"2026 Missouri Valley Conference Indoor Championships","meet_date":"2026-03-02","gender":"M or W","distance_m":DISTANCE}'
```
Distance events: 800m, Mile, 3000m, 5000m, DMR (relay — may fail, see Known Issues).

Refer to how Big 12 (`mid=8683`) and Big Ten (`mid=8715`) were ingested for exact pattern.

### 4. NEC / Northeast (milesplit_live — URL unknown)

The URL in the doc (`https://milesplit.live/timers/959`) is a timing company page, not a meet. The correct URL follows the pattern `https://www.milesplit.live/meets/{id}/events`. The meet ID is unknown.

**To find it:** Search MileSplit for "2026 Northeast Conference Indoor Championships" or check `milesplit.com/meets` for NEC indoor 2026. Once found, ingest as:
```bash
/usr/bin/python3 py/pace_ingest_meet.py \
  --url "https://www.milesplit.live/meets/FIND_THIS_ID/events" \
  --auto --season indoor \
  --meet-name "2026 NEC Indoor Championships" \
  --date "2026-02-22" --data-root py/data
```

### 5. Big South (optional — no splits)

`tfmeetpro` provider returns only finish times, no split data. Low priority. URL: `http://results.tfmeetpro.com/Mitchell_Timing/Big_South_Conference_Indoor_Track_and_Field_Championships_2026/`

---

## How to Ingest a Meet

```bash
cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace

/usr/bin/python3 py/pace_ingest_meet.py \
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
/usr/bin/python3 py/pace_discover.py --url "https://live.example.com/meets/12345" --distance-only
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
- `armorytrack.live` (MAAC, Ivy League), `results.lakeshoreathleticservices.com` (Big East)

To add a new domain: add it to `detect_provider()` in `py/pace_scraper.py`.

### trackscoreboard

`rt.trackscoreboard.com` — XHR interception via `capture_trackscoreboard()`.

### trackscoreboard_html

DOM scraper for TrackScoreboard v4.1.187 Angular SSR sites (no XHR — data is server-rendered):

- `lancer.trackscoreboard.com` (NE10, America East, CAA), `live.halfmiletiming.com` (Indoor Peach Belt)

URL pattern: `/meets/{meet_id}/events/{event_id}/{round}`. Scraper dir = `{meet_id}_{event_id}_{round}`. `pace_ingest_meet.py` uses `event_id_from_url(href)` as secondary lookup to handle the ID mismatch between discover output and scraper dir names.

### pttiming (Firebase REST — splits work)

Replaced Playwright XHR capture with direct Firebase RTDB REST API — no browser needed.

- Fetches `https://ptt-franklin.firebaseio.com/{mid}.json` via `urllib`
- Multi-event: each `MeetEvent` in Firebase becomes a separate event_id `{mid}_{enr}`
- `SPD` field has per-split data; `SL` field has distance labels
- Known working: Big 12 (`mid=8683`), Big Ten (`mid=8715`), MVC (`mid=8717`)
- **Limitation**: `pace_ingest_meet.py` discover step fails (JS-rendered SPA). Must use two-step ingest (see above).

### milesplit_live (DOM click scraper — splits work)

DOM-based Playwright scraper. Clicks sidebar `li.pointer` events → waits for Firestore render → extracts `td.split` cells via `_EXTRACT_JS`. Multi-event dict return.

- URL pattern: `milesplit.live/meets/{meet_id}/events`
- Known working: OVC (`meets/731447/events`), NEC (URL unknown — see above)
- **Multi-section combined tables** can cause DOM misalignment → sanitized in normalizer (see below)
- **Limitation**: `pace_discover.discover_meet()` can't find events from JS-rendered SPA. Must upload directly via `pace_upload.py --meta`.

### flashresults (splits work)

Static HTML provider. Each event page is a separate URL.

- Known working: ACC (`flashresults.com/2026_Meets/Indoor/02-26_ACC/index.htm`), SEC (`flashresults.com/2026_Meets/Indoor/02-26_SEC/index.htm`)
- `pace_ingest_meet.py` handles these via the `flashresults` provider path.

### Other providers

`rtspt_html`, `leone_xc` — see `pace_scraper.py`.

---

## Normalizer Changes (March 2026)

All in `py/pace_normalize.py`:

### `parse_place()` helper

Added after `safe_int()`. Converts ordinal strings ("4th", "1st", "12th") → int. Required because milesplit_live `_EXTRACT_JS` extracts place as ordinal text but Supabase `splits.place` column is integer:

```python
def parse_place(v: Any) -> Optional[int]:
    if v is None:
        return None
    if isinstance(v, int):
        return v
    import re as _re
    m = _re.match(r"(\d+)", str(v).strip())
    return int(m.group(1)) if m else None
```

Case B place field uses `parse_place()`:
```python
"place": parse_place(sp.get("place_at_split") or sp.get("p")),
```

### Split sanitization

Added before `return key, splits` in `build_splits_from_spr_row()`. Discards all splits for an athlete if any `lap_s < 5.0s`. Catches DOM misalignment in combined multi-section tables (milesplit_live where `td.split` cells shift for some athletes):

```python
if splits:
    bad = any(
        s["lap_s"] is not None and s["lap_s"] < 5.0
        for s in splits
    )
    if bad:
        splits = []
```

### `_event_name` extraction

Normalizer reads `ir._event_name` (populated by milesplit_live scraper) into `event_meta["name"]`:

```python
ev_name = (ir.get("_event_name") or "") if isinstance(ir, dict) else ""
event_meta = {
    "id": event_id,
    "provider": provider,
    "name": ev_name,
    "splits": split_defs
}
```

### Case C for pttiming SPD array

`build_splits_from_spr_row()` handles pttiming Firebase `SPD` array `[{CS, CSM, P}, ...]` where `CS` is cumulative split time in milliseconds. See existing code in `pace_normalize.py`.

---

## Validator Fix (March 2026)

In `py/pace_validate.py`, changed "impossibly fast lap" threshold from `MIN_LAP_PACE_PER_KM * 0.15 = 21.75s` to absolute `10.0s`:

```python
# Before (was blocking legitimate D1 sprint splits ~21.5s for 400m):
if lap < MIN_LAP_PACE_PER_KM * 0.15:

# After:
if lap < 10.0:  # absolute minimum — covers sprint splits, blocks DOM garbage
```

Reason: old threshold (21.75s) falsely blocked Men's 400m pttiming splits at ~21.5s for D1 sprinters. 10s still catches DOM garbage (0.3s, 1.4s) while allowing all real splits through.

---

## Frontend Features (as of March 9, 2026)

### Chart Modes (SplitChart.tsx)

Four-mode toggle in `SplitChart.tsx` — `ChartMode = "virtual" | "raw" | "position" | "time_gain_loss"`:

- **Virtual Gap** (default): detrended elapsed — subtract average even-pace line. Shows pacing variation (positive = slow lap, negative = fast lap). Y-axis ±s, zero reference line.
- **Lap Pace**: lap-by-lap times. Y-axis in mm:ss.
- **Position**: rank of each athlete at every split (1 = leader). Y-axis inverted, integer ticks. Tooltip shows `P1`, `P2` etc + elapsed.
- **Time Gain/Loss**: per-segment lap delta vs field average lap pace. Positive = lost time vs avg; negative = gained. Y-axis ±s, zero reference line. Requires ≥2 athletes (shows message otherwise).

`ChartFaqModal` (`apps/web/src/components/ChartFaqModal.tsx`) — circular `?` button left of the toggle group.

Chart aligns athletes by `distance_m` with linear interpolation when available, falling back to ordinal position. Enables cross-conference overlays where split intervals differ (e.g. 200m vs 400m laps).

### Lap Pace Overlays (SplitChart.tsx)

Three toggle buttons appear below the chart mode row when **Lap Pace** mode is active:

- **Athlete avg** (overlay A): dotted horizontal `ReferenceLine` per visible athlete at their mean lap_s.
- **Field avg** (overlay B): flat gray `ReferenceLine` at the mean lap_s across all athletes in the first selected athlete's event field.
- **Field/split** (overlay C): amber `Line` showing the field's mean lap_s at each split point.

### D1/D2 Division Filter (AthleteSearch.tsx)

- `Event` type now has `division: "D1" | "D2" | null`.
- `EventFilters` in `db.ts` accepts `division`; passed through `getEvents()`.
- `AthleteSearch` has an All / D1 / D2 toggle alongside the gender toggle.
- **Backend migration required** (separate session): `004_add_division.sql` — adds `division` column, backfills existing rows as D2, updates `pace_upload.py` + `pace_ingest_meet.py` with `--division` flag.

### Gender filter bug fix (AthleteSearch.tsx)

`genderFilter` was missing from `doSearch` useCallback deps — athlete search results didn't re-filter when gender was toggled. Fixed by adding `genderFilter` to the dep array.

### Other UI (completed March 5–6)

- Logo (nemo-favicon-2, 40px), Ko-fi link (`https://ko-fi.com/devbynemo`), ContactModal (Formspree, 3 form types)
- Reset button on window header — returns to distance selector
- Clear "x" buttons on athlete search inputs
- Legend hover tooltip: semi-transparent + backdrop blur; conditional `source_url` link
- Gender filter applies immediately on change; events sorted fastest-first; descriptive empty state

---

## Known Issues / Don't Fix

- **GNAC Men 4000mDMR** (`382102`): timing error in source (21.7s split at 1400m). Blocked by validator.
- **G-MAC Men/Women DMR** (`387088`, `387089`): no athletes in relay data. Known relay gap.
- **GLIAC** (`live.fstiming.com/meets/62261`): no per-lap splits. Athletes + finish times in DB but splits empty. Don't re-ingest.
- **Decathlon 1500m false positive**: classified as distance event by regex. Harmless low-athlete event.
- **DMR relay upload bug**: `get_or_create_athlete` fails when team is empty string → `team_id=None` → UUID parse error. Relay events with blank team fields can't upload. Pre-existing known bug — skip relay events when they fail, don't try to fix.

---

## Environment

- Python: `/usr/bin/python3` (3.9) — `.venv` is broken, never use it. **Never use bare `python3`** (resolves to Homebrew 3.14, no Playwright).
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
py/pace_ingest.py        → (legacy single-event ingest; used for pttiming two-step)
py/pace_renormalize_all.py → batch re-normalize cached events (used when normalizer changes)
py/data/                 → cached scrape output (always pass --data-root py/data from pace/ root)

apps/web/src/lib/supabase.ts       → Supabase client
apps/web/src/lib/db.ts             → Query functions
apps/web/src/stores/window-store.ts → Zustand state
apps/web/src/components/SplitChart.tsx → Four-mode chart (virtual gap/lap pace/position/time gain-loss)
apps/web/src/components/ChartFaqModal.tsx → ? button + modal explaining each chart view
apps/web/src/components/           → All UI components

supabase/migrations/001_initial_schema.sql → DB schema (5 tables)
supabase/migrations/002_add_distance_m.sql → adds distance_m column to splits
supabase/migrations/003_add_source_url.sql → adds source_url column to events (applied March 8, 2026)
docs/plans/                        → Session design docs and implementation plans
docs/d1 indoor conf urls 2026.md   → D1 conference meet URLs with provider notes
docs/d2 indoor conf urls 2026.md   → D2 conference meet URLs with notes
scripts/ingest_d1_indoor_2026.sh   → Batch ingest script for all D1 conferences
```

### Split data format

- Indoor: 200m laps (25 splits for 5000m, ~8 for Mile, ~4 for 800m)
- Outdoor: 400m laps
- XC: varies — typically 1K splits (5 for 5K)
- DMR: 4 legs (1200m, 400m, 800m, 1600m)

---

## Deployment (live as of March 7, 2026)

- **GitHub:** https://github.com/cionelo/pace (single clean initial commit, fresh history)
- **Live URL:** https://pace-kappa.vercel.app
- **Auto-deploy:** every push to `main` → Vercel rebuild (~30s). Root directory: `apps/web`.
- **Env vars set in Vercel:** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_FORMSPREE_ID` (all environments)
- **Ko-fi:** `https://ko-fi.com/devbynemo` — already live in Header.tsx
- **Formspree:** configured and deployed

---

## source_url Column (March 8, 2026)

Added `source_url text` column to `events` table — links each event back to its timing system results page. Status:

- **Migration file:** `supabase/migrations/003_add_source_url.sql` — **applied March 8, 2026** via Supabase Dashboard SQL editor.
- **pace_upload.py:** passes `source_url` from `event_meta` into the upsert row.
- **pace_ingest_meet.py:** populates `source_url = href` (the event URL) in event_meta — future ingests auto-populate it.
- **Backfill script:** `py/pace_backfill_source_url.py` — run March 8, 2026: 117 events updated, 5 XC events skipped.
- **Frontend:** `Legend.tsx` already renders `event.source_url` as a clickable link.

## distance_m inference (already complete)

The `_infer_distances_from_count()` function in `pace_normalize.py` already handles non-standard track sizes including the 300m indoor track stagger:
- 5000m, 17 splits → 200m first lap + 16 × 300m (verified correct in DB)
- G-MAC Men/Women 5000m splits already have correct `distance_m` values in Supabase. No re-normalization needed.

---

## Next Steps (priority order)

1. **Complete D1 Indoor 2026** — Ivy League, Mountain West, MVC, NEC (see "INCOMPLETE" section above)
2. **D1/D2 division backfill** — Apply `004_add_division.sql` migration, backfill existing D2 rows, add `--division` flag to ingest scripts
3. **Outdoor season ingestion** — Separate session once outdoor conference meets are posted
4. **M/W gender filter bug** — In athlete search, toggling M/W doesn't immediately re-filter the "add athlete" list. Needs fix in `AthleteSearch.tsx` (already noted but not yet fixed as of March 12).
5. **Source URL link UX** — `source_url` links exist in the Legend tooltip (`Legend.tsx:44-51`) but are effectively unclickable: the tooltip is triggered by `onMouseEnter`/`onMouseLeave` on the athlete button, so it disappears when the user moves the cursor toward the link. Needs rework — either make the tooltip persist on hover (with a delay before hiding), move the link to a click-triggered popover, or surface source links in a more accessible location (e.g. event header, dedicated "View Results" button).

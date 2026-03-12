# FlashResults Provider Implementation

**Model recommendation: Sonnet** — this is well-scoped implementation with a known data format.

## Context

Read these files first:
- `docs/HANDOFF.md` — full project context
- `py/pace_scraper.py` — existing scraper (all providers)
- `py/pace_normalize.py` — normalizer (split parsing logic)
- `py/pace_discover.py` — event discovery (Playwright-based)
- `py/pace_ingest_meet.py` — orchestrator

## Goal

Add a `flashresults` provider to the PACE pipeline so we can ingest ACC and SEC D1 indoor conference meets.

**ACC URL:** `https://flashresults.com/2026_Meets/Indoor/02-26_ACC/index.htm`
**SEC URL:** `https://flashresults.com/2026_Meets/Indoor/02-26_SEC/index.html`

## FlashResults Format (already verified)

FlashResults is **static HTML** (not an SPA). No JavaScript rendering needed — plain HTTP requests suffice.

### Meet index page structure
- `index.htm` has tables organized by session/day
- Each event row contains links like `025-2_compiled.htm` (results) and `025-2-01.htm` (splits)
- Event names in table cells (e.g. "Men 1 Mile Final", "Women 3000 Meters")
- Distance events, sprints, and field events all listed

### Results page (`{event_code}_compiled.htm`)
- HTML table with columns: Pl, Athlete name, School, Year, Final time
- Contains a link to splits page: `[Splits]({event_code}-01.htm)`

### Splits page (`{event_code}-01.htm`)
- HTML table with columns: distance checkpoints as headers (e.g. "209m", "409m", "609m", "809m", "1009m", "1209m", "1409m", "Mile")
- Each row = one athlete with cumulative elapsed times at each checkpoint
- **Important: The first split is at 209m (not 200m)** — this is a 9m start-line stagger common on banked indoor tracks. After that, every interval is 200m.
- Example: Paul Specht (Wake Forest): 30.28 → 1:01.35 → 1:32.41 → 2:03.10 → 2:32.76 → 3:02.51 → 3:31.18 → 3:58.14

## Implementation Steps

### 1. Add to `detect_provider()` in `py/pace_scraper.py`
```python
if "flashresults.com" in u:
    return "flashresults"
```

### 2. Create `capture_flashresults()` in `py/pace_scraper.py`
- Use `requests` (NOT Playwright — static HTML, no JS needed)
- Input: event URL (the `_compiled.htm` page)
- Parse the results table for athlete name, team, year, place, final time
- Find and follow the splits link (`-01.htm`)
- Parse the splits table for distance checkpoints and cumulative times
- Output format must match `pace.v1` schema:
  - `split_report`: `{"_source": {"spr": [...]}, "_provider": "flashresults"}`
  - `ind_res_list`: `{"_source": {"r": [...]}, "_provider": "flashresults"}`
- Each spr row should contain: athlete identity + splits array with `label`, `elapsed_str`, `elapsed_s`, `lap_s`
- Use the existing Raspy-style format: `r.splits = [{label: "209m", tm: "30.28"}, {label: "409m", tm: "1:01.35"}, ...]`

### 3. Create `discover_flashresults()` in `py/pace_discover.py` (or inline in scraper)
- Parse the `index.htm` page with requests + BeautifulSoup
- Find all `<a>` tags linking to `_compiled.htm` files
- Extract event name from the table cell
- Classify using existing `classify_event()` function
- Return event list in same format as `discover_events()`

### 4. Add normalization case in `py/pace_normalize.py`
- In `build_splits_from_spr_row()`, add a Case C for flashresults that handles the Raspy-style splits format (which is already Case B — so it should work if the scraper outputs in that format)
- The `_infer_distances_from_count()` function needs to handle the 209m stagger: first split at 209m, then 200m increments. Use the labels directly since FlashResults provides explicit distance labels ("209m", "409m", etc.)

### 5. Wire into `py/pace_ingest_meet.py`
- Add flashresults case to the orchestrator
- For discover: call `discover_flashresults()` instead of the Playwright-based `discover_events()`
- For scrape: call `capture_flashresults()` per event

### 6. Test
```bash
cd pace/
python3 py/pace_ingest_meet.py \
  --url "https://flashresults.com/2026_Meets/Indoor/02-26_ACC/index.htm" \
  --auto --season indoor \
  --meet-name "2026 ACC Indoor Championships" --date "2026-02-26" \
  --data-root py/data
```

Verify:
- Events discovered correctly (Men/Women Mile, 800, 3000, 5000, DMR)
- Split data parsed correctly (cumulative times, lap deltas)
- `distance_m` inferred correctly from explicit labels
- Data uploads to Supabase

## Key Constraints
- Use `/usr/bin/python3` (3.9) — `.venv` is broken
- Supabase credentials in `py/.env`
- `--data-root py/data` always required from `pace/` root
- Don't use Playwright for this provider — static HTML, use requests + BeautifulSoup
- Install beautifulsoup4 if needed: `/usr/bin/python3 -m pip install beautifulsoup4`

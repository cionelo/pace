# PACE Data Enrichment & Completion Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete D1 indoor conference ingestion, add division classification to all events, and enrich the pipeline with location/altitude/metadata fields — all phased so cached data is reused and scraping is minimized.

**Architecture:** Schema migrations first (division, altitude), then pipeline script updates (--division flag, location extraction, altitude lookup), then targeted re-ingestion using cached data. Frontend already has division UI; it'll work once the DB column exists.

**Tech Stack:** Supabase (PostgreSQL), Python 3.9 (`/usr/bin/python3`), Playwright, React/TS frontend on Vercel.

---

## Current State (March 13, 2026)

- **~375 events** in Supabase (25 D1 + 11 D2 conferences + 5 XC)
- **Frontend:** Live at pace-kappa.vercel.app, all features deployed
- **Missing D1 conferences:** Ivy League, MVC, NEC (+ Big South, no splits)
- **596 cached event datasets** in `py/data/`

### Field Audit Summary

| Field | DB Column | Pipeline Support | Populated? |
|-------|-----------|-----------------|------------|
| Division (D1/D2) | **MISSING** | No --division flag | N/A |
| Location/venue | `events.location` | `--location` flag exists | **Empty** for all events |
| Altitude | **MISSING** | None | N/A |
| Year | Via `events.date` (DATE type) | `--date` flag | **Yes** for all events |
| Season | `events.season` | `--season` flag + CHECK constraint | **Yes** for all events |
| Finish times (no splits) | `results.time_s` | Uploads regardless of splits | **Yes**, working correctly |
| Source URL | `events.source_url` | Auto from href | **Yes**, backfilled |

---

## Phase 0: Immediate — Division Migration (this session)

**Prerequisite for D1/D2 filter to work on the live site.**

### Task 0.1: Apply Division Migration

**Files:**
- Created: `supabase/migrations/004_add_division.sql`

**Step 1:** Open Supabase Dashboard → SQL Editor → paste and run `004_add_division.sql`

The migration:
- Adds `division text CHECK (division IN ('D1', 'D2'))` column to events
- Creates index on division
- Backfills all existing events using conference name pattern matching
- Handles MEAC as D1 (its correct NCAA classification)

**Step 2:** Verify the backfill worked:
```sql
-- Should show counts for D1, D2, and any NULLs that didn't match
SELECT division, COUNT(*) FROM events GROUP BY division;

-- Check for any unclassified events
SELECT id, name, division FROM events WHERE division IS NULL;
```

**Step 3:** Test on live site — the D1/D2 toggle in AthleteSearch should now filter correctly.

### Task 0.2: Push All Changes to GitHub

```bash
cd "/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace"

# Update gitignore (credentials file + build artifacts)
echo "docs/pace revamp spec notes.md" >> .gitignore
echo ".vite/" >> .gitignore
echo "supabase/.temp/" >> .gitignore

# Stage safe files only
git add .gitignore README.md "docs/HANDOFF.md" "docs/d1 indoor conf urls 2026.md" \
  supabase/migrations/004_add_division.sql

# Commit and push
git commit -m "docs: add README, division migration, update HANDOFF and gitignore"
git push origin main
```

### Task 0.3: Fix Ivy League URL in Ingest Script

The ingest script has wrong Ivy League URL (`live.athletic.net/meets/44649`). Should be `armorytrack.live/meets/58419`.

**File:** `scripts/ingest_d1_indoor_2026.sh:75-76`

Change:
```bash
ingest --url "https://live.athletic.net/meets/44649" \
```
To:
```bash
ingest --url "https://armorytrack.live/meets/58419" \
```

---

## Phase 1: Remaining D1 Conference Ingestion (dedicated session)

**Goal:** Ingest 2 remaining conferences with splits + assess NEC.

**Session context:** Run from `cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace`. Always use `/usr/bin/python3`.

### Task 1.1: Ivy League (legacy_spa — straightforward)

```bash
/usr/bin/python3 py/pace_ingest_meet.py \
  --url "https://armorytrack.live/meets/58419" \
  --auto --season indoor \
  --meet-name "2026 Ivy League Indoor Championships" \
  --date "2026-02-22" --data-root py/data
```

Expected: legacy_spa provider, should discover and ingest distance events (800m, Mile, 3000m, 5000m). If `armorytrack.live` isn't in `detect_provider()`, add it — but it's already listed in HANDOFF as a known legacy_spa domain.

### Task 1.2: MVC / Missouri Valley (pttiming — two-step)

**Step 1 — Scrape all events via Firebase REST:**
```bash
/usr/bin/python3 py/pace_ingest.py \
  --url "https://live.pttiming.com/?mid=8717" \
  --data-root py/data
```
This populates cache at `py/data/8717_*/`.

**Step 2 — Identify distance events:**
```bash
ls py/data/8717_*/split_report.json 2>/dev/null | head -20
```
Look for events with SPD data (has_spd=True). Distance events: 800m, Mile, 3000m, 5000m, DMR.

**Step 3 — Upload each distance event:**
For each distance event `{enr}`, run:
```bash
/usr/bin/python3 py/pace_upload.py \
  --data-root py/data \
  "py/data/8717_{enr}_1/pace_normalized.json" \
  --meta '{"id":"8717_{enr}_1","provider":"pttiming","name":"2026 Missouri Valley Indoor Championships {EVENT}","season":"indoor","meet_name":"2026 Missouri Valley Indoor Championships","meet_date":"2026-03-01","gender":"{M or W}","distance":"{DISTANCE}"}'
```

Follow the Big 12 (`mid=8683`) and Big Ten (`mid=8715`) patterns in the cached data for exact field values.

**Note:** DMR relay events may fail due to the known empty-team bug. Skip relay failures — don't try to fix.

### Task 1.3: NEC Assessment

**Status:** No live results with splits. Only raw finish times at:
`https://ny.milesplit.com/meets/731484-nec-indoor-championships-2026/results/1250843/raw`

**Options (in priority order):**
1. **Skip for now** — NEC athletes will appear in NCAA results if we ingest those later
2. **Manual entry** — Extract finish times from the raw page, create a minimal pace_normalized.json with no splits. Low value, high effort.
3. **New scraper** — Build a `milesplit_com` provider for static results pages. Overkill for one conference.

**Recommendation:** Skip NEC for indoor 2026. Same for Big South (tfmeetpro, no splits). Focus on conferences with actual split data.

### Task 1.4: Post-Ingestion Division Tagging

After ingesting Ivy League and MVC, their events won't have division set (pipeline doesn't write it yet). Run in Supabase SQL Editor:

```sql
UPDATE events SET division = 'D1'
WHERE division IS NULL AND (
  name ILIKE '%Ivy League%'
  OR name ILIKE '%Missouri Valley%'
);
```

---

## Phase 2: Pipeline Script Updates (dedicated development session)

**Goal:** Update ingest pipeline so future ingestions automatically capture division, location, and altitude. This must be done BEFORE Phase 3 re-ingestion.

### Task 2.1: Add `--division` Flag to Pipeline

**Files to modify:**
- `py/pace_ingest_meet.py` — add `--division` argument, pass to event_meta
- `py/pace_upload.py` — write `division` from meta to event_row
- `scripts/ingest_d1_indoor_2026.sh` — add `--division D1` to all commands

**pace_ingest_meet.py** changes (after line 126):
```python
ap.add_argument("--division", default="", choices=["", "D1", "D2"], help="NCAA division")
```

In `extra_meta` dict (line 173-178), add:
```python
"division": args.division,
```

In `ingest_event()` event_meta dict (line 52-60), add:
```python
"division": extra_meta.get("division", ""),
```

**pace_upload.py** changes (event_row dict, after line 72):
```python
"division": meta.get("division") or None,
```

### Task 2.2: Location Extraction from Scrapers

**Analysis needed first:** Check which timing providers include venue/location info in their HTML/JSON. Likely candidates:
- `legacy_spa` — AthleticLIVE pages often show venue in page header
- `flashresults` — meet header often has city/venue
- `pttiming` — Firebase JSON may have venue field
- `trackscoreboard_html` — meet page header

**Approach:** For each provider's `capture_*()` function in `pace_scraper.py`, check if venue/location is available and extract it alongside split data. Return it in the scraper output dict.

**Fallback:** If location can't be auto-extracted, populate manually during ingestion with `--location "City, State"`. Create a reference mapping file (`docs/conference-locations.md`) with known venues.

### Task 2.3: Add Altitude Field

**Migration** (`supabase/migrations/005_add_altitude.sql`):
```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS altitude_m integer;
-- Altitude in meters above sea level. Used for performance context.
-- e.g., Albuquerque = 1520m, Birmingham = 192m, sea level = 0m
```

**Altitude lookup utility** (`py/pace_altitude.py`):
- Input: location string (e.g., "Birmingham, AL")
- Output: altitude in meters
- Approach: hardcoded mapping of known NCAA venues to altitude. ~40 entries covers all conference championship venues.
- For unknown locations: prompt user (as you requested)

**Example mapping:**
```python
VENUE_ALTITUDE = {
    "Albuquerque, NM": 1520,
    "Birmingham, AL": 192,
    "Boston, MA": 6,
    "Fayetteville, AR": 427,
    "Geneva, OH": 210,
    "Louisville, KY": 142,
    "New York, NY": 10,
    "Seattle, WA": 54,
    # ... expand as needed
}
```

### Task 2.4: Verify Year Filtering

**Current state:** `events.date` is DATE type. Frontend can extract year with:
```typescript
const year = new Date(event.date).getFullYear();
```

**Options:**
1. **Frontend-only:** Add year filter dropdown that filters client-side after fetching events. Simplest.
2. **DB computed column:** `ALTER TABLE events ADD COLUMN year integer GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED;` — enables server-side filtering.

**Recommendation:** Option 2 (computed column) is cleaner. Add to the Phase 2 migration batch:
```sql
ALTER TABLE events ADD COLUMN IF NOT EXISTS year integer
  GENERATED ALWAYS AS (EXTRACT(YEAR FROM date)) STORED;
CREATE INDEX IF NOT EXISTS idx_events_year ON events(year);
```

---

## Phase 3: Data Re-ingestion for Enrichment (dedicated session)

**Goal:** Backfill division, location, and altitude for all ~375 existing events using cached data. NO new scraping needed.

**Prerequisite:** Phase 2 pipeline updates complete.

### Task 3.1: Division Backfill Verification

Division was already backfilled via SQL in Phase 0. Verify:
```sql
SELECT division, COUNT(*) FROM events GROUP BY division ORDER BY division;
-- Expected: D1 ~250+, D2 ~120+, NULL = 0 (or handful of edge cases)
```

Fix any NULLs manually.

### Task 3.2: Location Backfill

**Strategy:** Two-part approach.

**Part A — Known conference venue mapping** (manual, one-time):
Create `docs/conference-locations.md` with all conference championship venues:

| Conference | Venue | City, State |
|---|---|---|
| ACC | Virginia Tech Rector Field House | Blacksburg, VA |
| Big 12 | Lied Recreation Center | Lincoln, NE |
| SEC | CrossPlex | Birmingham, AL |
| ... | ... | ... |

**Part B — SQL backfill using conference names:**
```sql
UPDATE events SET location = 'Birmingham, AL'
WHERE location IS NULL AND name ILIKE '%SEC Indoor%';
-- Repeat for each conference
```

**For unknowns:** The plan author will prompt you for manual lookup.

### Task 3.3: Altitude Backfill

Once locations are populated and `altitude_m` column exists:
```sql
UPDATE events SET altitude_m = 192 WHERE location = 'Birmingham, AL';
UPDATE events SET altitude_m = 1520 WHERE location = 'Albuquerque, NM';
-- etc.
```

Or run the `pace_altitude.py` lookup utility as a batch script.

### Task 3.4: Re-upload with Enriched Metadata (if needed)

If any metadata can't be backfilled via SQL alone (e.g., location needs to come from scraper output), use `pace_renormalize_all.py` + batch re-upload:

```bash
/usr/bin/python3 py/pace_renormalize_all.py --data-root py/data --force
# Then re-upload with updated metadata
```

**Important:** Uploads are upsert-safe (ON CONFLICT source_id). Re-uploading updates metadata without duplicating data.

---

## Phase 4: Frontend Enhancements (can parallel with Phase 3)

### Task 4.1: Verify Division Filter Works End-to-End

After Phase 0 migration: click D1/D2 toggles on live site, confirm events filter correctly.

### Task 4.2: Year Filter (optional, if computed column added)

Add year dropdown to `AthleteSearch.tsx` alongside existing filters. Query `getEvents()` with year filter.

### Task 4.3: Altitude Display (optional)

Show altitude badge on event cards or in legend tooltip. Useful for coaches comparing sea-level vs altitude performances.

---

## Recommended Session Sequence

```
Session 0 (NOW):     Phase 0 — Division migration + push + Ivy URL fix
Session 1 (ASAP):    Phase 1 — Ivy League + MVC ingestion
Session 2:           Phase 2 — Pipeline script updates (--division, location, altitude)
Session 3:           Phase 3 — Re-ingestion/backfill (division verify, location, altitude)
Session 4 (optional): Phase 4 — Frontend year/altitude enhancements
```

**Sessions 2-4 can be batched** if context window allows. Phases 2+3 are tightly coupled (scripts must be updated before re-ingestion). Phase 4 is independent.

**Parallel agent opportunities:**
- Phase 1 tasks 1.1 (Ivy League) and 1.2 (MVC) are independent — can run in parallel
- Phase 2 tasks 2.1 (--division flag) and 2.3 (altitude migration) are independent
- Phase 3 tasks 3.2 (location backfill) and 3.3 (altitude backfill) must be sequential (altitude depends on location)
- Phase 4 is fully independent of Phases 2-3

---

## Not In Scope

- **NEC ingestion** — no live results with splits; skip for indoor 2026
- **Big South ingestion** — no splits in source (tfmeetpro); skip
- **DMR relay upload bug fix** — known issue, skip relay failures
- **Outdoor season** — separate plan once outdoor meets are posted
- **NCAA Championship meet ingestion** — separate session once meet is complete (March 13-14)

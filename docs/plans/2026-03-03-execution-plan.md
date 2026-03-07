# PACE Execution Plan — March 3, 2026

> Executable plan for a Sonnet-based Claude Code session.
> Read `docs/HANDOFF.md` first for current state context.

---

## Session Setup

**Model:** Sonnet (cost-efficient for implementation work)
**Working directory:** `/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace/`
**Python:** `/usr/bin/python3` (system Python 3.9 — the `.venv` is broken, don't use it)
**Credentials:** `py/.env` has Supabase service key; `apps/web/.env.local` has anon key

---

## Phase 1: Expand Provider Support & Meet-Level Discovery

**Goal:** Make the scraper handle all D2 conference URLs, then build a meet-level discovery command.

### Task 1.1: Add AthleticLIVE White-Label Domains to Scraper

Most "new" conference URLs are just AthleticLIVE white-label sites. They use the same SPA framework and XHR patterns as `legacy_spa`.

**File:** `py/pace_scraper.py` — `detect_provider()` function (~line 124)

Add these domains to the `legacy_spa` detection list:
```
live.athletictiming.net    (GNAC)
live.jdlfasttrack.com      (Conference Carolinas)
live.timinginc.com         (Peach Belt)
blueridgetiming.live       (MEAC)
live.fstiming.com          (GLIAC)
live.herostiming.com       (NSIC)
live.athletic.net          (G-MAC)
live.dcracetiming.com      (SIAC — test this one, may differ)
```

**Verification:** For each new domain, run the scraper on one event URL and confirm it captures `split_report.json` and `ind_res_list.json`. If a domain doesn't work as `legacy_spa`, note it for custom provider work later.

**Skip for now:**
- `snapresults.snaptiming.com` (CIAA) — different provider entirely, needs custom handler
- `lancer.trackscoreboard.com` (NE10) — `trackscoreboard` provider exists but normalizer produces empty splits
- `lasttimeout.anet.live` (MIAA) — user says skip, weird distances

### Task 1.2: Build Meet-Level Event Discovery Script

**Create:** `py/pace_discover.py`

This script takes a meet URL, opens it with Playwright, and lists all events with classification.

```python
"""
Usage:
  python pace_discover.py --url "https://live.rapidresultstiming.com/meets/62216"
  python pace_discover.py --url "..." --distance-only
  python pace_discover.py --url "..." --json

Output: table of events with columns:
  EVENT_ID | TYPE (individual/relay) | NAME | GENDER | DISTANCE | CATEGORY (distance/sprint/field/other)
"""
```

**Event classification logic** (regex on event name text):
```python
DISTANCE_EVENTS = r'(800|1500|Mile|3000|5000|5K|10000|10K|DMR|4x800|4x1600)'
GENDER_PATTERNS = {
    'Men': r'\bM(en)?\b|Men\'?s|Boys',
    'Women': r'\bW(omen)?\b|Women\'?s|Girls'
}
# If name contains "Prelim" → mark as prelim
# If name contains "Final" or no qualifier → mark as final
```

**Implementation approach:**
- Reuse the Playwright discovery snippet from HANDOFF.md (the inline script that lists event links)
- Parse each event link: extract event ID, determine if `/relay/` or `/individual/`
- Apply classification regex to the event name text
- Output as formatted table (default) or JSON (`--json`)
- `--distance-only` flag filters to distance events only

### Task 1.3: Build Meet-Level Batch Ingest Script

**Create:** `py/pace_ingest_meet.py`

This wraps discovery + the existing `pace_ingest.py` pipeline.

```bash
# Interactive: discover events, user picks which to ingest
python pace_ingest_meet.py --url "https://live.rapidresultstiming.com/meets/62216"

# Auto: ingest all distance events
python pace_ingest_meet.py --url "..." --auto

# With metadata
python pace_ingest_meet.py --url "..." --auto --meet-name "2026 RMAC Indoor Championships" --date "2026-02-28" --season indoor
```

**Flow:**
1. Run discovery (Task 1.2) to get event list
2. In `--auto` mode: filter to distance events only, process all
3. In interactive mode: print event list, let user type event IDs to include (comma-separated)
4. For each selected event:
   a. Construct full event URL (meet_base + `/events/individual/EVENT_ID` or `/events/relay/EVENT_ID`)
   b. Run: scrape → normalize → validate → upload (using existing scripts via subprocess or direct import)
   c. Auto-populate event metadata: name, gender, distance, season, date (parsed from classification + CLI args)
5. Print summary: N events ingested, any failures

### Task 1.4: Auto-Populate Event Metadata in Uploader

**File:** `py/pace_upload.py`

Currently event metadata (name, distance, gender, season, date) must be manually set after upload. Fix this:

- Accept `--meta` JSON with fields: `name`, `distance`, `gender`, `season`, `date`, `location`
- The meet-level ingest script (Task 1.3) will generate this metadata from the event classification
- The uploader should merge these into the event upsert

**The `--meta` flag already exists** in `pace_upload.py` but the defaults are empty. The fix is to make `pace_ingest_meet.py` generate and pass proper metadata based on the event name classification from Task 1.2.

### Task 1.5: Handle Prelims vs Finals

**Context:** 800m and Mile at conference meets often have prelims + finals. Both performances should be in the DB but distinguishable.

**Approach:**
- In `pace_discover.py` classification: detect "Prelim" / "Final" / "Heat" in event name
- Store as part of event name in DB (e.g., "800m Prelims", "800m Final")
- The frontend DistanceSelector already groups by distance — prelims and finals will appear as separate events under the same distance
- No schema changes needed — the `events.name` field already supports this

---

## Phase 2: Ingest All RMAC Distance Events

**Goal:** Get 800m, Mile, 3000m data from RMAC meet into Supabase.

### Task 2.1: Discover RMAC Distance Events

Run the discovery script (from Phase 1) on `https://live.rapidresultstiming.com/meets/62216`.

If Phase 1 isn't complete yet, use the inline Playwright snippet from HANDOFF.md:
```bash
cd py && python3 << 'PYEOF'
# ... (snippet from HANDOFF.md)
PYEOF
```

Look for: Men/Women 800m, Mile, 3000m event IDs. Note which are prelims vs finals.

### Task 2.2: Batch Ingest

If `pace_ingest_meet.py` is ready:
```bash
cd py
python3 pace_ingest_meet.py --url "https://live.rapidresultstiming.com/meets/62216" \
  --auto --meet-name "2026 RMAC Indoor Championships" --date "2026-02-28" --season indoor
```

If not, use manual batch:
```bash
cd py
for eid in EVENT_ID_1 EVENT_ID_2 ...; do
    python3 pace_scraper.py --url "https://live.rapidresultstiming.com/meets/62216/events/individual/$eid" --outdir data
    python3 pace_normalize.py --root data --event-id "$eid" --force
    python3 pace_validate.py "data/$eid/pace_normalized.json"
    python3 pace_upload.py "data/$eid/pace_normalized.json"
done
```

Then manually update metadata for each event in Supabase.

### Task 2.3: Verify in Frontend

```bash
cd apps/web && npm run dev
```

Check that new distances appear in the DistanceSelector dropdown, athletes load, and charts render with correct split counts (different for each distance).

---

## Phase 3: Frontend Visualization Upgrades

**Goal:** Pan/zoom, pace deviation view, improved multi-distance handling.

### Task 3.1: Zoom/Pan on Split Chart

**File:** `apps/web/src/components/SplitChart.tsx`

**Approach:** Use Recharts built-in `<Brush>` component for X-axis range selection + Y-axis domain auto-scaling.

```tsx
import { Brush } from 'recharts';

// Inside <LineChart>:
<Brush dataKey="label" height={20} stroke="#8884d8" />
```

This gives a draggable range selector at the bottom of the chart. When the user narrows the range, the Y-axis auto-scales to the visible data, making tight pace differences visible.

**Additionally:** Add a Y-axis padding calculation that zooms to the data range:
```tsx
// Instead of auto domain, compute:
const allValues = visibleData.flatMap(d => athletes.map(a => d[a.id])).filter(Boolean);
const yMin = Math.min(...allValues);
const yMax = Math.max(...allValues);
const padding = (yMax - yMin) * 0.1;
// Set YAxis domain={[yMin - padding, yMax + padding]}
```

### Task 3.2: Pace Deviation View

**File:** `apps/web/src/components/SplitChart.tsx` (add toggle)

**Concept:** Instead of raw lap times, show deviation from a baseline (leader's pace or field average). This makes 0.2s differences between tightly-packed runners dramatically visible.

**Implementation:**
1. Add a toggle button above the chart: "Raw Splits" | "Pace Deviation"
2. In deviation mode:
   - Compute baseline: average lap time across all visible athletes per split
   - For each athlete at each split: `deviation = athlete_lap_s - baseline_lap_s`
   - Y-axis becomes "+/- seconds from average" (0 line = average pace)
   - Positive = slower than average, negative = faster
3. Y-axis label changes to "Deviation (sec)" with 0 line highlighted
4. Tooltip shows: deviation value + raw lap time

**Store the toggle in component state** (not Zustand — it's per-window).

### Task 3.3: Chart Height & Responsiveness

**File:** `apps/web/src/components/SplitChart.tsx`

Currently hardcoded to 240px height. Make it responsive:
- Minimum 240px, grow to fill available window space
- Use `flex-1` on the chart container within the PaceWindow layout

### Task 3.4: Distance-Aware Split Labels

**File:** `apps/web/src/components/SplitChart.tsx`

Different distances have different split patterns:
- 5000m indoor: 25 splits at 200m intervals → labels get crowded
- 800m: 2-4 splits → plenty of space
- Mile: 4 splits at 400m → clean

**Fix:** For >10 splits, only show every Nth label on the X-axis:
```tsx
<XAxis
  dataKey="label"
  interval={data.length > 12 ? Math.floor(data.length / 8) : 0}
/>
```

---

## Phase 4: Ingest Additional Conferences

**Goal:** Batch-ingest distance events from all supported D2 conference meets.

### Task 4.1: Test Each Conference URL

For each URL in `docs/d2 indoor conf urls 2026.md`, verify the scraper works:

**Expected to work (AthleticLIVE white-labels, after Task 1.1):**
- Gulf South (`live.xpresstiming.com`) — already supported
- GNAC (`live.athletictiming.net`)
- Conference Carolinas (`live.jdlfasttrack.com`)
- Peach Belt (`live.timinginc.com`)
- MEAC (`blueridgetiming.live`)
- GLIAC (`live.fstiming.com`)
- NSIC (`live.herostiming.com`)
- G-MAC (`live.athletic.net`)
- SIAC (`live.dcracetiming.com`)

**Needs custom work:**
- CIAA (`snapresults.snaptiming.com`) — new provider, defer
- NE10 (`lancer.trackscoreboard.com`) — provider exists but normalizer gives empty splits, defer

**Skip:**
- MIAA (`lasttimeout.anet.live`) — weird distances per user

### Task 4.2: Batch Ingest All Working Conferences

Use `pace_ingest_meet.py --auto` for each working conference URL.

```bash
cd py
for meet_url in \
  "https://live.xpresstiming.com/meets/61291" \
  "https://live.athletictiming.net/meets/60709" \
  "https://live.jdlfasttrack.com/meets/54381" \
  "https://live.timinginc.com/meets/15171" \
  "https://blueridgetiming.live/meets/60633" \
  "https://live.fstiming.com/meets/62261" \
  "https://live.herostiming.com/meets/59934" \
  "https://live.athletic.net/meets/62706/events"; do
    echo "=== Ingesting $meet_url ==="
    python3 pace_ingest_meet.py --url "$meet_url" --auto --season indoor
done
```

---

## Phase 5 (Future): Admin UI & User Submissions

**Not in scope for immediate sessions. Outline only.**

### 5.1: Admin URL Paste Page
- Authenticated route (Supabase auth, your account only)
- Text input for meet URL → calls `pace_ingest_meet.py` via API endpoint or serverless function
- Shows progress/results

### 5.2: User Submission Form
- Public page with form: Name, Email, Meet URL, Notes
- Stores in `submissions` table in Supabase
- You review in Supabase dashboard or admin UI

### 5.3: Year/Season/Gender Filters
- Frontend: add filter dropdowns above or alongside DistanceSelector
- Backend: `db.ts` already supports `getEvents({gender, distance, season})` — just needs UI

---

## Agent Strategy for Execution

### Recommended approach per phase:

| Phase | Model | Parallel Agents? | Est. Turns |
|-------|-------|-------------------|------------|
| 1 (Provider + Discovery) | Sonnet | Yes: 1 agent for domain additions, 1 for discovery script, 1 for meet ingest script | ~40-60 |
| 2 (RMAC Ingest) | Sonnet | No — sequential pipeline | ~15-20 |
| 3 (Frontend Viz) | Sonnet | Yes: 1 for zoom/brush, 1 for deviation view | ~30-40 |
| 4 (Conference Ingest) | Sonnet | Yes: parallel agents per conference | ~30-40 |
| 5 (Admin UI) | Sonnet | No — sequential | ~40-60 |

### Token budget awareness:
- **Flag before:** Any operation that reads >5 files or runs Playwright (browser automation)
- **Prefer:** Direct file edits over exploratory reads (plan tells you exactly which files to edit)
- **Subagents:** Use Haiku for file lookups, Sonnet for implementation

### Session boundaries:
- **Session 1:** Phase 1 + Phase 2 (provider support + RMAC ingest)
- **Session 2:** Phase 3 (frontend visualization upgrades)
- **Session 3:** Phase 4 (batch conference ingest)
- **Session 4+:** Phase 5 (admin UI, future features)

---

## Key Files Reference

```
py/pace_scraper.py        ← Edit: add domains to detect_provider()
py/pace_normalize.py      ← May need tweaks for new provider quirks
py/pace_validate.py       ← No changes expected
py/pace_upload.py         ← Already has --meta flag, ensure it works
py/pace_ingest.py         ← Existing orchestrator (single-event)
py/pace_discover.py       ← CREATE: meet-level event discovery
py/pace_ingest_meet.py    ← CREATE: meet-level batch ingest

apps/web/src/components/SplitChart.tsx    ← Edit: zoom, deviation view
apps/web/src/components/DistanceSelector.tsx  ← May need filter additions
apps/web/src/lib/db.ts                    ← May need new query functions
```

---

## Pre-Flight Checklist (for the executing session)

1. `cd /Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace/`
2. Confirm `py/.env` exists with `SUPABASE_URL` and `SUPABASE_SERVICE_KEY`
3. Confirm `/usr/bin/python3 --version` returns 3.9+
4. Confirm `playwright` is installed: `/usr/bin/python3 -c "from playwright.sync_api import sync_playwright; print('ok')"`
5. Confirm Supabase is accessible: `/usr/bin/python3 -c "from dotenv import load_dotenv; load_dotenv('py/.env'); import os; from supabase import create_client; sb = create_client(os.environ['SUPABASE_URL'], os.environ['SUPABASE_SERVICE_KEY']); print(sb.table('events').select('id').limit(1).execute())"`
6. Read this plan and `docs/HANDOFF.md` for full context

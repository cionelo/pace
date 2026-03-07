# Session Prompt — NE10 + Indoor Peach Belt + CIAA

## Context

PACE is a D2 collegiate distance race split visualization tool.
Working directory: `/Users/ncionelo/Downloads/JOBS/FOR GITHUB/PACE/pace/`
Python: `/usr/bin/python3` (system 3.9 — the `.venv` is broken, don't use it)
Credentials: `py/.env` — has SUPABASE_URL and SUPABASE_SERVICE_KEY

Full pipeline: `pace_discover.py` → `pace_scraper.py` → `pace_normalize.py` → `pace_validate.py` → `pace_upload.py`
All orchestrated by: `pace_ingest_meet.py --auto`

All ingest commands must include `--data-root py/data` (cached scrape data lives there).
Cache is automatic — scraper skips browser launch if JSON files already exist.

Read `docs/HANDOFF.md` for architecture and pipeline details before starting.

---

## The Three Platforms

These three conference meets use platforms that are **not standard AthleticLIVE**
and require investigation/scraper support before ingesting.

### 1. CIAA — AthleticLIVE with tab navigation
URL: `https://snapresults.snaptiming.com/meets/61469`
Platform: IS AthleticLIVE (legacy_spa), but the scraper domain isn't in `detect_provider()` yet.
Issue: Meet uses [Track - Day 1], [Track - Day 2] tab navigation (not the typical single-day layout).
The btn-secondary day-button clicking in `pace_discover.py` should handle these tabs, but needs verification.

### 2. Indoor Peach Belt — halfmiletiming.com
URL: `http://live.halfmiletiming.com/meets/895/events`
Platform: Unknown. Not AthleticLIVE. Splits may be in XHR responses (not HTML-rendered).
Note: `/events` suffix in URL — handle in discover if needed (same as G-MAC pattern).

### 3. NE10 — lancer.trackscoreboard.com
URL: `https://lancer.trackscoreboard.com/meets/458/events`
Platform: TrackScoreboard, but on `lancer` subdomain (existing scraper only handles `rt.trackscoreboard.com`).
Note: Prelims exist for 800m and Mile. Both prelim + final should be separate events with separate source_ids.
Note: `/events` suffix in URL — handle in discover if needed.
Note: User believes both NE10 and Peach Belt may even record relay splits — worth checking.

---

## TASK 1 — CIAA

### Step 1: Add snapresults.snaptiming.com to detect_provider()

File: `py/pace_scraper.py`, function `detect_provider()` (~line 124)

Add `"snapresults.snaptiming.com"` to the `legacy_spa` detection block alongside the other AthleticLIVE domains.

### Step 2: Verify discovery

```bash
python3 py/pace_discover.py --url "https://snapresults.snaptiming.com/meets/61469" --distance-only
```

Expected: Men/Women 800m, Mile, 3000m, 5000m — for both Day 1 and Day 2 tabs.

If events are missing:
- Run `python3 py/diag_days.py --url "https://snapresults.snaptiming.com/meets/61469"` to inspect tab structure
- If CIAA's tabs use different selectors than `button.btn-secondary`, extend `discover_events()` in `pace_discover.py` to also click those selectors
- Any fix must remain generic (no hardcoded URL logic)

### Step 3: Ingest

```bash
python3 py/pace_ingest_meet.py \
  --url "https://snapresults.snaptiming.com/meets/61469" \
  --auto --season indoor \
  --meet-name "2026 CIAA Indoor Championships" \
  --date "2026-02-21" \
  --data-root py/data
```

---

## TASK 2 — Indoor Peach Belt (halfmiletiming.com)

### Step 1: Investigate the platform

Open the page and intercept network traffic to understand what JSON the platform serves.
Run the scraper in headful mode on a known event URL (if one is visible) to capture XHR:

```bash
# First, just navigate and check what events exist
python3 py/pace_discover.py \
  --url "http://live.halfmiletiming.com/meets/895/events" \
  --distance-only
```

If discover returns 0 events, the page structure likely differs from AthleticLIVE.
In that case, run a manual Playwright inspection to find event links:

```python
# Quick manual discovery
import asyncio
from playwright.async_api import async_playwright

async def inspect():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)  # headful to see what loads
        page = await browser.new_page()
        page.on("response", lambda r: print(r.url) if "api" in r.url.lower() or "json" in r.url.lower() else None)
        await page.goto("http://live.halfmiletiming.com/meets/895/events", wait_until="domcontentloaded")
        await page.wait_for_timeout(5000)
        # Print all hrefs
        links = await page.evaluate("() => Array.from(document.querySelectorAll('a')).map(a => a.href)")
        for l in links:
            if "event" in l.lower():
                print(l)
        input("Press enter to close")
        await browser.close()

asyncio.run(inspect())
```

### Step 2: Implement scraper support

Based on what you find:

**Case A — XHR/JSON (split_report-style data)**:
Add `"live.halfmiletiming.com"` to `detect_provider()` as `legacy_spa`. Then test a single event
with the scraper and verify split data is captured.

**Case B — Different JSON structure**:
Add a new provider branch in `pace_scraper.py`. Follow the pattern of existing providers
(detect → capture → write_event_bundle). Add to `detect_provider()` with a new key string.

**Case C — No splits available**:
If the platform renders splits as HTML only (no XHR), note this and skip — we only store
lap split data that comes from machine-readable sources.

### Step 3: Verify discover + ingest

Once scraper support is confirmed:

```bash
python3 py/pace_discover.py \
  --url "http://live.halfmiletiming.com/meets/895/events" \
  --distance-only

python3 py/pace_ingest_meet.py \
  --url "http://live.halfmiletiming.com/meets/895/events" \
  --auto --season indoor \
  --meet-name "2026 Peach Belt Indoor Championships" \
  --date "2026-02-21" \
  --data-root py/data
```

---

## TASK 3 — NE10 (lancer.trackscoreboard.com)

The existing `trackscoreboard` provider in `pace_scraper.py` handles `rt.trackscoreboard.com`.
`lancer.trackscoreboard.com` is a different subdomain — confirm whether it uses the same
API/XHR patterns before assuming it works.

### Step 1: Investigate the platform

```bash
# Test discovery
python3 py/pace_discover.py \
  --url "https://lancer.trackscoreboard.com/meets/458/events" \
  --distance-only
```

If 0 events: the AthleticLIVE `a[href*="/events/"]` selector doesn't match.
Run a headful Playwright inspection (same pattern as Peach Belt above) to find event link structure.

### Step 2: Add lancer.trackscoreboard.com to detect_provider()

File: `py/pace_scraper.py`, function `detect_provider()` (~line 124)

Add `"lancer.trackscoreboard.com"` to the `trackscoreboard` detection block (alongside `rt.trackscoreboard.com`).

If the scraper's `capture_trackscoreboard()` function doesn't capture data from lancer's API,
inspect the XHR URLs (look for `result` and `split` patterns in network requests) and update
`_looks_like_ts_json()` accordingly.

### Step 3: Discover and classify prelims

NE10 has prelims for 800m and Mile. Verify that discover correctly labels them:
- "Men 800m Prelims" → round=Prelim, source_id distinct from "Men 800m Finals"
- Both should upload as separate events (upsert on source_id is safe)

### Step 4: Ingest

```bash
python3 py/pace_ingest_meet.py \
  --url "https://lancer.trackscoreboard.com/meets/458/events" \
  --auto --season indoor \
  --meet-name "2026 NE10 Indoor Championships" \
  --date "2026-02-22" \
  --data-root py/data
```

---

## Relay splits note

The user believes NE10 and Peach Belt platforms may record relay splits (unlike some AthleticLIVE sites).
If relay events appear in discovery results with category=distance (e.g., DMR, 4x800),
attempt to ingest them — the normalizer already handles relay data from both split_report and ind_res_list.
If relay data is empty (no athletes, validator blocks), note it but don't block the session.

---

## After all ingests complete

Verify in Supabase (run in `py/` with dotenv loaded):

```python
from dotenv import load_dotenv; load_dotenv()
import os
from supabase import create_client
sb = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_KEY"))
rows = sb.table("events").select("name,gender,distance,season,date").order("date", desc=True).limit(20).execute()
for r in rows.data:
    print(r)
```

Expected new events: CIAA (Men/Women 800m, Mile, 3000m, 5000m + prelims), Peach Belt (same),
NE10 (same + prelim/final variants).

---

## Known issues / don't fix in this session

- GNAC Men 4000mDMR (`382102`): timing error in source data (21.7s split). Blocked by validator. Leave as-is.
- G-MAC Men/Women DMR: no athletes in scraped data. Known relay capture gap. Leave as-is.
- `discover_events()` classifies "Dec 1500m" (decathlon component) as distance event — minor false positive, harmless.
- The `(M)`/`(W)` suffix in frontend dropdowns is slightly redundant since "Men"/"Women" is in the event name — cosmetic only, do not fix.

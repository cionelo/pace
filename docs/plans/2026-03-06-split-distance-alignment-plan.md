# Split Distance Alignment Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable cross-conference athlete overlay by adding `distance_m` to every split and aligning charts by distance instead of label.

**Architecture:** Backend post-processing function `add_distance_m()` infers the meter distance of each split from race distance + split count + season. DB gets a `distance_m` column. Frontend replaces label-based chart alignment with distance-based alignment + linear interpolation. A batch script re-processes all ~120 cached events in parallel batches.

**Tech Stack:** Python 3.9 (backend), Supabase/Postgres (DB), React + TypeScript + Recharts (frontend)

**Session Structure:**
```
Session 1A (normalizer) --+-- parallel --> Verify --> Session 2 (batch script) --> User runs batches
Session 1B (DB+uploader) -+                                |
                                                           v
                                                   Session 3A (chart) --+-- parallel --> Session 4 (verify)
                                                   Session 3B (types)  -+
```

---

## Session 1A: Normalizer -- add_distance_m()

**Dispatch as:** Worktree agent or parallel session
**No dependencies**

### Task 1: Add `parse_label_distance_m()` helper

**Files:**
- Modify: `py/pace_normalize.py` (add after line 131, before `normalize_event`)

**Step 1: Write the function**

Add a helper that parses distance-labeled splits ("200M", "1K", "1.6K", "3K") into meters:

```python
import re

def parse_label_distance_m(label: str) -> Optional[float]:
    """Parse a distance label like '200M', '1K', '1.6K' into meters. Returns None if not parseable."""
    label = label.strip().upper()
    # Match patterns: "200M", "1K", "1.6K", "3000M", "1600M"
    m = re.match(r'^(\d+(?:\.\d+)?)\s*(M|K|KM)$', label)
    if not m:
        return None
    val = float(m.group(1))
    unit = m.group(2)
    if unit == 'M':
        return val
    if unit in ('K', 'KM'):
        return val * 1000
    return None
```

**Step 2: Verify manually**

```bash
cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace
python3 -c "
from py.pace_normalize import parse_label_distance_m
assert parse_label_distance_m('200M') == 200
assert parse_label_distance_m('1K') == 1000
assert parse_label_distance_m('1.6K') == 1600
assert parse_label_distance_m('3') is None
assert parse_label_distance_m('S1') is None
print('PASS')
"
```

**Step 3: Commit**
```bash
git add py/pace_normalize.py
git commit -m "feat(normalizer): add parse_label_distance_m helper"
```

---

### Task 2: Add `distance_str_to_meters()` helper

**Files:**
- Modify: `py/pace_normalize.py` (add after `parse_label_distance_m`)

**Step 1: Write the function**

Converts event distance strings like "3000m", "mile", "5K" to meters:

```python
DISTANCE_TO_METERS = {
    "800m": 800, "1500m": 1500, "mile": 1609, "1600m": 1600,
    "3000m": 3000, "3000mSC": 3000, "3K": 3000,
    "5000m": 5000, "5K": 5000,
    "6K": 6000, "8K": 8000, "10K": 10000, "10000m": 10000,
}

def distance_str_to_meters(distance: str) -> Optional[float]:
    """Convert an event distance string to meters."""
    if not distance:
        return None
    d = distance.strip()
    if d in DISTANCE_TO_METERS:
        return float(DISTANCE_TO_METERS[d])
    # Try parsing as raw number
    m = re.match(r'^(\d+(?:\.\d+)?)\s*m?$', d, re.IGNORECASE)
    if m:
        return float(m.group(1))
    return None
```

**Step 2: Verify**
```bash
python3 -c "
from py.pace_normalize import distance_str_to_meters
assert distance_str_to_meters('3000m') == 3000
assert distance_str_to_meters('mile') == 1609
assert distance_str_to_meters('5K') == 5000
assert distance_str_to_meters('') is None
print('PASS')
"
```

**Step 3: Commit**
```bash
git add py/pace_normalize.py
git commit -m "feat(normalizer): add distance_str_to_meters helper"
```

---

### Task 3: Add `add_distance_m()` post-processing function

**Files:**
- Modify: `py/pace_normalize.py` (add after `distance_str_to_meters`, before the CLI section at line 568)

**Step 1: Write the function**

This is the core logic. It takes a normalized pace.v1 dict + race distance + season and adds `distance_m` to each split.

```python
# Standard indoor track sizes for inferring lap distance
_KNOWN_LAP_DISTANCES = [200, 300, 400]

def add_distance_m(data: Dict[str, Any], race_distance_m: float,
                   season: Optional[str] = None) -> Dict[str, Any]:
    """
    Post-process a pace.v1 dict: add distance_m to every split.

    Strategy:
    1. If labels parse as distances (e.g. "200M", "1K"), use them directly.
    2. If labels are generic ("1", "2", ...), infer from race_distance_m + split count.
    3. Fallback: equal spacing.
    """
    for athlete in data.get("athletes", []):
        splits = athlete.get("splits", [])
        if not splits:
            continue

        # Try parsing labels first
        parsed = [parse_label_distance_m(s.get("label", "")) for s in splits]

        if all(p is not None for p in parsed):
            # Case 1: all labels have parseable distances
            for sp, d in zip(splits, parsed):
                sp["distance_m"] = d
            continue

        # Case 2: generic labels -- infer from race distance + split count
        n = len(splits)
        inferred = _infer_distances_from_count(n, race_distance_m, season)
        for sp, d in zip(splits, inferred):
            sp["distance_m"] = d

    return data


def _infer_distances_from_count(num_splits: int, race_distance_m: float,
                                 season: Optional[str] = None) -> List[float]:
    """
    Given N numbered splits and total race distance, infer distance_m for each.

    Indoor heuristic: first split is often a shorter start lap (e.g., 200m on a
    200m track where subsequent laps are also 200m, or 200m start on a 300m track).
    Try first_split + (N-1) * lap = race_distance for known lap sizes.

    Outdoor: 400m laps, first may be partial.
    XC: equal division.
    """
    if num_splits <= 0:
        return []
    if num_splits == 1:
        return [race_distance_m]

    # Try to find a known lap distance that works
    # Formula: first_split = race_distance - (num_splits - 1) * lap_distance
    # first_split must be > 0 and <= lap_distance
    for lap in _KNOWN_LAP_DISTANCES:
        first = race_distance_m - (num_splits - 1) * lap
        if 0 < first <= lap:
            return [first + i * lap if i == 0 else first + i * lap
                    for i in range(num_splits)]
            # Simpler: cumulative = first, first+lap, first+2*lap, ...

    # Fallback: equal spacing
    step = race_distance_m / num_splits
    return [step * (i + 1) for i in range(num_splits)]
```

**Note:** The `_infer_distances_from_count` return should be cumulative distances, simplified:

```python
def _infer_distances_from_count(num_splits: int, race_distance_m: float,
                                 season: Optional[str] = None) -> List[float]:
    if num_splits <= 0:
        return []
    if num_splits == 1:
        return [race_distance_m]

    for lap in _KNOWN_LAP_DISTANCES:
        first = race_distance_m - (num_splits - 1) * lap
        if 0 < first <= lap:
            return [first + i * lap for i in range(num_splits)]

    # Fallback: equal spacing
    step = race_distance_m / num_splits
    return [step * (i + 1) for i in range(num_splits)]
```

**Step 2: Verify with Ramon's data**

Ramon has 17 splits for a 5000m. Expected: first_split = 5000 - 16*300 = 200. So distances = [200, 500, 800, ..., 5000].

```bash
python3 -c "
from py.pace_normalize import add_distance_m, load_json
import json

data = load_json(__import__('pathlib').Path('py/data/2286816/pace_normalized.json'))
result = add_distance_m(data, 5000, 'indoor')
ramon = result['athletes'][0]
print(f'Athlete: {ramon[\"name\"]}')
for sp in ramon['splits']:
    print(f'  {sp[\"label\"]:>4}  distance_m={sp[\"distance_m\"]:>6.0f}  elapsed={sp[\"elapsed_s\"]:.2f}')
# Verify last split distance_m == 5000
assert ramon['splits'][-1]['distance_m'] == 5000, f'Expected 5000, got {ramon[\"splits\"][-1][\"distance_m\"]}'
print('PASS')
"
```

**Step 3: Verify with Colton's data (distance labels)**

```bash
python3 -c "
from py.pace_normalize import add_distance_m, load_json
import json

data = load_json(__import__('pathlib').Path('py/data/458_40_final/pace_normalized.json'))
result = add_distance_m(data, 5000, 'indoor')
colton = next(a for a in result['athletes'] if 'Sallum' in a.get('name',''))
print(f'Athlete: {colton[\"name\"]}')
for sp in colton['splits'][:5]:
    print(f'  {sp[\"label\"]:>6}  distance_m={sp[\"distance_m\"]:>6.0f}')
assert colton['splits'][0]['distance_m'] == 200
assert colton['splits'][4]['distance_m'] == 1000
print('PASS')
"
```

**Step 4: Commit**
```bash
git add py/pace_normalize.py
git commit -m "feat(normalizer): add_distance_m post-processing with inference"
```

---

### Task 4: Wire `add_distance_m` into normalizer CLI and ingest pipeline

**Files:**
- Modify: `py/pace_normalize.py` (CLI section, around line 570)
- Modify: `py/pace_ingest_meet.py` (around line 71, after normalize step)

**Step 1: Add `--distance` and `--season` flags to normalizer CLI**

In `pace_normalize.py` main(), after the argparse setup (line 573):

```python
ap.add_argument("--distance", help="Event distance (e.g. '3000m', 'mile', '5K') for distance_m inference")
ap.add_argument("--season", choices=["indoor", "outdoor", "xc"], help="Season for distance_m inference")
```

After `norm = normalize_event(event_id, sr, ir)` (line 614), add:

```python
        # Post-process: add distance_m if race distance is known
        race_m = distance_str_to_meters(args.distance) if args.distance else None
        if race_m:
            add_distance_m(norm, race_m, args.season)
```

**Step 2: Update `ingest_event()` in `pace_ingest_meet.py`**

After the normalize step succeeds (line 75), the distance is in `event_meta["distance"]`. Add distance_m as a post-processing step. Modify the normalize command (line 71-74) to pass `--distance` and `--season`:

```python
    # Step 2: Normalize
    normalize_cmd = [
        sys.executable, str(py_dir / "pace_normalize.py"),
        "--root", str(data_root), "--force",
    ]
    if event_meta.get("distance"):
        normalize_cmd += ["--distance", event_meta["distance"]]
    if event_meta.get("season"):
        normalize_cmd += ["--season", event_meta["season"]]
    if not run_step("NORMALIZE", normalize_cmd):
        print("[FAIL] Normalization failed")
        return False
```

**Step 3: Verify ingest pipeline still works end-to-end**

```bash
# Re-normalize a single event with distance info
python3 py/pace_normalize.py --root py/data --event-id 2286816 --force --distance 5000m --season indoor

# Check the output
python3 -c "
import json, pathlib
data = json.loads(pathlib.Path('py/data/2286816/pace_normalized.json').read_text())
sp = data['athletes'][0]['splits'][0]
assert 'distance_m' in sp, 'distance_m not found in split'
print(f'First split distance_m = {sp[\"distance_m\"]}')
print('PASS')
"
```

**Step 4: Commit**
```bash
git add py/pace_normalize.py py/pace_ingest_meet.py
git commit -m "feat: wire add_distance_m into normalizer CLI and ingest pipeline"
```

---

## Session 1B: DB Migration + Uploader

**Dispatch as:** Worktree agent or parallel session
**No dependencies. Parallel with Session 1A.**

### Task 5: Create DB migration

**Files:**
- Create: `supabase/migrations/002_add_distance_m.sql`

**Step 1: Write the migration**

```sql
-- Add distance_m column to splits table for distance-based chart alignment
ALTER TABLE splits ADD COLUMN distance_m numeric;
```

**Step 2: Apply migration**

```bash
cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace

# Connect to Supabase and run the migration
# Using the Supabase dashboard SQL editor, or:
python3 -c "
import os
from dotenv import load_dotenv
from supabase import create_client
load_dotenv('py/.env')
sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_KEY'))
sb.postgrest.schema('public')
# Run raw SQL via RPC or use dashboard
print('Run this SQL in Supabase Dashboard > SQL Editor:')
print('ALTER TABLE splits ADD COLUMN distance_m numeric;')
"
```

**Step 3: Verify column exists**

```bash
python3 -c "
import os
from dotenv import load_dotenv
from supabase import create_client
load_dotenv('py/.env')
sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_KEY'))
result = sb.table('splits').select('distance_m').limit(1).execute()
print('Column exists:', 'distance_m' in str(result))
print('PASS')
"
```

**Step 4: Commit**
```bash
git add supabase/migrations/002_add_distance_m.sql
git commit -m "feat(db): add distance_m column to splits table"
```

---

### Task 6: Update uploader to write distance_m

**Files:**
- Modify: `py/pace_upload.py:110-119` (splits insertion loop)

**Step 1: Add `distance_m` to split row construction**

In `pace_upload.py`, modify the splits_rows loop (line 111-118):

```python
        splits_rows = []
        for i, sp in enumerate(a.get("splits", [])):
            splits_rows.append({
                "result_id": result_id,
                "label": sp.get("label", f"S{i+1}"),
                "ordinal": i,
                "elapsed_s": sp.get("elapsed_s"),
                "lap_s": sp.get("lap_s"),
                "place": sp.get("place"),
                "distance_m": sp.get("distance_m"),  # NEW
            })
```

**Step 2: Verify by uploading a test event**

First ensure Session 1A's Task 3 output exists (Ramon with distance_m), then:

```bash
python3 py/pace_upload.py py/data/2286816/pace_normalized.json --meta '{"name":"Test Upload","distance":"5000m","gender":"Men","season":"indoor"}'
```

Then verify in Supabase:
```bash
python3 -c "
import os
from dotenv import load_dotenv
from supabase import create_client
load_dotenv('py/.env')
sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_KEY'))
result = sb.table('splits').select('label,distance_m').limit(5).not_.is_('distance_m', 'null').execute()
print(result.data)
assert len(result.data) > 0, 'No splits with distance_m found'
print('PASS')
"
```

**Step 3: Commit**
```bash
git add py/pace_upload.py
git commit -m "feat(uploader): write distance_m to splits table"
```

---

## Session 2: Batch Re-normalization Script

**Dispatch as:** Sequential session, after Sessions 1A + 1B verified and merged
**Depends on:** Session 1A (add_distance_m function), Session 1B (distance_m column in DB)

### Task 7: Build `pace_renormalize_all.py`

**Files:**
- Create: `py/pace_renormalize_all.py`

**Step 1: Write the script**

This script must be fully self-contained and runnable without Claude. It:
1. Queries Supabase for all events to get their `source_id -> (distance, season)` mapping
2. Walks `py/data/*/pace_normalized.json` files
3. Adds `distance_m` to each split using `add_distance_m()`
4. Re-validates
5. Re-uploads (splits only -- events/athletes/results already exist)
6. Supports `--batch N --total-batches M` for parallel execution

```python
#!/usr/bin/env python3
"""
pace_renormalize_all.py
Batch re-process all cached events to add distance_m to splits.

Usage:
  # Dry run (preview only, no upload):
  python3 pace_renormalize_all.py --data-root py/data --dry-run

  # Process all events:
  python3 pace_renormalize_all.py --data-root py/data

  # Parallel batches (run in 4 terminals):
  python3 pace_renormalize_all.py --data-root py/data --batch 1 --total-batches 4
  python3 pace_renormalize_all.py --data-root py/data --batch 2 --total-batches 4
  python3 pace_renormalize_all.py --data-root py/data --batch 3 --total-batches 4
  python3 pace_renormalize_all.py --data-root py/data --batch 4 --total-batches 4

Requires: SUPABASE_URL and SUPABASE_SERVICE_KEY in py/.env
"""

import argparse
import json
import os
import pathlib
import sys
from typing import Any, Dict, Optional

from dotenv import load_dotenv
from supabase import create_client

# Import from sibling modules
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from pace_normalize import add_distance_m, distance_str_to_meters, load_json
from pace_upload import upload_event


def fetch_event_metadata(sb) -> Dict[str, Dict[str, str]]:
    """Fetch all events from Supabase, keyed by source_id."""
    result = sb.table("events").select("source_id,distance,season,name,gender,date").execute()
    meta = {}
    for row in result.data:
        meta[row["source_id"]] = {
            "distance": row.get("distance", ""),
            "season": row.get("season", ""),
            "name": row.get("name", ""),
            "gender": row.get("gender", "Men"),
            "date": row.get("date", ""),
        }
    return meta


def process_event(event_dir: pathlib.Path, event_meta: Dict[str, str],
                  dry_run: bool, sb) -> str:
    """Re-normalize one event. Returns status string."""
    norm_path = event_dir / "pace_normalized.json"
    if not norm_path.exists():
        return "SKIP (no pace_normalized.json)"

    data = load_json(norm_path)
    if not data:
        return "SKIP (empty/invalid JSON)"

    distance_str = event_meta.get("distance", "")
    race_m = distance_str_to_meters(distance_str)
    if not race_m:
        return f"SKIP (unknown distance: {distance_str!r})"

    season = event_meta.get("season", "")

    # Add distance_m
    add_distance_m(data, race_m, season or None)

    # Check if any athlete got distance_m
    sample = data.get("athletes", [{}])[0].get("splits", [{}])[0] if data.get("athletes") else {}
    if "distance_m" not in sample:
        return "SKIP (no splits to process)"

    method = "parsed" if sample.get("distance_m") else "inferred"
    # Determine inference method from first athlete
    first_athlete = data["athletes"][0] if data.get("athletes") else None
    if first_athlete and first_athlete.get("splits"):
        from pace_normalize import parse_label_distance_m
        first_label = first_athlete["splits"][0].get("label", "")
        method = "parsed" if parse_label_distance_m(first_label) is not None else "inferred"

    if dry_run:
        n_athletes = len(data.get("athletes", []))
        n_splits = len(data["athletes"][0].get("splits", [])) if data.get("athletes") else 0
        last_d = data["athletes"][0]["splits"][-1].get("distance_m", "?") if data.get("athletes") and data["athletes"][0].get("splits") else "?"
        return f"DRY-RUN: {n_athletes} athletes, {n_splits} splits, last_distance_m={last_d}, method={method}"

    # Write updated normalized file
    norm_path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    # Re-upload
    upload_event(data, event_meta)
    return f"OK (method={method})"


def main():
    ap = argparse.ArgumentParser(description="Batch re-normalize all events with distance_m")
    ap.add_argument("--data-root", default="py/data", help="Root data directory")
    ap.add_argument("--batch", type=int, default=0, help="Batch number (1-based, 0=all)")
    ap.add_argument("--total-batches", type=int, default=1, help="Total number of batches")
    ap.add_argument("--dry-run", action="store_true", help="Preview only, no upload")
    args = ap.parse_args()

    load_dotenv(pathlib.Path(__file__).parent / ".env")
    sb = create_client(
        os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL"),
        os.getenv("SUPABASE_SERVICE_KEY"),
    )

    root = pathlib.Path(args.data_root)
    if not root.exists():
        print(f"[err] data root not found: {root}")
        sys.exit(1)

    # Fetch event metadata from Supabase
    print("[info] Fetching event metadata from Supabase...")
    all_meta = fetch_event_metadata(sb)
    print(f"[info] Found {len(all_meta)} events in database")

    # Collect event directories
    event_dirs = sorted([
        d for d in root.iterdir()
        if d.is_dir() and (d / "pace_normalized.json").exists()
    ])
    print(f"[info] Found {len(event_dirs)} event directories with normalized data")

    # Batch selection
    if args.batch > 0 and args.total_batches > 1:
        chunk_size = len(event_dirs) // args.total_batches + 1
        start = (args.batch - 1) * chunk_size
        end = min(start + chunk_size, len(event_dirs))
        event_dirs = event_dirs[start:end]
        print(f"[info] Batch {args.batch}/{args.total_batches}: processing {len(event_dirs)} events (index {start}-{end-1})")

    # Process each event
    results = {"OK": 0, "SKIP": 0, "DRY-RUN": 0, "ERROR": 0}
    for d in event_dirs:
        source_id = d.name
        meta = all_meta.get(source_id, {})
        if not meta:
            # Try without prefix/suffix variations
            print(f"  [{source_id}] SKIP (not found in Supabase)")
            results["SKIP"] += 1
            continue
        try:
            status = process_event(d, meta, args.dry_run, sb)
            category = status.split("(")[0].split(":")[0].strip()
            results[category] = results.get(category, 0) + 1
            print(f"  [{source_id}] {status}")
        except Exception as e:
            print(f"  [{source_id}] ERROR: {e}")
            results["ERROR"] += 1

    print(f"\nDone. {results}")


if __name__ == "__main__":
    main()
```

**Step 2: Test dry-run**

```bash
cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace
python3 py/pace_renormalize_all.py --data-root py/data --dry-run
```

Expected: Lists all events with their inference method and split counts. No uploads.

**Step 3: Test on 3 specific events**

```bash
# Ramon (generic labels, G-MAC)
python3 py/pace_normalize.py --root py/data --event-id 2286816 --force --distance 5000m --season indoor
python3 py/pace_upload.py py/data/2286816/pace_normalized.json --meta '{"distance":"5000m","gender":"Men","season":"indoor","name":"Test"}'

# Colton (distance labels, NE10)
python3 py/pace_normalize.py --root py/data --event-id 458_40_final --force --distance 5000m --season indoor
python3 py/pace_upload.py py/data/458_40_final/pace_normalized.json --meta '{"distance":"5000m","gender":"Men","season":"indoor","name":"Test"}'
```

Verify both have distance_m in Supabase:
```bash
python3 -c "
import os; from dotenv import load_dotenv; from supabase import create_client
load_dotenv('py/.env')
sb = create_client(os.getenv('SUPABASE_URL'), os.getenv('SUPABASE_SERVICE_KEY'))
r = sb.table('splits').select('label,distance_m,elapsed_s').not_.is_('distance_m','null').limit(10).execute()
for row in r.data: print(row)
print(f'{len(r.data)} splits with distance_m found')
"
```

**Step 4: Commit**
```bash
git add py/pace_renormalize_all.py
git commit -m "feat: add batch re-normalization script with parallel batch support"
```

---

### Task 8: Run full re-normalization (USER ACTION -- no Claude needed)

After verifying Tasks 7's dry-run output looks correct:

```bash
cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace

# Run in 4 parallel terminals:
python3 py/pace_renormalize_all.py --data-root py/data --batch 1 --total-batches 4 &
python3 py/pace_renormalize_all.py --data-root py/data --batch 2 --total-batches 4 &
python3 py/pace_renormalize_all.py --data-root py/data --batch 3 --total-batches 4 &
python3 py/pace_renormalize_all.py --data-root py/data --batch 4 --total-batches 4 &
wait
echo "All batches complete"
```

---

## Session 3A: Frontend Chart Alignment

**Dispatch as:** Worktree agent or parallel session
**Depends on:** Session 1A (to understand distance_m shape). Can start before Session 2 using mock data.

### Task 9: Update `buildChartData` for distance-based alignment

**Files:**
- Modify: `apps/web/src/components/SplitChart.tsx:30-51`

**Step 1: Replace `buildChartData`**

The current function matches by label. Replace it to align by `distance_m` with interpolation:

```typescript
function formatDistance(meters: number): string {
  if (meters >= 1000 && meters % 1000 === 0) return `${meters / 1000}K`;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}K`;
  return `${meters}m`;
}

/** Linear interpolation of elapsed_s at a target distance */
function interpolateElapsed(
  splits: { distance_m: number; elapsed_s: number | null }[],
  targetDist: number
): number | null {
  // Exact match
  const exact = splits.find((s) => s.distance_m === targetDist);
  if (exact?.elapsed_s != null) return exact.elapsed_s;

  // Find surrounding splits
  let before: typeof splits[0] | null = null;
  let after: typeof splits[0] | null = null;
  for (const s of splits) {
    if (s.elapsed_s == null || s.distance_m == null) continue;
    if (s.distance_m <= targetDist) before = s;
    if (s.distance_m >= targetDist && !after) after = s;
  }

  if (!before || !after || before === after) return null;
  if (before.elapsed_s == null || after.elapsed_s == null) return null;

  const frac = (targetDist - before.distance_m) / (after.distance_m - before.distance_m);
  return before.elapsed_s + frac * (after.elapsed_s - before.elapsed_s);
}

function buildChartData(athletes: WindowAthleteData[]): ChartPoint[] {
  // Collect all unique distance_m values across all visible athletes
  const distSet = new Set<number>();
  for (const a of athletes) {
    if (!a.visible) continue;
    for (const s of a.athleteResult.splits) {
      if (s.distance_m != null) distSet.add(s.distance_m);
    }
  }

  // Fallback: if no distance_m data, fall back to label-based (legacy behavior)
  if (distSet.size === 0) {
    const allLabels: string[] = [];
    for (const a of athletes) {
      if (a.athleteResult.splits.length > allLabels.length) {
        allLabels.length = 0;
        a.athleteResult.splits.forEach((s) => allLabels.push(s.label));
      }
    }
    return allLabels.map((label) => {
      const point: ChartPoint = { label };
      for (const a of athletes) {
        if (!a.visible) continue;
        const split = a.athleteResult.splits.find((s) => s.label === label);
        if (split?.lap_s != null) {
          point[a.athleteResult.athlete.id] = split.lap_s;
        }
      }
      return point;
    });
  }

  const distances = [...distSet].sort((a, b) => a - b);

  return distances.map((dist) => {
    const point: ChartPoint = { label: formatDistance(dist) };
    for (const a of athletes) {
      if (!a.visible) continue;
      const splits = a.athleteResult.splits;

      // Find this athlete's split at this distance (exact or interpolated)
      const exactSplit = splits.find((s) => s.distance_m === dist);
      if (exactSplit?.lap_s != null) {
        point[a.athleteResult.athlete.id] = exactSplit.lap_s;
        continue;
      }

      // Interpolate: compute elapsed_s at this distance and at the previous distance point
      const prevDist = distances[distances.indexOf(dist) - 1];
      const elapsedHere = interpolateElapsed(splits, dist);
      const elapsedPrev = prevDist != null ? interpolateElapsed(splits, prevDist) : null;

      if (elapsedHere != null && elapsedPrev != null) {
        point[a.athleteResult.athlete.id] = elapsedHere - elapsedPrev;
      }
    }
    return point;
  });
}
```

**Step 2: Update `buildElapsedLookup` to also work by distance**

The tooltip needs elapsed times. Update it to use `distance_m`-based lookup when available:

```typescript
function buildElapsedLookup(
  athletes: WindowAthleteData[]
): Record<string, Record<string, number>> {
  const lookup: Record<string, Record<string, number>> = {};
  for (const a of athletes) {
    const map: Record<string, number> = {};
    for (const s of a.athleteResult.splits) {
      const key = s.distance_m != null ? formatDistance(s.distance_m) : s.label;
      if (s.elapsed_s != null) map[key] = s.elapsed_s;
    }
    lookup[a.athleteResult.athlete.id] = map;
  }
  return lookup;
}
```

Apply the same pattern to `buildRawLapLookup`.

**Step 3: Verify build**

```bash
cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace/apps/web
npm run build
```

Expected: No TypeScript errors, clean build.

**Step 4: Commit**
```bash
git add apps/web/src/components/SplitChart.tsx
git commit -m "feat(frontend): distance-based chart alignment with interpolation"
```

---

## Session 3B: Frontend Types + DB Query

**Dispatch as:** Worktree agent or parallel session
**Depends on:** Session 1B (distance_m column exists)
**Parallel with Session 3A**

### Task 10: Add `distance_m` to Split type

**Files:**
- Modify: `apps/web/src/types/pace.ts:36-44`

**Step 1: Add the field**

```typescript
export interface Split {
  id: string;
  result_id: string;
  label: string;
  ordinal: number;
  distance_m: number | null;  // NEW
  elapsed_s: number | null;
  lap_s: number | null;
  place: number | null;
}
```

**Step 2: Verify db.ts query**

Read `apps/web/src/lib/db.ts`. The existing query uses `splits(*)` which selects all columns -- so `distance_m` will automatically be included. No change needed to `db.ts`.

**Step 3: Verify build**

```bash
cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace/apps/web
npm run build
```

**Step 4: Commit**
```bash
git add apps/web/src/types/pace.ts
git commit -m "feat(types): add distance_m to Split interface"
```

---

## Session 4: Verification

**Dispatch as:** Sequential session after Sessions 3A + 3B merged and user has run re-ingest batches

### Task 11: End-to-end verification

**Step 1: Start dev server**

```bash
cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace/apps/web
npm run dev
```

**Step 2: Test Ramon + Colton overlay**

1. Open the app in browser
2. Select 5000m (or 3000m) Men distance
3. Add Ramon Rodriguez (Tiffin / G-MAC)
4. Add Colton Sallum (NE10)
5. Verify: both athletes appear on the chart with interpolated alignment
6. Toggle deviation mode -- verify it works with cross-cadence athletes

**Step 3: Spot-check other comparisons**

1. Compare two athletes from the same conference (should work identically to before)
2. Compare an XC athlete with a track athlete of similar distance (if applicable)
3. Check that the legacy fallback works (if somehow an event has no distance_m data)

**Step 4: Fix any edge cases found**

Common issues to watch for:
- DMR events (4 legs with non-uniform distances)
- Events where distance_m inference used equal-spacing fallback
- Athletes with very few splits (1-2)

---

## Managing Session Orchestration Guide

### Phase 1: Launch Sessions 1A + 1B in parallel
- Give each session its task description and file list above
- Session 1A: Tasks 1-4 (normalizer)
- Session 1B: Tasks 5-6 (DB + uploader)
- **Verify before proceeding:** Both sessions complete. Run Task 3's verification commands.

### Phase 2: Launch Session 2 (sequential)
- Give it Task 7
- **Verify before proceeding:** Dry-run output looks correct for all events
- Hand user Task 8's parallel commands to run

### Phase 3: Launch Sessions 3A + 3B in parallel (after user confirms re-ingest complete)
- Session 3A: Tasks 9 (chart alignment)
- Session 3B: Task 10 (types)
- **Verify:** `npm run build` passes

### Phase 4: Launch Session 4
- Task 11 (manual verification)
- Fix any edge cases

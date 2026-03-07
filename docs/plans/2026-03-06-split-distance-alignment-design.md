# Split Distance Alignment Design

> Fix cross-conference athlete overlay when splits have different labels/intervals.

## Problem

Athletes from different conferences have splits at different intervals (200m vs 400m vs numbered laps) with incompatible labels. The frontend matches splits by exact label string, so overlaying athletes from different providers produces invisible lines.

**Example**: Ramon Rodriguez (G-MAC, labels: "1","2","3"...) vs Colton Sallum (NE10/TrackScoreboard, labels: "200M","400M","600M"...) -- 3000m races that cannot be compared.

**Root cause**: The normalizer passes through raw provider labels with no distance inference. The DB has no `distance_m` column. The frontend has no interpolation logic.

## Solution: Backend distance_m inference + Frontend time-based alignment

### Backend: `infer_split_distances()`

Add `distance_m` to every split during normalization.

**Inference logic** (in `pace_normalize.py`):

1. **Parsed labels** ("200M", "1K", "3K"): regex extract -> distance_m directly
2. **Generic numbered labels** ("1", "2", ...): infer from race_distance + split_count + season
   - Indoor: first split typically shorter (200m start), remaining laps equal. Validate lap_distance is known track size (200, 300, 400m)
   - Outdoor: 400m laps, first may be partial
   - XC: equal division, typically ~1000m
3. **Fallback**: equal-spaced (`race_distance * (i+1) / num_splits`)

**New split format**:
```json
{
  "label": "3",
  "distance_m": 1200,
  "elapsed_s": 199.65,
  "lap_s": 54.49,
  "place": 14
}
```

### DB Migration

```sql
ALTER TABLE splits ADD COLUMN distance_m numeric;
```

Uploader writes `distance_m` during upsert.

### Frontend: Distance-Based Chart Alignment

Replace `buildChartData` in `SplitChart.tsx`:

1. Collect all unique `distance_m` values across visible athletes, sorted ascending
2. For each distance point, look up each athlete's split at that distance
3. If athlete lacks a split at that distance but has surrounding splits, linearly interpolate `elapsed_s`
4. Derive `lap_s` from interpolated elapsed deltas
5. X-axis becomes formatted distance ("200m", "1K") instead of raw labels

**Interpolation**: `elapsed_d = lerp(elapsed_before, elapsed_after, (d - d_before) / (d_after - d_before))`

**Edge cases**: No surrounding data -> gap (connectNulls handles it). Same cadence -> direct lookup, no interpolation needed.

### Re-Ingestion

No re-scraping needed (cached JSON in `py/data/`). Build `pace_renormalize_all.py`:
- Walks all `py/data/*/pace_normalized.json`
- Re-normalizes with distance_m, re-validates, re-uploads
- Supports `--batch N --total-batches M` for parallel execution
- `--dry-run` mode for preview
- ~120 events, 4 parallel batches of ~30 each

---

## Implementation Sessions

```
Session 1A --+
             +-- (parallel) --> Verify 1A+1B --> Session 2 --> User runs batches
Session 1B --+                                       |
                                                     v
                                             Session 3A --+
                                                          +-- (parallel) --> Session 4
                                             Session 3B --+
```

### Session 1A: Normalizer -- infer_split_distances()

**Files**: `py/pace_normalize.py`

**Task**: Add `infer_split_distances(splits, race_distance_m, season)` function. Wire into `normalize_event()` so every split gets `distance_m`. Handle three cases: parsed distance labels, generic numbered labels (infer from race distance + count + season), and fallback (equal spacing).

**Context needed**: Read `py/pace_normalize.py` (full file), sample normalized JSONs at `py/data/2286816/pace_normalized.json` (generic labels) and `py/data/458_40_final/pace_normalized.json` (distance labels). The function must accept a `race_distance_m` param -- callers derive this from the event's `distance` field (e.g., "3000m" -> 3000, "mile" -> 1609, "5000m" -> 5000). Indoor track standard sizes: 200m, 300m. Outdoor: 400m.

**Verify**: `python3 py/pace_normalize.py --root py/data --event-id 2286816 --force` produces splits with correct `distance_m`. Also test `458_40_final` and one XC event.

### Session 1B: DB Migration + Uploader

**Files**: `supabase/migrations/` (new file), `py/pace_upload.py`

**Task**: Create migration adding `distance_m numeric` column to `splits` table. Update uploader to write `distance_m` from normalized JSON during upsert.

**Context needed**: Read `supabase/migrations/001_initial_schema.sql` for schema context. Read `py/pace_upload.py` for upsert logic. The normalized JSON split objects will have an optional `distance_m` field (numeric, meters).

**Verify**: Migration applies. Upload a single test event, confirm `distance_m` in Supabase.

**1A and 1B are parallel -- no shared files.**

### Session 2: Batch Re-normalization Script

**Depends on**: 1A + 1B verified and merged

**Files**: New `py/pace_renormalize_all.py`

**Task**: Build self-contained script that:
1. Walks all `py/data/*/` directories containing `split_report.json` or `ind_res_list.json`
2. Re-runs normalization (importing from `pace_normalize`)
3. Re-validates (importing from `pace_validate`)
4. Re-uploads to Supabase (importing from `pace_upload`)
5. Supports `--batch N --total-batches M` for parallel execution
6. Supports `--dry-run` for preview without upload
7. Logs per-event: inference method used, any fallbacks, errors

**Context needed**: Read `py/pace_normalize.py`, `py/pace_validate.py`, `py/pace_upload.py` for import signatures. The script needs `--data-root` (default `py/data`), `--batch`, `--total-batches`, `--dry-run` flags. Must handle the event metadata (name, distance, gender, season, date) -- these should already be in Supabase from prior ingestion, so the script re-normalizes + re-uploads splits only (or re-uploads full event with existing metadata).

**Verify**: `--dry-run` on full dataset. Then upload 3 test events (Ramon 2286816, Colton 458_40_final, one XC) and confirm `distance_m` in DB.

**Output**: Print exact parallel commands for user to run all batches.

**After verification, user runs batches in 4 parallel terminals. No Claude session needed.**

### Session 3A: Frontend Chart Alignment

**Depends on**: Session 1A (distance_m shape), data in DB from Session 2

**Files**: `apps/web/src/components/SplitChart.tsx`

**Task**: Replace `buildChartData` to align by `distance_m`:
- Union all `distance_m` values across visible athletes, sorted ascending
- For each distance, lookup or interpolate each athlete's elapsed_s
- Linear interpolation: `lerp(elapsed_before, elapsed_after, fraction)`
- Derive lap_s from elapsed deltas
- Format X-axis as distance strings ("200m", "1K", "1.6K")
- Update `buildDeviationData`, `buildElapsedLookup`, `buildRawLapLookup` for new data shape
- Keep `connectNulls` for gaps

**Context needed**: Read full `SplitChart.tsx`, `apps/web/src/types/pace.ts`. The Split type will have `distance_m: number` added by Session 3B.

**Verify**: `npm run build` in `apps/web/`. Visual test: Ramon + Colton overlay renders with interpolated points.

### Session 3B: Frontend Types + DB Query

**Depends on**: Session 1B (distance_m column exists in DB)

**Files**: `apps/web/src/types/pace.ts`, `apps/web/src/lib/db.ts`

**Task**: Add `distance_m: number` to `Split` interface. The existing `splits(*)` query in `db.ts` already fetches all columns, so `distance_m` will be included automatically -- just ensure the type is correct.

**Context needed**: Read `apps/web/src/types/pace.ts` and `apps/web/src/lib/db.ts`.

**Verify**: Log a fetched athlete's splits, confirm `distance_m` is present and numeric.

**3A and 3B are parallel -- different files.**

### Session 4: Verification and Cleanup

**Depends on**: 3A + 3B merged, user has run re-ingest batches

**Task**: End-to-end verification:
1. Load frontend, overlay Ramon + Colton's 3000m races
2. Confirm chart renders both athletes with interpolated alignment
3. Test deviation mode with cross-cadence athletes
4. Spot-check 2-3 other cross-conference comparisons (different providers)
5. Check an XC event overlay
6. Fix any edge cases found

---

## Key Files Reference

```
py/pace_normalize.py          -- Session 1A: add infer_split_distances()
py/pace_upload.py             -- Session 1B: add distance_m to upsert
supabase/migrations/          -- Session 1B: new migration
py/pace_renormalize_all.py    -- Session 2: new batch script
apps/web/src/types/pace.ts    -- Session 3B: add distance_m to Split type
apps/web/src/lib/db.ts        -- Session 3B: verify query returns distance_m
apps/web/src/components/SplitChart.tsx -- Session 3A: distance-based alignment
```

## Test Data

- Ramon Rodriguez: `py/data/2286816/` (generic labels, G-MAC legacy_spa)
- Colton Sallum: `py/data/458_40_final/` (distance labels, NE10 trackscoreboard_html)
- XC event: check `py/data/` for an event with 1K-style labels

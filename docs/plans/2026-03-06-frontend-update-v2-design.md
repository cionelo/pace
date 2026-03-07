# PACE Frontend Update v2 — Design Doc

> Date: 2026-03-06

## Overview

Six frontend changes + a deferred backend session for DB migration and normalizer improvements.

## Session 1 — Frontend (this session)

### 1. Elapsed Split View (replaces deviation toggle)

**Current:** Toggle between `[Raw Splits]` and `[vs. Name]` (deviation from first athlete).

**New:** Toggle between `[Elapsed]` and `[Raw Splits]`. Elapsed is default.

- **Elapsed mode:** Y-axis = `elapsed_s` (cumulative time from race start). X-axis = distance. Classic time-distance graph — lines rise as race progresses. Steeper slope = slower pace. Athletes close together = tight race. Shows surges, fades, and relative position at each split point.
- **Raw Splits mode:** Same as current — Y-axis = `lap_s` per segment.
- **Tooltip (elapsed):** Shows elapsed time at that point + lap split for context (e.g., "4:32.1 (lap: 68.3s)").
- **Implementation:** New `buildElapsedChartData()` function returns `elapsed_s` at each distance point, reusing existing `interpolateElapsed()` for cross-track-size athletes.
- **Removed:** Deviation mode (`buildDeviationData`, `buildRawLapLookup`, deviation-specific tooltip/axis logic).

**Files:** `SplitChart.tsx`

### 2. Reset Button + Clear "x" on Search Inputs

- **Reset button:** In PaceWindow header bar (next to close "x"). Resets window fully — clears distance selection, athletes, all filters. Returns to "Select a distance to get started".
- **Clear "x":** Small button inside each text input field (race search, name search) that clears the field value. Standard UX pattern — appears when field has text.

**Files:** `PaceWindow.tsx`, `AthleteSearch.tsx`, `window-store.ts` (add `resetWindow` action)

### 3. Ko-fi Link

Change `PLACEHOLDER` to `devbynemo` in Header.tsx line 35.

**Files:** `Header.tsx`

### 4. Logo Size

Increase Nemo logo from `w-8 h-8` (32px) to `w-10 h-10` (40px).

**Files:** `Header.tsx`

### 5. Legend Tooltip Transparency

Add semi-transparency (`bg-zinc-800/80`) + `backdrop-blur-sm` to Legend hover tooltip so chart is visible behind it.

**Files:** `Legend.tsx`

### 6. Race Name Link to Source URL

In Legend tooltip, render `event.name` as clickable link (opens new tab) when `source_url` is present on the event. Until Session 2 populates this column, renders as plain text (no-op).

Requires adding `source_url` to the `Event` TypeScript type (optional field).

**Files:** `Legend.tsx`, `types/pace.ts`

## Session 2 — Backend/DB (separate, non-urgent)

### 1. Add `source_url` Column

- DB migration: `ALTER TABLE events ADD COLUMN source_url text;`
- Backfill existing ~120 events from scraper cache or manual URL reconstruction
- Update `pace_upload.py` to store source URL during ingest (pass through from `pace_ingest_meet.py`)

### 2. Distance Inference in Normalizer

- Add logic to `pace_normalize.py`: when splits lack `distance_m`, infer lap size from `event_distance / num_splits` rounded to nearest common track size (200, 300, 400m)
- Handle stagger: first lap on non-standard tracks (e.g., 5000m on 300m track → first lap = 200m, then 300m each)
- Re-normalize + re-upload affected events (G-MAC 5000m and any others with label-only splits)

## Architecture Notes

- Split data already stores `elapsed_s` on every split — no backend changes needed for elapsed view
- `interpolateElapsed()` already handles cross-track-size alignment via linear interpolation
- Zustand store needs one new action (`resetWindow`) — minimal state management change

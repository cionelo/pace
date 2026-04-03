# PACE MVP Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up the PACE MVP — data normalization, UI overhaul, mobile support, theme toggle — ready for IG advertisement push.

**Architecture:** Phase 1 tackles the database schema and ingestion pipeline (conferences table, distance normalization, purge out-of-scope events, name normalization). Phase 2 overhauls the frontend (unified search, theme toggle, custom athletes, mobile responsive). Tasks within each phase are ordered by dependency. Tasks 1–4 (data) are independent of tasks 5–12 (UI) except that UI tasks assume the schema from Phase 1 is in place.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Zustand, Recharts, Supabase (Postgres), Python (ingestion pipeline), Vitest (new)

---

## File Structure

### New files

| Path | Responsibility |
|------|---------------|
| `supabase/migrations/005_conferences.sql` | Create conferences + conference_aliases tables, add conference_id to events, backfill |
| `supabase/migrations/006_normalize_distances.sql` | Normalize distance strings, purge out-of-scope events |
| `supabase/migrations/007_normalize_names.sql` | Title-case athlete names, trim event name whitespace |
| `apps/web/src/lib/format.ts` | Date formatting, condensed race display, time formatting helpers |
| `apps/web/src/components/UnifiedSearch.tsx` | Smart search bar (replaces AthleteSearch + DistanceSelector) |
| `apps/web/src/components/SearchResults.tsx` | Grouped search results dropdown (races + athletes sections) |
| `apps/web/src/components/FilterPills.tsx` | Gender/Division/Year filter pills (extracted, reusable) |
| `apps/web/src/components/CustomAthleteModal.tsx` | Manual splits + pace line generator modal |
| `apps/web/src/components/MobileTabBar.tsx` | Bottom tab bar for window switching on mobile |
| `apps/web/src/stores/theme-store.ts` | Zustand store for theme preference |
| `apps/web/src/stores/custom-athlete-store.ts` | Zustand store for custom/hypothetical athletes |
| `apps/web/vitest.config.ts` | Vitest configuration |
| `apps/web/src/__tests__/format.test.ts` | Tests for format utilities |
| `apps/web/src/__tests__/search.test.ts` | Tests for search query logic |
| `apps/web/src/__tests__/theme.test.ts` | Tests for theme store |
| `apps/web/src/__tests__/custom-athlete.test.ts` | Tests for custom athlete store + pace line generation |

### Modified files

| Path | Changes |
|------|---------|
| `apps/web/src/types/pace.ts` | Add Conference, ConferenceAlias interfaces; extend Event with conference_id; add CustomAthlete type |
| `apps/web/src/lib/constants.ts` | Expand ATHLETE_COLORS to 10, update MAX_ATHLETES_PER_WINDOW to 10, add ALLOWED_DISTANCES |
| `apps/web/src/lib/db.ts` | Add searchRaces(), searchConferencesByAlias() queries; update getEvents() to join conference; update sort order |
| `apps/web/src/stores/window-store.ts` | Support custom athletes, update color assignment for 10 slots |
| `apps/web/src/components/PaceWindow.tsx` | Replace DistanceSelector + AthleteSearch with UnifiedSearch, add custom athlete button |
| `apps/web/src/components/SplitChart.tsx` | Support dashed lines for custom athletes, theme-aware colors |
| `apps/web/src/components/Legend.tsx` | Clickable race names, theme-aware styling, overflow collapse on mobile |
| `apps/web/src/components/Header.tsx` | Add theme toggle button, responsive layout |
| `apps/web/src/components/WindowGrid.tsx` | Responsive breakpoints, integrate MobileTabBar |
| `apps/web/src/App.tsx` | Wrap with ThemeProvider, add dark class toggling |
| `apps/web/src/index.css` | Add CSS custom properties for theme colors |
| `apps/web/tailwind.config.ts` | Add darkMode: 'class', extend theme with custom colors, fonts, breakpoints |
| `apps/web/package.json` | Add vitest, @testing-library/react dev deps |
| `py/pace_upload.py` | Add distance validation (reject out-of-scope), normalize distance on upload |
| `py/pace_normalize.py` | Add distance normalization step, title-case athlete names |

---

## Phase 1: Data Normalization & Schema

### Task 1: Conferences table + alias system

**Files:**
- Create: `supabase/migrations/005_conferences.sql`
- Modify: `apps/web/src/types/pace.ts`

- [ ] **Step 1: Write the conferences migration**

Create `supabase/migrations/005_conferences.sql`:

```sql
-- Conferences table
CREATE TABLE conferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  short_name text,
  division text NOT NULL CHECK (division IN ('D1', 'D2', 'D3')),
  created_at timestamptz DEFAULT now()
);

-- Conference aliases for flexible search
CREATE TABLE conference_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conference_id uuid NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
  alias text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_conference_aliases_alias ON conference_aliases USING gin(alias gin_trgm_ops);
CREATE INDEX idx_conferences_division ON conferences(division);

-- Add conference_id FK to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS conference_id uuid REFERENCES conferences(id);
CREATE INDEX idx_events_conference ON events(conference_id);

-- Enable RLS
ALTER TABLE conferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE conference_aliases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read" ON conferences FOR SELECT USING (true);
CREATE POLICY "Public read" ON conference_aliases FOR SELECT USING (true);

-- Seed D1 conferences with aliases
INSERT INTO conferences (name, short_name, division) VALUES
  ('American Athletic Conference', 'AAC', 'D1'),
  ('Atlantic Sun Conference', 'ASUN', 'D1'),
  ('Atlantic 10 Conference', 'A10', 'D1'),
  ('Atlantic Coast Conference', 'ACC', 'D1'),
  ('Big East Conference', 'Big East', 'D1'),
  ('Big Sky Conference', 'Big Sky', 'D1'),
  ('Big South Conference', 'Big South', 'D1'),
  ('Big Ten Conference', 'Big Ten', 'D1'),
  ('Big 12 Conference', 'Big 12', 'D1'),
  ('Colonial Athletic Association', 'CAA', 'D1'),
  ('Conference USA', 'CUSA', 'D1'),
  ('Horizon League', 'Horizon', 'D1'),
  ('Ivy League', 'Ivy', 'D1'),
  ('Metro Atlantic Athletic Conference', 'MAAC', 'D1'),
  ('Mid-American Conference', 'MAC', 'D1'),
  ('Mid-Eastern Athletic Conference', 'MEAC', 'D1'),
  ('Missouri Valley Conference', 'MVC', 'D1'),
  ('Mountain West Conference', 'MWC', 'D1'),
  ('Northeast Conference', 'NEC', 'D1'),
  ('Ohio Valley Conference', 'OVC', 'D1'),
  ('Patriot League', 'Patriot', 'D1'),
  ('Southeastern Conference', 'SEC', 'D1'),
  ('Southern Conference', 'SoCon', 'D1'),
  ('Southland Conference', 'Southland', 'D1'),
  ('Summit League', 'Summit', 'D1'),
  ('Sun Belt Conference', 'Sun Belt', 'D1'),
  ('Southwestern Athletic Conference', 'SWAC', 'D1'),
  ('Western Athletic Conference', 'WAC', 'D1'),
  ('America East Conference', 'AE', 'D1'),
  ('Coastal Athletic Association', 'Coastal', 'D1')
ON CONFLICT (name) DO NOTHING;

-- Seed D2 conferences
INSERT INTO conferences (name, short_name, division) VALUES
  ('Northern Sun Intercollegiate Conference', 'NSIC', 'D2'),
  ('Great Northwest Athletic Conference', 'GNAC', 'D2'),
  ('Southern Intercollegiate Athletic Conference', 'SIAC', 'D2'),
  ('Rocky Mountain Athletic Conference', 'RMAC', 'D2'),
  ('Conference Carolinas', 'CC', 'D2'),
  ('Gulf South Conference', 'Gulf South', 'D2'),
  ('Great Midwest Athletic Conference', 'G-MAC', 'D2'),
  ('Central Intercollegiate Athletic Association', 'CIAA', 'D2'),
  ('Peach Belt Conference', 'Peach Belt', 'D2'),
  ('Northeast-10 Conference', 'NE10', 'D2'),
  ('Great Lakes Intercollegiate Athletic Conference', 'GLIAC', 'D2')
ON CONFLICT (name) DO NOTHING;

-- Insert aliases: canonical name + short_name + common variations
-- Each conference's canonical name and short_name are aliases
INSERT INTO conference_aliases (conference_id, alias)
SELECT id, name FROM conferences
ON CONFLICT (alias) DO NOTHING;

INSERT INTO conference_aliases (conference_id, alias)
SELECT id, short_name FROM conferences WHERE short_name IS NOT NULL
ON CONFLICT (alias) DO NOTHING;

-- Additional common aliases
INSERT INTO conference_aliases (conference_id, alias)
SELECT id, 'Big XII' FROM conferences WHERE name = 'Big 12 Conference'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO conference_aliases (conference_id, alias)
SELECT id, 'Big Twelve' FROM conferences WHERE name = 'Big 12 Conference'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO conference_aliases (conference_id, alias)
SELECT id, 'Southeastern' FROM conferences WHERE name = 'Southeastern Conference'
ON CONFLICT (alias) DO NOTHING;

INSERT INTO conference_aliases (conference_id, alias)
SELECT id, 'B12' FROM conferences WHERE name = 'Big 12 Conference'
ON CONFLICT (alias) DO NOTHING;

-- Backfill events.conference_id from event names (pattern matching)
-- Uses the same ILIKE patterns from migration 004 but maps to conference_id
UPDATE events e SET conference_id = c.id
FROM conferences c
WHERE e.conference_id IS NULL AND (
  (c.short_name = 'AAC' AND (e.name ILIKE '%AAC Indoor%' OR e.name ILIKE '%American Athletic%')) OR
  (c.short_name = 'ASUN' AND e.name ILIKE '%ASUN%') OR
  (c.short_name = 'A10' AND (e.name ILIKE '%Atlantic 10%' OR e.name ILIKE '% A10 %')) OR
  (c.short_name = 'ACC' AND e.name ILIKE '%ACC Indoor%') OR
  (c.short_name = 'Big East' AND e.name ILIKE '%Big East%') OR
  (c.short_name = 'Big Sky' AND e.name ILIKE '%Big Sky%') OR
  (c.short_name = 'Big South' AND e.name ILIKE '%Big South%') OR
  (c.short_name = 'Big Ten' AND e.name ILIKE '%Big Ten%') OR
  (c.short_name = 'Big 12' AND e.name ILIKE '%Big 12%') OR
  (c.short_name = 'CAA' AND (e.name ILIKE '%CAA Indoor%' OR e.name ILIKE '%Coastal Athletic%')) OR
  (c.short_name = 'CUSA' AND (e.name ILIKE '%Conference USA%' OR e.name ILIKE '% CUSA %')) OR
  (c.short_name = 'Horizon' AND e.name ILIKE '%Horizon League%') OR
  (c.short_name = 'Ivy' AND e.name ILIKE '%Ivy League%') OR
  (c.short_name = 'MAAC' AND (e.name ILIKE '%MAAC Indoor%' OR e.name ILIKE '%Metro Atlantic%')) OR
  (c.short_name = 'MAC' AND (e.name ILIKE '%MAC Indoor%' OR e.name ILIKE '%Mid-American%')) OR
  (c.short_name = 'MEAC' AND (e.name ILIKE '%MEAC%' OR e.name ILIKE '%Mid-Eastern%')) OR
  (c.short_name = 'MVC' AND (e.name ILIKE '%Missouri Valley%' OR e.name ILIKE '% MVC %')) OR
  (c.short_name = 'MWC' AND (e.name ILIKE '%Mountain West%' OR e.name ILIKE '% MWC %')) OR
  (c.short_name = 'NEC' AND (e.name ILIKE '%NEC Indoor%' OR e.name ILIKE '%Northeast Conference%')) OR
  (c.short_name = 'OVC' AND (e.name ILIKE '%OVC Indoor%' OR e.name ILIKE '%Ohio Valley%')) OR
  (c.short_name = 'Patriot' AND e.name ILIKE '%Patriot League%') OR
  (c.short_name = 'SEC' AND (e.name ILIKE '%SEC Indoor%' OR e.name ILIKE '%Southeastern Conference%')) OR
  (c.short_name = 'SoCon' AND (e.name ILIKE '%SoCon%' OR e.name ILIKE '%Southern Conference%')) OR
  (c.short_name = 'Southland' AND e.name ILIKE '%Southland%') OR
  (c.short_name = 'Summit' AND e.name ILIKE '%Summit League%') OR
  (c.short_name = 'Sun Belt' AND e.name ILIKE '%Sun Belt%') OR
  (c.short_name = 'SWAC' AND (e.name ILIKE '%SWAC%' OR e.name ILIKE '%Southwestern Athletic%')) OR
  (c.short_name = 'WAC' AND (e.name ILIKE '%WAC Indoor%' OR e.name ILIKE '%Western Athletic%')) OR
  (c.short_name = 'AE' AND e.name ILIKE '%America East%') OR
  (c.short_name = 'NSIC' AND e.name ILIKE '%NSIC%') OR
  (c.short_name = 'GNAC' AND e.name ILIKE '%GNAC%') OR
  (c.short_name = 'SIAC' AND e.name ILIKE '% SIAC %') OR
  (c.short_name = 'RMAC' AND e.name ILIKE '%RMAC%') OR
  (c.short_name = 'CC' AND e.name ILIKE '%Conference Carolinas%') OR
  (c.short_name = 'Gulf South' AND e.name ILIKE '%Gulf South%') OR
  (c.short_name = 'G-MAC' AND (e.name ILIKE '%G-MAC%' OR e.name ILIKE '%Great Midwest%')) OR
  (c.short_name = 'CIAA' AND e.name ILIKE '%CIAA%') OR
  (c.short_name = 'Peach Belt' AND e.name ILIKE '%Peach Belt%') OR
  (c.short_name = 'NE10' AND (e.name ILIKE '%NE10%' OR e.name ILIKE '%Northeast-10%')) OR
  (c.short_name = 'GLIAC' AND e.name ILIKE '%GLIAC%')
);
```

- [ ] **Step 2: Run migration on Supabase**

```bash
cd /Users/ncionelo/Downloads/JOBS/PROJECTS/PACE/pace
# Apply via Supabase dashboard SQL editor or:
# supabase db push (if using Supabase CLI)
```

Verify: `SELECT count(*) FROM conferences;` should return ~41 rows.
Verify: `SELECT count(*) FROM events WHERE conference_id IS NOT NULL;` should be > 0.

- [ ] **Step 3: Update TypeScript types**

In `apps/web/src/types/pace.ts`, add after the `Team` interface:

```typescript
export interface Conference {
  id: string;
  name: string;
  short_name: string | null;
  division: "D1" | "D2" | "D3";
}

export interface ConferenceAlias {
  id: string;
  conference_id: string;
  alias: string;
}
```

Update the `Event` interface to add:
```typescript
  conference_id: string | null;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/005_conferences.sql apps/web/src/types/pace.ts
git commit -m "feat: add conferences table with aliases, backfill events"
```

---

### Task 2: Distance normalization + purge out-of-scope events

**Files:**
- Create: `supabase/migrations/006_normalize_distances.sql`

- [ ] **Step 1: Write the distance normalization migration**

Create `supabase/migrations/006_normalize_distances.sql`:

```sql
-- Normalize distance strings to canonical forms
-- Track: 800m, 1500m, Mile, 3000m, 5000m, 10,000m
-- XC: 5K, 8K, 10K
-- Relays: DMR, 4xMile

-- Fix case variations
UPDATE events SET distance = 'Mile' WHERE lower(distance) = 'mile' AND distance != 'Mile';
UPDATE events SET distance = '800m' WHERE distance IN ('800', '800M');
UPDATE events SET distance = '1500m' WHERE distance IN ('1500', '1500M');
UPDATE events SET distance = '3000m' WHERE distance IN ('3000', '3000M');
UPDATE events SET distance = '5000m' WHERE distance IN ('5000', '5,000', '5000M');
UPDATE events SET distance = '10,000m' WHERE distance IN ('10000', '10,000', '10000m', '10000M');
UPDATE events SET distance = '5K' WHERE distance = '5k';
UPDATE events SET distance = '8K' WHERE distance = '8k';
UPDATE events SET distance = '10K' WHERE distance = '10k';

-- Delete out-of-scope events (cascades to results → splits via FK)
DELETE FROM events
WHERE distance NOT IN (
  '800m', '1500m', 'Mile', '3000m', '5000m', '10,000m',
  '5K', '8K', '10K',
  'DMR', '4xMile'
);

-- Add check constraint to prevent future out-of-scope inserts
ALTER TABLE events ADD CONSTRAINT chk_allowed_distance
  CHECK (distance IN (
    '800m', '1500m', 'Mile', '3000m', '5000m', '10,000m',
    '5K', '8K', '10K',
    'DMR', '4xMile'
  ));
```

- [ ] **Step 2: Run migration and verify**

```bash
# Apply via Supabase dashboard SQL editor
```

Verify: `SELECT DISTINCT distance FROM events ORDER BY distance;` should only show allowed values.
Verify: `SELECT count(*) FROM events WHERE distance = '600y';` should return 0.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_normalize_distances.sql
git commit -m "feat: normalize distances, purge out-of-scope events, add check constraint"
```

---

### Task 3: Name normalization

**Files:**
- Create: `supabase/migrations/007_normalize_names.sql`

- [ ] **Step 1: Write the name normalization migration**

Create `supabase/migrations/007_normalize_names.sql`:

```sql
-- Title-case athlete names that are ALL CAPS
-- initcap() converts "JOHN SMITH" → "John Smith"
-- Only apply to names where EVERY letter is uppercase (avoid touching "Jane McSmith")
UPDATE athletes
SET name = initcap(name)
WHERE name = upper(name)
  AND name != initcap(name);

-- Normalize event name whitespace (collapse double spaces, trim)
UPDATE events
SET name = regexp_replace(trim(name), '\s+', ' ', 'g')
WHERE name != regexp_replace(trim(name), '\s+', ' ', 'g');
```

- [ ] **Step 2: Run migration and verify**

Verify: `SELECT name FROM athletes WHERE name = upper(name) AND length(name) > 1 LIMIT 10;` should return 0 rows.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_normalize_names.sql
git commit -m "fix: title-case ALL CAPS athlete names, normalize event whitespace"
```

---

### Task 4: Ingestion pipeline guardrails

**Files:**
- Modify: `py/pace_upload.py`
- Modify: `py/pace_normalize.py`

- [ ] **Step 1: Add allowed-distance validation to pace_upload.py**

In `py/pace_upload.py`, add after the `sb = create_client(...)` line:

```python
ALLOWED_DISTANCES = frozenset([
    "800m", "1500m", "Mile", "3000m", "5000m", "10,000m",
    "5K", "8K", "10K", "DMR", "4xMile",
])

DISTANCE_NORMALIZE_MAP = {
    "800": "800m", "800M": "800m",
    "1500": "1500m", "1500M": "1500m",
    "mile": "Mile", "MILE": "Mile",
    "3000": "3000m", "3000M": "3000m",
    "5000": "5000m", "5,000": "5000m", "5000M": "5000m",
    "10000": "10,000m", "10,000": "10,000m", "10000m": "10,000m", "10000M": "10,000m",
    "5k": "5K",
    "8k": "8K",
    "10k": "10K",
}


def normalize_distance(distance: str) -> str:
    """Normalize distance string to canonical form."""
    return DISTANCE_NORMALIZE_MAP.get(distance, distance)
```

- [ ] **Step 2: Update upload_event to validate and normalize distance**

In `py/pace_upload.py`, in the `upload_event` function, before the event_row dict construction, add:

```python
    raw_distance = meta.get("distance", "")
    distance = normalize_distance(raw_distance)
    if distance not in ALLOWED_DISTANCES:
        print(f"[skip] event {source_id}: distance '{raw_distance}' (normalized: '{distance}') is out of scope")
        return
```

Then change `"distance": meta.get("distance", ""),` to `"distance": distance,` in the event_row dict.

- [ ] **Step 3: Add title-case to athlete name in upload**

In `py/pace_upload.py`, in the upload loop where `name = a.get("name", "").strip()`, add after that line:

```python
        # Title-case ALL CAPS names
        if name == name.upper() and len(name) > 1:
            name = name.title()
```

- [ ] **Step 4: Add distance normalization to pace_normalize.py**

In `py/pace_normalize.py`, add the same `DISTANCE_NORMALIZE_MAP` and `normalize_distance` function. This is used when `--distance` is passed on CLI. In the `main()` function, after `args = ap.parse_args()`, add:

```python
    if args.distance:
        args.distance = normalize_distance(args.distance)
```

- [ ] **Step 5: Commit**

```bash
git add py/pace_upload.py py/pace_normalize.py
git commit -m "feat: add distance validation + normalization to ingestion pipeline"
```

---

## Phase 2: UI Overhaul

### Task 5: Test infrastructure + format utilities

**Files:**
- Modify: `apps/web/package.json`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/src/lib/format.ts`
- Create: `apps/web/src/__tests__/format.test.ts`

- [ ] **Step 1: Install test dependencies**

```bash
cd /Users/ncionelo/Downloads/JOBS/PROJECTS/PACE/pace/apps/web
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

- [ ] **Step 2: Create vitest config**

Create `apps/web/vitest.config.ts`:

```typescript
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: [],
  },
});
```

- [ ] **Step 3: Add test script to package.json**

In `apps/web/package.json`, add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Write failing tests for format utilities**

Create `apps/web/src/__tests__/format.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  formatRaceDisplay,
  formatDateHuman,
  genderShorthand,
} from "../lib/format";

describe("formatDateHuman", () => {
  it("formats ISO date to human readable", () => {
    expect(formatDateHuman("2026-02-28")).toBe("Feb 28, 2026");
  });

  it("returns empty string for null", () => {
    expect(formatDateHuman(null)).toBe("");
  });
});

describe("genderShorthand", () => {
  it("converts Men to M", () => {
    expect(genderShorthand("Men")).toBe("M");
  });

  it("converts Women to W", () => {
    expect(genderShorthand("Women")).toBe("W");
  });
});

describe("formatRaceDisplay", () => {
  it("returns condensed format with conference", () => {
    expect(
      formatRaceDisplay({
        conferenceName: "Big 12",
        season: "indoor",
        gender: "Women",
        distance: "800m",
        date: "2026-02-28",
      })
    ).toBe("Big 12 Indoor · W 800m · Feb 28, 2026");
  });

  it("falls back to event name when no conference", () => {
    expect(
      formatRaceDisplay({
        conferenceName: null,
        eventName: "Razorback Invitational",
        season: "indoor",
        gender: "Men",
        distance: "Mile",
        date: "2026-01-15",
      })
    ).toBe("Razorback Invitational · M Mile · Jan 15, 2026");
  });

  it("capitalizes season", () => {
    expect(
      formatRaceDisplay({
        conferenceName: "SEC",
        season: "outdoor",
        gender: "Men",
        distance: "5000m",
        date: "2026-05-10",
      })
    ).toBe("SEC Outdoor · M 5000m · May 10, 2026");
  });

  it("handles xc season", () => {
    expect(
      formatRaceDisplay({
        conferenceName: "Sun Belt",
        season: "xc",
        gender: "Women",
        distance: "5K",
        date: "2025-10-31",
      })
    ).toBe("Sun Belt XC · W 5K · Oct 31, 2025");
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

```bash
cd /Users/ncionelo/Downloads/JOBS/PROJECTS/PACE/pace/apps/web
npx vitest run src/__tests__/format.test.ts
```

Expected: FAIL — module `../lib/format` does not exist.

- [ ] **Step 6: Implement format utilities**

Create `apps/web/src/lib/format.ts`:

```typescript
const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatDateHuman(date: string | null): string {
  if (!date) return "";
  const [y, m, d] = date.split("-");
  const monthIdx = parseInt(m, 10) - 1;
  const day = parseInt(d, 10);
  return `${MONTH_NAMES[monthIdx]} ${day}, ${y}`;
}

export function genderShorthand(gender: string): string {
  return gender === "Men" ? "M" : "W";
}

const SEASON_DISPLAY: Record<string, string> = {
  indoor: "Indoor",
  outdoor: "Outdoor",
  xc: "XC",
};

interface RaceDisplayInput {
  conferenceName?: string | null;
  eventName?: string;
  season: string | null;
  gender: string;
  distance: string;
  date: string | null;
}

export function formatRaceDisplay(input: RaceDisplayInput): string {
  const prefix = input.conferenceName ?? input.eventName ?? "";
  const season = input.season ? SEASON_DISPLAY[input.season] ?? "" : "";
  const label = [prefix, season].filter(Boolean).join(" ");
  const g = genderShorthand(input.gender);
  const dateStr = formatDateHuman(input.date);
  return [label, `${g} ${input.distance}`, dateStr].filter(Boolean).join(" · ");
}
```

- [ ] **Step 7: Run tests to verify they pass**

```bash
cd /Users/ncionelo/Downloads/JOBS/PROJECTS/PACE/pace/apps/web
npx vitest run src/__tests__/format.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/web/vitest.config.ts apps/web/package.json apps/web/src/lib/format.ts apps/web/src/__tests__/format.test.ts
git commit -m "feat: add vitest setup + format utilities with tests"
```

---

### Task 6: Constants update (10 athletes, allowed distances)

**Files:**
- Modify: `apps/web/src/lib/constants.ts`

- [ ] **Step 1: Update constants**

Replace the entire contents of `apps/web/src/lib/constants.ts`:

```typescript
export const ATHLETE_COLORS = [
  "#2563EB", // blue
  "#DC2626", // red
  "#16A34A", // green
  "#9333EA", // purple
  "#EA580C", // orange
  "#0891B2", // cyan
  "#CA8A04", // yellow
  "#DB2777", // pink
  "#4F46E5", // indigo
  "#059669", // emerald
] as const;

export const MAX_ATHLETES_PER_WINDOW = 10;
export const MAX_WINDOWS = 6;

export const ALLOWED_DISTANCES = [
  "800m", "1500m", "Mile", "3000m", "5000m", "10,000m",
  "5K", "8K", "10K", "DMR", "4xMile",
] as const;
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/ncionelo/Downloads/JOBS/PROJECTS/PACE/pace/apps/web
npx tsc --noEmit
```

Expected: no errors (ATHLETE_COLORS[5–9] aren't indexed yet, but the type widens to `string` via `as const`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/constants.ts
git commit -m "feat: expand to 10 athlete colors, add ALLOWED_DISTANCES constant"
```

---

### Task 7: Theme store + toggle

**Files:**
- Create: `apps/web/src/stores/theme-store.ts`
- Create: `apps/web/src/__tests__/theme.test.ts`
- Modify: `apps/web/src/App.tsx`
- Modify: `apps/web/src/index.css`
- Modify: `apps/web/tailwind.config.ts`

- [ ] **Step 1: Write failing tests for theme store**

Create `apps/web/src/__tests__/theme.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from "vitest";
import { useThemeStore } from "../stores/theme-store";

describe("theme store", () => {
  beforeEach(() => {
    useThemeStore.setState({ theme: "light" });
    localStorage.clear();
  });

  it("defaults to light", () => {
    expect(useThemeStore.getState().theme).toBe("light");
  });

  it("toggles to dark", () => {
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe("dark");
  });

  it("toggles back to light", () => {
    useThemeStore.getState().toggle();
    useThemeStore.getState().toggle();
    expect(useThemeStore.getState().theme).toBe("light");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/__tests__/theme.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement theme store**

Create `apps/web/src/stores/theme-store.ts`:

```typescript
import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeStore {
  theme: Theme;
  toggle: () => void;
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  const saved = localStorage.getItem("pace-theme");
  if (saved === "dark" || saved === "light") return saved;
  return "light";
}

export const useThemeStore = create<ThemeStore>((set, get) => ({
  theme: getInitialTheme(),
  toggle: () => {
    const next = get().theme === "light" ? "dark" : "light";
    localStorage.setItem("pace-theme", next);
    set({ theme: next });
  },
}));
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/__tests__/theme.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 5: Update tailwind.config.ts for class-based dark mode**

In `apps/web/tailwind.config.ts`, add `darkMode: "class"` and custom theme extensions:

```typescript
import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        display: ['"Inter"', "system-ui", "sans-serif"],
        body: ['"Inter"', "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 6: Update App.tsx to apply theme class**

Replace `apps/web/src/App.tsx`:

```typescript
import { useEffect } from "react";
import Header from "./components/Header";
import WindowGrid from "./components/WindowGrid";
import { useThemeStore } from "./stores/theme-store";

export default function App() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  return (
    <div className="min-h-screen bg-white text-zinc-900 dark:bg-zinc-950 dark:text-white transition-colors">
      <Header />
      <WindowGrid />
    </div>
  );
}
```

- [ ] **Step 7: Verify build compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/stores/theme-store.ts apps/web/src/__tests__/theme.test.ts apps/web/src/App.tsx apps/web/tailwind.config.ts
git commit -m "feat: add theme store with light/dark toggle, class-based dark mode"
```

---

### Task 8: Update db.ts queries for conferences + unified search

**Files:**
- Modify: `apps/web/src/lib/db.ts`
- Create: `apps/web/src/lib/search.ts`

- [ ] **Step 1: Update getEvents to join conference and sort properly**

In `apps/web/src/lib/db.ts`, update the `getEvents` function:

```typescript
export async function getEvents(filters?: EventFilters): Promise<(Event & { conference?: Conference })[]> {
  let query = supabase
    .from("events")
    .select("*, conference:conferences(*)")
    .order("date", { ascending: false });

  if (filters?.gender) query = query.eq("gender", filters.gender);
  if (filters?.distance) query = query.eq("distance", filters.distance);
  if (filters?.season) query = query.eq("season", filters.season);
  if (filters?.division) query = query.eq("conference.division", filters.division);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    conference: row.conference ?? undefined,
  }));
}
```

- [ ] **Step 2: Add searchConferencesByAlias query**

Add to `apps/web/src/lib/db.ts`:

```typescript
export async function searchConferencesByAlias(query: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("conference_aliases")
    .select("conference_id")
    .ilike("alias", `%${query}%`)
    .limit(10);

  if (error) throw error;
  return [...new Set((data ?? []).map((row: any) => row.conference_id as string))];
}
```

- [ ] **Step 3: Add searchRaces query**

Add to `apps/web/src/lib/db.ts`:

```typescript
export async function searchRaces(
  query: string,
  filters?: { gender?: string; division?: string }
): Promise<(Event & { conference?: Conference })[]> {
  // First find matching conference IDs
  const conferenceIds = query ? await searchConferencesByAlias(query) : [];

  let dbQuery = supabase
    .from("events")
    .select("*, conference:conferences(*)")
    .order("date", { ascending: false })
    .limit(20);

  if (filters?.gender) dbQuery = dbQuery.eq("gender", filters.gender);

  // Match by conference_id OR event name
  if (query && conferenceIds.length > 0) {
    dbQuery = dbQuery.or(
      `name.ilike.%${query}%,conference_id.in.(${conferenceIds.join(",")})`
    );
  } else if (query) {
    dbQuery = dbQuery.ilike("name", `%${query}%`);
  }

  const { data, error } = await dbQuery;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    conference: row.conference ?? undefined,
  }));
}
```

- [ ] **Step 4: Import Conference type**

At the top of `apps/web/src/lib/db.ts`, update the import:

```typescript
import type { Event, AthleteResult, Conference } from "../types/pace";
```

- [ ] **Step 5: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/db.ts
git commit -m "feat: add conference join to getEvents, searchRaces, conference alias search"
```

---

### Task 9: Unified search bar component

**Files:**
- Create: `apps/web/src/components/UnifiedSearch.tsx`
- Create: `apps/web/src/components/SearchResults.tsx`
- Create: `apps/web/src/components/FilterPills.tsx`
- Modify: `apps/web/src/components/PaceWindow.tsx`
- Delete: `apps/web/src/components/DistanceSelector.tsx` (functionality merged into UnifiedSearch)

- [ ] **Step 1: Create FilterPills component**

Create `apps/web/src/components/FilterPills.tsx`:

```typescript
interface FilterPillsProps {
  gender: "" | "Men" | "Women";
  division: "" | "D1" | "D2";
  onGenderChange: (g: "" | "Men" | "Women") => void;
  onDivisionChange: (d: "" | "D1" | "D2") => void;
}

export default function FilterPills({
  gender,
  division,
  onGenderChange,
  onDivisionChange,
}: FilterPillsProps) {
  const pillBase =
    "px-2 py-1 text-xs transition-colors";
  const activeClass =
    "bg-zinc-200 text-zinc-900 dark:bg-zinc-700 dark:text-white";
  const inactiveClass =
    "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <div className="flex rounded overflow-hidden border border-zinc-300 dark:border-zinc-700">
        {(["", "Men", "Women"] as const).map((g) => (
          <button
            key={g}
            className={`${pillBase} ${gender === g ? activeClass : inactiveClass}`}
            onClick={() => onGenderChange(g)}
          >
            {g === "" ? "All" : g === "Men" ? "M" : "W"}
          </button>
        ))}
      </div>
      <div className="flex rounded overflow-hidden border border-zinc-300 dark:border-zinc-700">
        {(["", "D1", "D2"] as const).map((d) => (
          <button
            key={d}
            className={`${pillBase} ${division === d ? activeClass : inactiveClass}`}
            onClick={() => onDivisionChange(d)}
          >
            {d === "" ? "All" : d}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create SearchResults component**

Create `apps/web/src/components/SearchResults.tsx`:

```typescript
import type { Event, AthleteResult, Conference } from "../types/pace";
import { formatRaceDisplay } from "../lib/format";

type RaceWithConference = Event & { conference?: Conference };

interface SearchResultsProps {
  races: RaceWithConference[];
  athletes: AthleteResult[];
  loading: boolean;
  query: string;
  onSelectRace: (event: RaceWithConference) => void;
  onSelectAthlete: (ar: AthleteResult) => void;
  atCapacity: boolean;
}

export default function SearchResults({
  races,
  athletes,
  loading,
  query,
  onSelectRace,
  onSelectAthlete,
  atCapacity,
}: SearchResultsProps) {
  if (!query && races.length === 0 && athletes.length === 0) return null;

  return (
    <div className="absolute top-full left-0 right-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-900">
      {loading && (
        <p className="px-3 py-2 text-xs text-zinc-500">Searching...</p>
      )}

      {!loading && races.length > 0 && (
        <div>
          <p className="px-3 py-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide bg-zinc-50 dark:bg-zinc-800/50">
            Races
          </p>
          {races.map((race) => (
            <button
              key={race.id}
              onClick={() => onSelectRace(race)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <span className="text-zinc-900 dark:text-zinc-200">
                {formatRaceDisplay({
                  conferenceName: race.conference?.name ?? null,
                  eventName: race.name,
                  season: race.season,
                  gender: race.gender,
                  distance: race.distance,
                  date: race.date,
                })}
              </span>
            </button>
          ))}
        </div>
      )}

      {!loading && athletes.length > 0 && (
        <div>
          <p className="px-3 py-1.5 text-xs font-semibold text-zinc-400 uppercase tracking-wide bg-zinc-50 dark:bg-zinc-800/50">
            Athletes
          </p>
          {athletes.map((ar) => (
            <div
              key={`${ar.athlete.id}-${ar.result.id}`}
              className="flex items-center justify-between px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <div>
                <p className="text-sm text-zinc-900 dark:text-zinc-200">
                  {ar.athlete.name}
                  {ar.team && (
                    <span className="text-zinc-500 dark:text-zinc-500">
                      {" "}· {ar.team.name}
                    </span>
                  )}
                </p>
                <p className="text-xs text-zinc-500">
                  {ar.result.time_str} · {ar.event.name}
                  {ar.event.date ? ` · ${ar.event.date}` : ""}
                </p>
              </div>
              <button
                onClick={() => onSelectAthlete(ar)}
                disabled={atCapacity}
                className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          ))}
        </div>
      )}

      {!loading && query && races.length === 0 && athletes.length === 0 && (
        <p className="px-3 py-3 text-xs text-zinc-500">
          No results for "{query}"
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Create UnifiedSearch component**

Create `apps/web/src/components/UnifiedSearch.tsx`:

```typescript
import { useState, useEffect, useCallback, useRef } from "react";
import { searchAthletes, searchRaces } from "../lib/db";
import type { Event, AthleteResult, Conference } from "../types/pace";
import FilterPills from "./FilterPills";
import SearchResults from "./SearchResults";
import { formatRaceDisplay } from "../lib/format";

type RaceWithConference = Event & { conference?: Conference };

interface UnifiedSearchProps {
  selectedCount: number;
  maxAthletes: number;
  onAdd: (athleteResult: AthleteResult) => void;
}

export default function UnifiedSearch({
  selectedCount,
  maxAthletes,
  onAdd,
}: UnifiedSearchProps) {
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState<"" | "Men" | "Women">("");
  const [division, setDivision] = useState<"" | "D1" | "D2">("");
  const [selectedRace, setSelectedRace] = useState<RaceWithConference | null>(null);
  const [races, setRaces] = useState<RaceWithConference[]>([]);
  const [athletes, setAthletes] = useState<AthleteResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const doSearch = useCallback(async () => {
    if (!query.trim() && !selectedRace) {
      setRaces([]);
      setAthletes([]);
      return;
    }

    setLoading(true);
    try {
      if (selectedRace) {
        // Search athletes within selected race
        const data = await searchAthletes(query, {
          eventId: selectedRace.id,
          gender: gender || undefined,
        });
        setAthletes(data);
        setRaces([]);
      } else {
        // Search both races and athletes
        const [raceResults, athleteResults] = await Promise.all([
          searchRaces(query, { gender: gender || undefined }),
          searchAthletes(query, { gender: gender || undefined }),
        ]);
        setRaces(raceResults);
        setAthletes(athleteResults);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [query, gender, division, selectedRace]);

  useEffect(() => {
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [doSearch]);

  const handleSelectRace = (race: RaceWithConference) => {
    setSelectedRace(race);
    setQuery("");
    setShowResults(false);
  };

  const handleClearRace = () => {
    setSelectedRace(null);
    setQuery("");
    setRaces([]);
    setAthletes([]);
  };

  const handleSelectAthlete = (ar: AthleteResult) => {
    onAdd(ar);
  };

  const atCapacity = selectedCount >= maxAthletes;

  return (
    <div ref={containerRef} className="relative border-b border-zinc-200 dark:border-zinc-800 px-3 py-2 space-y-2">
      <FilterPills
        gender={gender}
        division={division}
        onGenderChange={(g) => { setGender(g); setSelectedRace(null); }}
        onDivisionChange={(d) => { setDivision(d); setSelectedRace(null); }}
      />

      {/* Selected race chip */}
      {selectedRace && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300 text-xs rounded-full px-2.5 py-1">
            {formatRaceDisplay({
              conferenceName: selectedRace.conference?.name ?? null,
              eventName: selectedRace.name,
              season: selectedRace.season,
              gender: selectedRace.gender,
              distance: selectedRace.distance,
              date: selectedRace.date,
            })}
            <button onClick={handleClearRace} className="ml-1 hover:text-red-500">
              ×
            </button>
          </span>
        </div>
      )}

      {/* Search input */}
      <div className="relative">
        <input
          type="text"
          placeholder={selectedRace ? "Search athletes in this race..." : "Search races or athletes..."}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setShowResults(true);
          }}
          onFocus={() => setShowResults(true)}
          className="w-full bg-zinc-100 border border-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-200 text-sm rounded-lg px-3 py-2 pr-8 placeholder-zinc-400 dark:placeholder-zinc-500 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => { setQuery(""); setRaces([]); setAthletes([]); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            ×
          </button>
        )}
      </div>

      {/* Results dropdown */}
      {showResults && (query || loading) && (
        <SearchResults
          races={races}
          athletes={athletes}
          loading={loading}
          query={query}
          onSelectRace={handleSelectRace}
          onSelectAthlete={handleSelectAthlete}
          atCapacity={atCapacity}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Update PaceWindow to use UnifiedSearch**

Replace the contents of `apps/web/src/components/PaceWindow.tsx`:

```typescript
import { useWindowStore } from "../stores/window-store";
import UnifiedSearch from "./UnifiedSearch";
import SplitChart from "./SplitChart";
import Legend from "./Legend";
import { MAX_ATHLETES_PER_WINDOW } from "../lib/constants";

interface PaceWindowProps {
  windowId: string;
}

export default function PaceWindow({ windowId }: PaceWindowProps) {
  const paceWindow = useWindowStore((s) => s.windows.find((w) => w.id === windowId));
  const addAthlete = useWindowStore((s) => s.addAthlete);
  const removeAthlete = useWindowStore((s) => s.removeAthlete);
  const removeWindow = useWindowStore((s) => s.removeWindow);
  const resetWindow = useWindowStore((s) => s.resetWindow);
  const toggleVisibility = useWindowStore((s) => s.toggleAthleteVisibility);

  if (!paceWindow) return null;

  return (
    <div className="bg-white border border-zinc-200 dark:bg-zinc-900 dark:border-zinc-800 rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">
        <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-200">
          Window
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => resetWindow(windowId)}
            className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 text-xs px-1.5 py-0.5 rounded border border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
            title="Reset window"
          >
            Reset
          </button>
          <button
            onClick={() => removeWindow(windowId)}
            className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400 text-lg leading-none px-1"
            title="Close window"
          >
            ×
          </button>
        </div>
      </div>

      {/* Unified Search */}
      <UnifiedSearch
        selectedCount={paceWindow.athletes.length}
        maxAthletes={MAX_ATHLETES_PER_WINDOW}
        onAdd={(ar) => addAthlete(windowId, ar)}
      />

      {/* Selected athletes chips */}
      {paceWindow.athletes.length > 0 && (
        <div className="px-3 py-1 flex flex-wrap gap-1 border-b border-zinc-200 dark:border-zinc-800">
          {paceWindow.athletes.map((a) => (
            <span
              key={a.athleteResult.athlete.id}
              className="inline-flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-700 dark:text-zinc-300 rounded px-2 py-0.5"
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: a.color }}
              />
              {a.athleteResult.athlete.name}
              <button
                onClick={() => removeAthlete(windowId, a.athleteResult.athlete.id)}
                className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400 ml-0.5"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 p-2 min-h-[200px]">
        {paceWindow.athletes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-zinc-400 text-sm">
            Search for a race or athlete to get started
          </div>
        ) : (
          <SplitChart athletes={paceWindow.athletes} />
        )}
      </div>

      {/* Legend */}
      {paceWindow.athletes.length > 0 && (
        <Legend
          athletes={paceWindow.athletes}
          onToggle={(id) => toggleVisibility(windowId, id)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 5: Delete DistanceSelector.tsx**

```bash
rm apps/web/src/components/DistanceSelector.tsx
```

- [ ] **Step 6: Remove setDistance from window-store.ts**

In `apps/web/src/stores/window-store.ts`, the `distance` field on PaceWindow is no longer needed since the unified search handles scoping. Remove the `distance` property from `PaceWindow`, remove `setDistance` from the store interface and implementation, and update `resetWindow` to only clear athletes.

Update the `PaceWindow` interface:

```typescript
export interface PaceWindow {
  id: string;
  athletes: WindowAthleteData[];
}
```

Remove `setDistance` from the `WindowStore` interface and implementation. Update `resetWindow`:

```typescript
  resetWindow: (windowId) => {
    set({
      windows: get().windows.map((w) =>
        w.id === windowId ? { ...w, athletes: [] } : w
      ),
    });
  },
```

Remove `distance: null` from `addWindow` and `setDistance` entirely.

- [ ] **Step 7: Verify build**

```bash
npx tsc --noEmit
```

Fix any remaining references to `distance` on `PaceWindow` or `DistanceSelector` imports.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: unified smart search bar replaces distance selector + athlete search"
```

---

### Task 10: Clickable race names + source URL links

**Files:**
- Modify: `apps/web/src/components/Legend.tsx`
- Modify: `apps/web/src/components/SearchResults.tsx`

- [ ] **Step 1: Update Legend to make race names clickable links**

Replace the event name section in `apps/web/src/components/Legend.tsx`. In the hover tooltip, the event name is already a link when `source_url` exists. Also add a subtle external-link indicator icon. Replace the event name rendering in the tooltip:

```typescript
                {event.source_url ? (
                  <a
                    href={event.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline inline-flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {event.name}
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                ) : (
                  <p className="text-zinc-500 dark:text-zinc-400">{event.name}</p>
                )}
```

- [ ] **Step 2: Update Legend theme classes**

Update all hardcoded dark classes in Legend.tsx to use theme-aware classes (add `dark:` variants alongside light equivalents). Replace the outer div class:

```typescript
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-3 pb-2">
```

Replace the button opacity classes:

```typescript
              className={`flex items-center gap-1.5 text-sm transition-opacity ${
                a.visible ? "opacity-100" : "opacity-40"
              }`}
```

Replace the tooltip container:

```typescript
              <div className="absolute bottom-full left-0 mb-1 z-50 bg-white/90 backdrop-blur-sm border border-zinc-200 dark:bg-zinc-800/90 dark:border-zinc-700 rounded-md px-3 py-2 shadow-lg whitespace-nowrap text-xs">
```

Replace text classes to be theme-aware:

```typescript
                <p className="text-zinc-900 dark:text-white font-medium">{athlete.name}</p>
                {team && <p className="text-zinc-500 dark:text-zinc-400">{team.name}</p>}
```

- [ ] **Step 3: Add source_url link to SearchResults athlete rows**

In `apps/web/src/components/SearchResults.tsx`, in the athlete result rows, make the event name clickable if `source_url` exists:

Replace the event name display in the athlete result `<p>`:

```typescript
                <p className="text-xs text-zinc-500">
                  {ar.result.time_str} ·{" "}
                  {ar.event.source_url ? (
                    <a
                      href={ar.event.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:text-blue-500 dark:text-blue-400 dark:hover:text-blue-300 underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {ar.event.name}
                    </a>
                  ) : (
                    ar.event.name
                  )}
                  {ar.event.date ? ` · ${ar.event.date}` : ""}
                </p>
```

- [ ] **Step 4: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Legend.tsx apps/web/src/components/SearchResults.tsx
git commit -m "feat: clickable race names link to source URL with external icon"
```

---

### Task 11: Theme toggle in Header + theme-aware styling across components

**Files:**
- Modify: `apps/web/src/components/Header.tsx`
- Modify: `apps/web/src/components/WindowGrid.tsx`
- Modify: `apps/web/src/components/SplitChart.tsx`

- [ ] **Step 1: Add theme toggle to Header**

In `apps/web/src/components/Header.tsx`, add import and toggle button:

```typescript
import { useState } from "react";
import { useWindowStore } from "../stores/window-store";
import { useThemeStore } from "../stores/theme-store";
import { MAX_WINDOWS } from "../lib/constants";
import ContactModal from "./ContactModal";

export default function Header() {
  const windowCount = useWindowStore((s) => s.windows.length);
  const addWindow = useWindowStore((s) => s.addWindow);
  const atCapacity = windowCount >= MAX_WINDOWS;
  const [contactOpen, setContactOpen] = useState(false);
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggle);

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      {/* Left: logo + title + attribution */}
      <div className="flex items-center gap-2">
        <img src="/favicon.png" alt="PACE logo" className="w-10 h-10" />
        <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-white">PACE</h1>
        <span className="text-xs font-thin italic text-zinc-400 dark:text-zinc-500">
          built by{" "}
          <a
            href="https://itsnemo.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors"
          >
            itsnemo.dev
          </a>
        </span>
      </div>

      {/* Right: theme toggle + icons + new window */}
      <div className="flex items-center gap-3">
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
          className="text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors text-lg leading-none"
        >
          {theme === "light" ? "☽" : "☀"}
        </button>

        {/* Ko-fi support */}
        <a
          href="https://ko-fi.com/devbynemo"
          target="_blank"
          rel="noopener noreferrer"
          title="Support PACE on Ko-fi"
          className="text-zinc-400 hover:text-red-500 dark:hover:text-red-400 transition-colors text-lg leading-none"
        >
          ♥
        </a>

        {/* Contact / submissions */}
        <button
          onClick={() => setContactOpen(true)}
          title="Report a bug or request a race"
          className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors text-lg leading-none"
        >
          ✉
        </button>

        <button
          onClick={() => addWindow()}
          disabled={atCapacity}
          className="text-sm px-4 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          + New Window {windowCount > 0 && `(${windowCount}/${MAX_WINDOWS})`}
        </button>
      </div>

      <ContactModal open={contactOpen} onClose={() => setContactOpen(false)} />
    </header>
  );
}
```

- [ ] **Step 2: Update WindowGrid empty state for theme**

In `apps/web/src/components/WindowGrid.tsx`, update the empty state text class:

```typescript
      <div className="flex items-center justify-center h-96 text-zinc-400 dark:text-zinc-500">
```

- [ ] **Step 3: Update SplitChart theme-aware colors**

In `apps/web/src/components/SplitChart.tsx`, update the grid and axis colors to be theme-aware. Since Recharts doesn't use Tailwind classes, we need to read the theme from the store. Add import:

```typescript
import { useThemeStore } from "../stores/theme-store";
```

Inside the `SplitChart` component, add:

```typescript
  const theme = useThemeStore((s) => s.theme);
  const gridColor = theme === "dark" ? "#333" : "#e4e4e7";
  const axisColor = theme === "dark" ? "#999" : "#71717a";
  const tooltipBg = theme === "dark" ? "#18181b" : "#ffffff";
  const tooltipBorder = theme === "dark" ? "#3f3f46" : "#e4e4e7";
  const refLineColor = theme === "dark" ? "#666" : "#a1a1aa";
```

Then use these in the JSX: replace `stroke="#333"` with `stroke={gridColor}`, replace `fill: "#999"` with `fill: axisColor`, etc. Update the CustomTooltip wrapper div class:

```typescript
    <div style={{ backgroundColor: tooltipBg, border: `1px solid ${tooltipBorder}` }} className="rounded-lg px-3 py-2 shadow-lg">
```

Pass `theme` as a prop to CustomTooltip, or use the store inside it.

- [ ] **Step 4: Verify build and visual check**

```bash
npx tsc --noEmit
npm run dev
```

Toggle between light and dark modes in the browser.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components/Header.tsx apps/web/src/components/WindowGrid.tsx apps/web/src/components/SplitChart.tsx
git commit -m "feat: theme toggle in header, theme-aware styling across all components"
```

---

### Task 12: Custom athlete/splits entry

**Files:**
- Create: `apps/web/src/stores/custom-athlete-store.ts`
- Create: `apps/web/src/__tests__/custom-athlete.test.ts`
- Create: `apps/web/src/components/CustomAthleteModal.tsx`
- Modify: `apps/web/src/components/PaceWindow.tsx`
- Modify: `apps/web/src/types/pace.ts`
- Modify: `apps/web/src/stores/window-store.ts`

- [ ] **Step 1: Add CustomAthlete type**

In `apps/web/src/types/pace.ts`, add:

```typescript
export interface CustomAthlete {
  id: string; // client-generated UUID
  name: string;
  isCustom: true;
  isPaceLine: boolean;
  splits: Split[];
  distance: string;
  time_str: string;
}
```

- [ ] **Step 2: Write failing tests for pace line generation**

Create `apps/web/src/__tests__/custom-athlete.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { generateEvenSplits, generateNegativeSplits, generatePositiveSplits } from "../stores/custom-athlete-store";

describe("generateEvenSplits", () => {
  it("generates 4 even splits for a 4:00 mile", () => {
    const splits = generateEvenSplits(240, 4);
    expect(splits).toHaveLength(4);
    expect(splits[0].lap_s).toBeCloseTo(60);
    expect(splits[3].elapsed_s).toBeCloseTo(240);
  });
});

describe("generateNegativeSplits", () => {
  it("second half is faster by the given percentage", () => {
    const splits = generateNegativeSplits(240, 4, 5);
    const firstHalfLap = splits[0].lap_s!;
    const secondHalfLap = splits[2].lap_s!;
    expect(secondHalfLap).toBeLessThan(firstHalfLap);
    expect(splits[3].elapsed_s).toBeCloseTo(240);
  });
});

describe("generatePositiveSplits", () => {
  it("second half is slower by the given percentage", () => {
    const splits = generatePositiveSplits(240, 4, 5);
    const firstHalfLap = splits[0].lap_s!;
    const secondHalfLap = splits[2].lap_s!;
    expect(secondHalfLap).toBeGreaterThan(firstHalfLap);
    expect(splits[3].elapsed_s).toBeCloseTo(240);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/custom-athlete.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement pace line generation**

Create `apps/web/src/stores/custom-athlete-store.ts`:

```typescript
import type { Split } from "../types/pace";

let nextCustomId = 0;
export function genCustomId(): string {
  return `custom_${++nextCustomId}`;
}

export function generateEvenSplits(totalSeconds: number, numSplits: number): Split[] {
  const lapTime = totalSeconds / numSplits;
  return Array.from({ length: numSplits }, (_, i) => ({
    id: `gen_${i}`,
    result_id: "",
    label: `S${i + 1}`,
    ordinal: i,
    distance_m: null,
    elapsed_s: lapTime * (i + 1),
    lap_s: lapTime,
    place: null,
  }));
}

export function generateNegativeSplits(
  totalSeconds: number,
  numSplits: number,
  pctFaster: number
): Split[] {
  // First half laps are slower, second half faster by pctFaster%
  const half = Math.floor(numSplits / 2);
  const factor = pctFaster / 100;
  // Let slowLap * half + fastLap * (numSplits - half) = totalSeconds
  // fastLap = slowLap * (1 - factor)
  const slowLap = totalSeconds / (half + (numSplits - half) * (1 - factor));
  const fastLap = slowLap * (1 - factor);

  let elapsed = 0;
  return Array.from({ length: numSplits }, (_, i) => {
    const lap = i < half ? slowLap : fastLap;
    elapsed += lap;
    return {
      id: `gen_${i}`,
      result_id: "",
      label: `S${i + 1}`,
      ordinal: i,
      distance_m: null,
      elapsed_s: i === numSplits - 1 ? totalSeconds : elapsed,
      lap_s: lap,
      place: null,
    };
  });
}

export function generatePositiveSplits(
  totalSeconds: number,
  numSplits: number,
  pctSlower: number
): Split[] {
  const half = Math.floor(numSplits / 2);
  const factor = pctSlower / 100;
  // fastLap * half + slowLap * (numSplits - half) = totalSeconds
  // slowLap = fastLap * (1 + factor)
  const fastLap = totalSeconds / (half + (numSplits - half) * (1 + factor));
  const slowLap = fastLap * (1 + factor);

  let elapsed = 0;
  return Array.from({ length: numSplits }, (_, i) => {
    const lap = i < half ? fastLap : slowLap;
    elapsed += lap;
    return {
      id: `gen_${i}`,
      result_id: "",
      label: `S${i + 1}`,
      ordinal: i,
      distance_m: null,
      elapsed_s: i === numSplits - 1 ? totalSeconds : elapsed,
      lap_s: lap,
      place: null,
    };
  });
}

export function timeStringToSeconds(str: string): number | null {
  const parts = str.trim().split(":");
  if (parts.length === 2) {
    const m = parseFloat(parts[0]);
    const s = parseFloat(parts[1]);
    if (isNaN(m) || isNaN(s)) return null;
    return m * 60 + s;
  }
  if (parts.length === 3) {
    const h = parseFloat(parts[0]);
    const m = parseFloat(parts[1]);
    const s = parseFloat(parts[2]);
    if (isNaN(h) || isNaN(m) || isNaN(s)) return null;
    return h * 3600 + m * 60 + s;
  }
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/custom-athlete.test.ts
```

Expected: all 3 tests PASS.

- [ ] **Step 6: Create CustomAthleteModal component**

Create `apps/web/src/components/CustomAthleteModal.tsx`. This component has two tabs (Manual Splits and Pace Line Generator). Due to the complexity, the implementing engineer should:

1. Create a modal with tab navigation (Manual / Pace Line)
2. **Manual tab**: name input, dynamic split rows (label + elapsed time), add/remove rows, "Add to Window" button
3. **Pace Line tab**: target time input (mm:ss.ss), number of splits input, strategy dropdown (Even/Negative/Positive), percentage input for neg/pos, preview of generated splits, "Add to Window" button
4. Use `generateEvenSplits`, `generateNegativeSplits`, `generatePositiveSplits` from `custom-athlete-store.ts`
5. Convert the custom entry into a `WindowAthleteData` object with `isCustom: true` flag
6. All theme-aware classes (light + dark variants)
7. Full-screen bottom sheet on mobile (`sm:` breakpoint switches to centered modal)

The modal should construct an `AthleteResult` with synthetic IDs and pass it to the parent's `onAdd` callback.

- [ ] **Step 7: Update PaceWindow to add "+ Custom" button**

In `apps/web/src/components/PaceWindow.tsx`, add state for modal visibility and render CustomAthleteModal:

```typescript
import { useState } from "react";
import CustomAthleteModal from "./CustomAthleteModal";
```

Add state: `const [customOpen, setCustomOpen] = useState(false);`

Add button after UnifiedSearch:

```typescript
      {/* Custom athlete button */}
      <div className="px-3 py-1 border-b border-zinc-200 dark:border-zinc-800">
        <button
          onClick={() => setCustomOpen(true)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300"
        >
          + Custom athlete / pace line
        </button>
      </div>

      {customOpen && (
        <CustomAthleteModal
          onAdd={(ar) => { addAthlete(windowId, ar); setCustomOpen(false); }}
          onClose={() => setCustomOpen(false)}
        />
      )}
```

- [ ] **Step 8: Update SplitChart to render custom athletes with dashed lines**

In `apps/web/src/components/SplitChart.tsx`, detect custom athletes and use dashed stroke. When rendering `<Line>` components, check if the athlete is custom:

```typescript
                <Line
                  key={a.athleteResult.athlete.id}
                  type="monotone"
                  dataKey={a.athleteResult.athlete.id}
                  stroke={a.color}
                  strokeWidth={2}
                  strokeDasharray={a.athleteResult.athlete.id.startsWith("custom_") ? "8 4" : undefined}
                  dot={{ r: 5, fill: a.color }}
                  activeDot={{ r: 7, stroke: theme === "dark" ? "#fff" : "#000", strokeWidth: 2 }}
                  connectNulls
                />
```

- [ ] **Step 9: Verify build**

```bash
npx tsc --noEmit
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: custom athlete/splits entry modal with pace line generator"
```

---

### Task 13: Mobile responsive layout

**Files:**
- Modify: `apps/web/src/components/WindowGrid.tsx`
- Create: `apps/web/src/components/MobileTabBar.tsx`
- Modify: `apps/web/src/components/Header.tsx`

- [ ] **Step 1: Create MobileTabBar component**

Create `apps/web/src/components/MobileTabBar.tsx`:

```typescript
interface MobileTabBarProps {
  windowIds: string[];
  activeId: string;
  onSelect: (id: string) => void;
}

export default function MobileTabBar({
  windowIds,
  activeId,
  onSelect,
}: MobileTabBarProps) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-center gap-2 bg-white/90 backdrop-blur border-t border-zinc-200 dark:bg-zinc-950/90 dark:border-zinc-800 px-4 py-2 sm:hidden">
      {windowIds.map((id, i) => (
        <button
          key={id}
          onClick={() => onSelect(id)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            activeId === id
              ? "bg-blue-600 text-white"
              : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
          }`}
        >
          W{i + 1}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Update WindowGrid for responsive layout with mobile tab switching**

Replace `apps/web/src/components/WindowGrid.tsx`:

```typescript
import { useState } from "react";
import { useWindowStore } from "../stores/window-store";
import PaceWindow from "./PaceWindow";
import MobileTabBar from "./MobileTabBar";

function gridClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count <= 2) return "sm:grid-cols-2";
  if (count <= 4) return "sm:grid-cols-2";
  return "sm:grid-cols-2 lg:grid-cols-3";
}

export default function WindowGrid() {
  const windows = useWindowStore((s) => s.windows);
  const [activeTab, setActiveTab] = useState<string | null>(null);

  if (windows.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-zinc-400 dark:text-zinc-500">
        Click &quot;+ New Window&quot; to start comparing athletes
      </div>
    );
  }

  const activeId = activeTab && windows.some((w) => w.id === activeTab)
    ? activeTab
    : windows[0].id;

  return (
    <>
      {/* Desktop grid */}
      <div className={`hidden sm:grid ${gridClass(windows.length)} gap-4 p-4`}>
        {windows.map((w) => (
          <PaceWindow key={w.id} windowId={w.id} />
        ))}
      </div>

      {/* Mobile: single window + tab bar */}
      <div className="sm:hidden p-3 pb-16">
        <PaceWindow windowId={activeId} />
      </div>
      {windows.length > 1 && (
        <MobileTabBar
          windowIds={windows.map((w) => w.id)}
          activeId={activeId}
          onSelect={setActiveTab}
        />
      )}
    </>
  );
}
```

- [ ] **Step 3: Make Header responsive**

In `apps/web/src/components/Header.tsx`, make the layout responsive. On mobile, hide some text and compact the buttons:

Update the header tag class:

```typescript
    <header className="flex items-center justify-between px-4 sm:px-6 py-3 sm:py-4 border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
```

Hide the attribution text on mobile:

```typescript
        <span className="hidden sm:inline text-xs font-thin italic text-zinc-400 dark:text-zinc-500">
```

Make the New Window button more compact on mobile:

```typescript
        <button
          onClick={() => addWindow()}
          disabled={atCapacity}
          className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <span className="sm:hidden">+</span>
          <span className="hidden sm:inline">+ New Window {windowCount > 0 && `(${windowCount}/${MAX_WINDOWS})`}</span>
        </button>
```

- [ ] **Step 4: Verify responsive layout**

```bash
npm run dev
```

Test at 375px (SE), 390px (13 Mini), 393px (standard), 768px (tablet), 1024px+ (desktop) using browser dev tools.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: mobile responsive layout with tab bar window switching"
```

---

### Task 14: Frontend design pass (user approval required)

**Files:** All component files — exact changes determined after design concepts are approved.

- [ ] **Step 1: Invoke frontend-design + ui-ux-pro-max skills**

Use `frontend-design` and `ui-ux-pro-max` skills to generate design concepts for:
1. Search + window layout (desktop)
2. Mobile layout + tab switching
3. Chart styling + legend
4. Light/dark theme color systems
5. 10-color athlete palette

Present each concept to the user for approval.

- [ ] **Step 2: Apply approved design to all components**

Update Tailwind classes, typography, colors, spacing across all components based on approved design. This includes:
- Font loading (add Google Fonts link or local fonts)
- Custom color palette in tailwind.config.ts
- Component-level styling updates
- Micro-interactions / transitions

- [ ] **Step 3: Verify on all breakpoints**

Test light mode + dark mode at all 6 screen sizes (375, 390, 393, 430, 768, 1024+).

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: apply branded design system — typography, colors, layout polish"
```

---

### Task 15: Final verification + build

**Files:** None — verification only.

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/ncionelo/Downloads/JOBS/PROJECTS/PACE/pace/apps/web
npx vitest run
```

All tests must pass.

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Must complete with no errors. Check bundle size:

```bash
ls -la dist/assets/*.js | awk '{print $5/1024"KB", $9}'
```

JS bundle should be under ~200KB gzipped.

- [ ] **Step 3: Verify in browser**

```bash
npm run preview
```

Smoke test:
- Light mode loads by default
- Toggle to dark mode and back
- Search for a race by conference acronym (e.g., "SEC")
- Search for an athlete by name
- Select a race → athletes scoped to that race
- Add 10 athletes (verify 10 colors work)
- Add a custom pace line
- Verify chart renders with dashed custom line
- Click a race name → opens source URL
- Test on mobile viewport: window tab switching, filter collapse
- Verify no 600y or out-of-scope distances appear

- [ ] **Step 4: Commit any fixes from smoke test**

```bash
git add -A
git commit -m "fix: smoke test fixes from final verification"
```

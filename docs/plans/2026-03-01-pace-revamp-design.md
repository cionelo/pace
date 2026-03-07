# PACE Revamp Design

## Overview

PACE is a web application for coaches to analyze and compare race split data for D1/D2 collegiate runners. Coaches can visualize pacing patterns across athletes, races, and competitions through interactive split-to-split graphs in a multi-window layout.

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | React + Vite + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Charts | Recharts |
| Database | Supabase (Postgres) |
| Pipeline | Python (existing scraper + new validation/upload) |
| Deployment | Localhost MVP, Netlify-ready via git |

## Architecture: Monorepo

```
pace/
├── apps/web/                  React + Vite frontend
│   ├── src/
│   │   ├── components/
│   │   │   ├── Header.tsx
│   │   │   ├── WindowGrid.tsx
│   │   │   ├── PaceWindow.tsx
│   │   │   ├── SplitChart.tsx
│   │   │   ├── AthleteSearch.tsx
│   │   │   ├── Legend.tsx
│   │   │   └── DistanceSelector.tsx
│   │   ├── hooks/
│   │   │   ├── useWindows.ts        window state management
│   │   │   └── useAthleteSearch.ts  search/filter logic
│   │   ├── lib/
│   │   │   └── db.ts               Supabase client + query functions
│   │   ├── types/
│   │   │   └── pace.ts             shared TypeScript types
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
├── py/                         Python pipeline
│   ├── pace_scraper.py         existing multi-vendor scraper
│   ├── pace_normalize.py       existing normalizer
│   ├── pace_validate.py        NEW validation layer
│   ├── pace_upload.py          NEW Supabase uploader
│   ├── pace_ingest.py          NEW orchestrator
│   └── requirements.txt
│
├── supabase/
│   └── migrations/
│       └── 001_initial_schema.sql
│
├── docs/plans/
├── .env.example
└── README.md
```

## Data Model (Supabase)

### Tables

**events**
- `id` (uuid, PK)
- `name` (text) — e.g., "2025 Sun Belt XC Championship"
- `date` (date)
- `location` (text)
- `gender` (text) — "Men" or "Women"
- `distance` (text) — "800m", "1500m", "5K", etc.
- `season` (text) — "indoor" or "outdoor"
- `provider` (text) — scraper source identifier

**athletes**
- `id` (uuid, PK)
- `name` (text)
- `team` (text)
- Unique constraint on (name, team) for deduplication

**results**
- `id` (uuid, PK)
- `event_id` (uuid, FK → events)
- `athlete_id` (uuid, FK → athletes)
- `place` (integer)
- `time_s` (numeric) — finish time in seconds
- `time_str` (text) — display format e.g., "1:52.34"
- `points` (integer, nullable)

**splits**
- `id` (uuid, PK)
- `result_id` (uuid, FK → results)
- `label` (text) — "1K", "200m", etc.
- `ordinal` (integer) — position in sequence
- `elapsed_s` (numeric) — cumulative time
- `lap_s` (numeric) — split-to-split time
- `place` (integer, nullable) — place at this split point

**teams**
- `id` (uuid, PK)
- `name` (text, unique)
- `primary_hex` (text, nullable) — manually assigned later
- `logo_url` (text, nullable)

### Key Queries (exposed via db.ts)

- `getEvents(filters?)` — list events, filterable by gender/distance/season
- `getEventResults(eventId)` — all athletes + splits for one event
- `getAthleteHistory(athleteId)` — all results across events for one athlete
- `searchAthletes(query, filters?)` — name/team search scoped by distance/event

## Data Pipeline

### Ingestion flow

```
URL(s) → pace_ingest.py → scrape → normalize → validate → upload
```

Single command interface:
```bash
python py/pace_ingest.py "https://live.xpresstiming.com/..." "https://..."
python py/pace_ingest.py --from race_input.txt
```

### Validation rules (pace_validate.py)

Runs BEFORE any Supabase upload. Blocks upload on failure.

| Check | Severity |
|-------|----------|
| Split elapsed times must be monotonically increasing | BLOCK |
| No negative lap times | BLOCK |
| No lap faster than world-record pace for distance | BLOCK |
| Finish time within plausible range for distance | BLOCK |
| No empty names or encoding garbage | BLOCK |
| Duplicate athlete in same event | BLOCK |
| Schema conforms to pace.v1 | BLOCK |
| Athletes missing >50% splits vs peers | WARN + BLOCK |

On failure, outputs a clear report identifying the specific athletes and issues, plus the provider name. Raw files are always saved to `data/<event_id>/` regardless for inspection.

`--force-upload` flag available for manually verified edge cases.

## Frontend Design

### Window System

Fixed grid layout, max 6 windows:
- 1 window → full width
- 2 windows → 2 columns
- 3-4 → 2x2
- 5-6 → 2x3

Each window is self-contained with:

1. **Distance selector** — locks window to a race distance
2. **Athlete search panel** — collapsible, with cascading filters
3. **Split-to-split graph** — the core visualization
4. **Legend** — athlete names + times with hover detail

### The Graph (SplitChart)

- **X-axis:** distance covered (0 → race length)
- **Y-axis:** split-to-split time (NOT cumulative) — shows pacing deviations; flat = even pace, spikes = slow splits, dips = surges
- Each athlete = colored line with nodes at split points
- **Hover tooltip:** primary (large) = lap split (e.g., "26.3s"), secondary (italic) = cumulative elapsed (e.g., "55.1")
- Click athlete name in legend → toggles line visibility
- Max 5 athletes per window

### Color System

5 hardcoded distinct colors assigned positionally:
1. `#2563EB` (blue)
2. `#DC2626` (red)
3. `#16A34A` (green)
4. `#9333EA` (purple)
5. `#EA580C` (orange)

Athlete 1 gets color 1, etc. No team-color logic in MVP. Teams get colors later via manual Supabase edits.

### Legend Behavior

Displays: colored dot + athlete name + finish time. Hover on name shows tooltip with: full name, team, competition name, date.

### Athlete Search Panel

Collapsible panel inside each window with cascading filters:

1. **Competition** dropdown — narrows teams and athletes to that meet
2. **Team/School** dropdown — further narrows athletes (multi-select capable)
3. **Athlete name** search — text autocomplete filtered by above selections

All filters work independently. Coach can skip competition and search by name across all events. Results show: name, team, time, competition, date. Click [+] to add (max 5), [x] to remove. Counter shows "2/5".

Cross-event comparison is supported: clear filters between athlete additions to pull from different competitions onto the same graph.

### State Management

Zustand or React Context for:
- Array of open windows (each with distance + selected athlete IDs)
- Shared athlete/event data cache

### Component Tree

```
<App>
  <Header />                     logo, [+ Add Window] button
  <WindowGrid>                   manages grid layout
    <PaceWindow>                 one per open window
      <DistanceSelector />       dropdown for race distance
      <AthleteSearch />          collapsible filter/search panel
      <SplitChart />             Recharts split-to-split visualization
      <Legend />                 athlete list with color + toggle + hover
    </PaceWindow>
  </WindowGrid>
</App>
```

## Agent Parallelization Strategy

Four spec documents enable independent agent work:

| Spec Doc | Scope | Can Start |
|----------|-------|-----------|
| `DATABASE-SPEC.md` | Supabase schema, migrations, RLS, db.ts queries | Immediately (no dependencies) |
| `CHART-SPEC.md` | SplitChart + Recharts config, tooltips, overlays | Immediately (uses mock data) |
| `FRONTEND-SPEC.md` | Window system, search panel, grid, state mgmt | After DATABASE-SPEC defines types |
| `BACKEND-SPEC.md` | Python validate + upload + ingest pipeline | After DATABASE-SPEC defines schema |

### Execution phases

**Phase 1 (parallel):**
- Agent A: DATABASE-SPEC → schema + migrations + typed query layer
- Agent B: CHART-SPEC → SplitChart component with mock data

**Phase 2 (parallel, after Phase 1):**
- Agent C: FRONTEND-SPEC → window system, search, grid layout
- Agent D: BACKEND-SPEC → Python validation + upload + ingest

**Phase 3 (manual):**
- Wire components together, end-to-end testing

## Deployment

- MVP: localhost via `npm run dev`
- Production-ready: Netlify auto-deploy from git (Vite builds to `dist/`)
- Supabase handles backend — no server to deploy

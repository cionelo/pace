# PACE Revamp Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a multi-window split-visualization web app for collegiate race analysis, backed by Supabase and fed by an existing Python scraper pipeline.

**Architecture:** React + Vite + TypeScript frontend in `apps/web/`, Supabase Postgres backend, Python ingestion pipeline in `py/`. Monorepo structure with clear separation for parallel agent work.

**Tech Stack:** React 19, Vite 6, TypeScript, Tailwind CSS 4, shadcn/ui, Recharts, Zustand, Supabase JS client, Python 3.11+

---

## Phase 1: Foundation (parallel-safe — no cross-dependencies)

### Task 1: Scaffold the new repo and monorepo structure

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/src/index.css`
- Create: `.env.example`
- Create: `.gitignore`

**Step 1: Initialize the new repo**

```bash
mkdir pace && cd pace
git init
```

**Step 2: Create apps/web with Vite + React + TypeScript**

```bash
cd pace
npm create vite@latest apps/web -- --template react-ts
cd apps/web
npm install
```

**Step 3: Install core dependencies**

```bash
cd apps/web
npm install recharts zustand @supabase/supabase-js
npm install -D tailwindcss @tailwindcss/vite
```

**Step 4: Configure Tailwind with Vite plugin**

`apps/web/vite.config.ts`:
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
});
```

`apps/web/src/index.css`:
```css
@import "tailwindcss";
```

**Step 5: Set up shadcn/ui**

```bash
cd apps/web
npx shadcn@latest init
```

Select: TypeScript, Default style, Neutral base color, CSS variables.

**Step 6: Create .env.example at repo root**

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

**Step 7: Create root .gitignore**

```
node_modules/
dist/
.env
.env.local
__pycache__/
*.pyc
venv/
.venv/
data/
```

**Step 8: Create minimal App.tsx to verify setup**

`apps/web/src/App.tsx`:
```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center">
      <h1 className="text-3xl font-bold">PACE</h1>
    </div>
  );
}
```

**Step 9: Verify dev server runs**

```bash
cd apps/web && npm run dev
```
Expected: Browser shows "PACE" centered on dark background at localhost:5173.

**Step 10: Copy Python scripts from old repo**

```bash
mkdir -p py
cp <old-repo>/py/pace_scraper.py py/
cp <old-repo>/py/pace_normalize.py py/
```

Create `py/requirements.txt`:
```
playwright
beautifulsoup4
lxml
requests
supabase
python-dotenv
```

**Step 11: Commit**

```bash
git add -A
git commit -m "feat: scaffold monorepo with Vite + React + TS + Tailwind"
```

---

### Task 2: Supabase schema and migrations

**Files:**
- Create: `supabase/migrations/001_initial_schema.sql`
- Create: `apps/web/src/types/pace.ts`
- Create: `apps/web/src/lib/supabase.ts`

**Step 1: Create the Supabase project**

Go to supabase.com, create a new project. Copy the URL and anon key into `apps/web/.env.local`.

**Step 2: Write the migration SQL**

`supabase/migrations/001_initial_schema.sql`:
```sql
-- Teams
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  primary_hex text,
  logo_url text,
  created_at timestamptz default now()
);

-- Events (one row per race)
create table events (
  id uuid primary key default gen_random_uuid(),
  source_id text unique not null,
  name text not null,
  date date,
  location text,
  gender text not null check (gender in ('Men', 'Women')),
  distance text not null,
  season text check (season in ('indoor', 'outdoor', 'xc')),
  provider text,
  created_at timestamptz default now()
);

-- Athletes (deduplicated by name + team)
create table athletes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team_id uuid references teams(id),
  created_at timestamptz default now(),
  unique(name, team_id)
);

-- Results (one row per athlete per event)
create table results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  place integer,
  time_s numeric,
  time_str text,
  points integer,
  created_at timestamptz default now(),
  unique(event_id, athlete_id)
);

-- Splits (one row per split point per result)
create table splits (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references results(id) on delete cascade,
  label text not null,
  ordinal integer not null,
  elapsed_s numeric,
  lap_s numeric,
  place integer
);

-- Indexes for common query patterns
create index idx_results_event on results(event_id);
create index idx_results_athlete on results(athlete_id);
create index idx_splits_result on splits(result_id);
create index idx_events_distance on events(distance);
create index idx_events_gender on events(gender);
create index idx_athletes_name on athletes using gin(name gin_trgm_ops);

-- Enable trigram extension for fuzzy name search
create extension if not exists pg_trgm;

-- Row Level Security (read-only public access)
alter table teams enable row level security;
alter table events enable row level security;
alter table athletes enable row level security;
alter table results enable row level security;
alter table splits enable row level security;

create policy "Public read" on teams for select using (true);
create policy "Public read" on events for select using (true);
create policy "Public read" on athletes for select using (true);
create policy "Public read" on results for select using (true);
create policy "Public read" on splits for select using (true);
```

**Step 3: Run migration in Supabase**

Go to Supabase Dashboard → SQL Editor → paste and run the migration SQL.

**Step 4: Write TypeScript types**

`apps/web/src/types/pace.ts`:
```ts
export interface Team {
  id: string;
  name: string;
  primary_hex: string | null;
  logo_url: string | null;
}

export interface Event {
  id: string;
  source_id: string;
  name: string;
  date: string | null;
  location: string | null;
  gender: "Men" | "Women";
  distance: string;
  season: "indoor" | "outdoor" | "xc" | null;
  provider: string | null;
}

export interface Athlete {
  id: string;
  name: string;
  team_id: string | null;
}

export interface Result {
  id: string;
  event_id: string;
  athlete_id: string;
  place: number | null;
  time_s: number | null;
  time_str: string | null;
  points: number | null;
}

export interface Split {
  id: string;
  result_id: string;
  label: string;
  ordinal: number;
  elapsed_s: number | null;
  lap_s: number | null;
  place: number | null;
}

// Composite types for frontend use
export interface AthleteResult {
  athlete: Athlete;
  team: Team | null;
  result: Result;
  event: Event;
  splits: Split[];
}

export interface WindowAthleteData {
  athleteResult: AthleteResult;
  color: string;
  visible: boolean;
}
```

**Step 5: Write Supabase client**

`apps/web/src/lib/supabase.ts`:
```ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
```

**Step 6: Commit**

```bash
git add supabase/ apps/web/src/types/ apps/web/src/lib/supabase.ts
git commit -m "feat: add Supabase schema, TS types, and client"
```

---

### Task 3: Database query layer (db.ts)

**Files:**
- Create: `apps/web/src/lib/db.ts`

**Step 1: Write query functions**

`apps/web/src/lib/db.ts`:
```ts
import { supabase } from "./supabase";
import type { Event, AthleteResult } from "../types/pace";

interface EventFilters {
  gender?: string;
  distance?: string;
  season?: string;
}

export async function getEvents(filters?: EventFilters): Promise<Event[]> {
  let query = supabase.from("events").select("*").order("date", { ascending: false });

  if (filters?.gender) query = query.eq("gender", filters.gender);
  if (filters?.distance) query = query.eq("distance", filters.distance);
  if (filters?.season) query = query.eq("season", filters.season);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getEventResults(eventId: string): Promise<AthleteResult[]> {
  const { data, error } = await supabase
    .from("results")
    .select(`
      *,
      athlete:athletes!inner(*, team:teams(*)),
      event:events!inner(*),
      splits(*)
    `)
    .eq("event_id", eventId)
    .order("place", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    athlete: { id: row.athlete.id, name: row.athlete.name, team_id: row.athlete.team_id },
    team: row.athlete.team ?? null,
    result: { id: row.id, event_id: row.event_id, athlete_id: row.athlete_id, place: row.place, time_s: row.time_s, time_str: row.time_str, points: row.points },
    event: row.event,
    splits: (row.splits ?? []).sort((a: any, b: any) => a.ordinal - b.ordinal),
  }));
}

interface AthleteSearchFilters {
  eventId?: string;
  teamName?: string;
  distance?: string;
}

export async function searchAthletes(
  query: string,
  filters?: AthleteSearchFilters
): Promise<AthleteResult[]> {
  let dbQuery = supabase
    .from("results")
    .select(`
      *,
      athlete:athletes!inner(*, team:teams(*)),
      event:events!inner(*),
      splits(*)
    `)
    .order("place", { ascending: true })
    .limit(50);

  if (query) {
    dbQuery = dbQuery.ilike("athlete.name", `%${query}%`);
  }
  if (filters?.eventId) {
    dbQuery = dbQuery.eq("event_id", filters.eventId);
  }
  if (filters?.distance) {
    dbQuery = dbQuery.eq("event.distance", filters.distance);
  }

  const { data, error } = await dbQuery;
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    athlete: { id: row.athlete.id, name: row.athlete.name, team_id: row.athlete.team_id },
    team: row.athlete.team ?? null,
    result: { id: row.id, event_id: row.event_id, athlete_id: row.athlete_id, place: row.place, time_s: row.time_s, time_str: row.time_str, points: row.points },
    event: row.event,
    splits: (row.splits ?? []).sort((a: any, b: any) => a.ordinal - b.ordinal),
  }));
}

export async function getTeamsForEvent(eventId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("results")
    .select("athlete:athletes!inner(team:teams!inner(name))")
    .eq("event_id", eventId);

  if (error) throw error;

  const names = new Set<string>();
  (data ?? []).forEach((row: any) => {
    if (row.athlete?.team?.name) names.add(row.athlete.team.name);
  });
  return [...names].sort();
}

export async function getDistances(): Promise<string[]> {
  const { data, error } = await supabase
    .from("events")
    .select("distance")
    .order("distance");

  if (error) throw error;

  return [...new Set((data ?? []).map((e: any) => e.distance))];
}
```

**Step 2: Commit**

```bash
git add apps/web/src/lib/db.ts
git commit -m "feat: add Supabase query layer"
```

---

### Task 4: SplitChart component with mock data

**Files:**
- Create: `apps/web/src/components/SplitChart.tsx`
- Create: `apps/web/src/lib/constants.ts`
- Create: `apps/web/src/lib/mock-data.ts`

**Step 1: Define color palette constants**

`apps/web/src/lib/constants.ts`:
```ts
export const ATHLETE_COLORS = [
  "#2563EB", // blue
  "#DC2626", // red
  "#16A34A", // green
  "#9333EA", // purple
  "#EA580C", // orange
] as const;

export const MAX_ATHLETES_PER_WINDOW = 5;
export const MAX_WINDOWS = 6;
```

**Step 2: Create mock data for development**

`apps/web/src/lib/mock-data.ts`:
```ts
import type { AthleteResult } from "../types/pace";

export const MOCK_ATHLETE_RESULTS: AthleteResult[] = [
  {
    athlete: { id: "a1", name: "Jane Smith", team_id: "t1" },
    team: { id: "t1", name: "Coastal Carolina", primary_hex: null, logo_url: null },
    result: { id: "r1", event_id: "e1", athlete_id: "a1", place: 1, time_s: 1012.1, time_str: "16:52.10", points: null },
    event: { id: "e1", source_id: "2149044", name: "2025 Sun Belt XC Championship", date: "2025-10-31", location: "Troy, AL", gender: "Women", distance: "5K", season: "xc", provider: "legacy_spa" },
    splits: [
      { id: "s1", result_id: "r1", label: "1K", ordinal: 0, elapsed_s: 203.4, lap_s: 203.4, place: 3 },
      { id: "s2", result_id: "r1", label: "2K", ordinal: 1, elapsed_s: 408.3, lap_s: 204.9, place: 2 },
      { id: "s3", result_id: "r1", label: "3K", ordinal: 2, elapsed_s: 610.0, lap_s: 201.7, place: 1 },
      { id: "s4", result_id: "r1", label: "4K", ordinal: 3, elapsed_s: 812.5, lap_s: 202.5, place: 1 },
      { id: "s5", result_id: "r1", label: "5K", ordinal: 4, elapsed_s: 1012.1, lap_s: 199.6, place: 1 },
    ],
  },
  {
    athlete: { id: "a2", name: "Maria Lopez", team_id: "t2" },
    team: { id: "t2", name: "Texas State", primary_hex: null, logo_url: null },
    result: { id: "r2", event_id: "e1", athlete_id: "a2", place: 2, time_s: 1021.5, time_str: "17:01.50", points: null },
    event: { id: "e1", source_id: "2149044", name: "2025 Sun Belt XC Championship", date: "2025-10-31", location: "Troy, AL", gender: "Women", distance: "5K", season: "xc", provider: "legacy_spa" },
    splits: [
      { id: "s6", result_id: "r2", label: "1K", ordinal: 0, elapsed_s: 200.0, lap_s: 200.0, place: 1 },
      { id: "s7", result_id: "r2", label: "2K", ordinal: 1, elapsed_s: 405.0, lap_s: 205.0, place: 1 },
      { id: "s8", result_id: "r2", label: "3K", ordinal: 2, elapsed_s: 614.0, lap_s: 209.0, place: 2 },
      { id: "s9", result_id: "r2", label: "4K", ordinal: 3, elapsed_s: 820.0, lap_s: 206.0, place: 2 },
      { id: "s10", result_id: "r2", label: "5K", ordinal: 4, elapsed_s: 1021.5, lap_s: 201.5, place: 2 },
    ],
  },
];
```

**Step 3: Build SplitChart component**

`apps/web/src/components/SplitChart.tsx`:
```tsx
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { WindowAthleteData } from "../types/pace";
import { ATHLETE_COLORS } from "../lib/constants";

interface SplitChartProps {
  athletes: WindowAthleteData[];
}

function formatSeconds(s: number): string {
  const min = Math.floor(s / 60);
  const sec = s % 60;
  if (min === 0) return `${sec.toFixed(1)}s`;
  return `${min}:${sec.toFixed(1).padStart(4, "0")}`;
}

interface ChartPoint {
  label: string;
  [athleteId: string]: number | string;
}

function buildChartData(athletes: WindowAthleteData[]): ChartPoint[] {
  // Collect all unique split labels in order from first athlete with splits
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

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span className="text-sm font-medium text-white">
            {formatSeconds(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function SplitChart({ athletes }: SplitChartProps) {
  const visibleAthletes = athletes.filter((a) => a.visible);
  const data = buildChartData(athletes);

  if (data.length === 0 || visibleAthletes.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
        Add athletes to see split data
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#333" />
        <XAxis dataKey="label" tick={{ fill: "#999", fontSize: 12 }} />
        <YAxis
          tick={{ fill: "#999", fontSize: 12 }}
          tickFormatter={(v) => formatSeconds(v)}
          domain={["auto", "auto"]}
        />
        <Tooltip content={<CustomTooltip />} />
        {visibleAthletes.map((a, i) => (
          <Line
            key={a.athleteResult.athlete.id}
            type="monotone"
            dataKey={a.athleteResult.athlete.id}
            stroke={a.color}
            strokeWidth={2}
            dot={{ r: 5, fill: a.color }}
            activeDot={{ r: 7, stroke: "#fff", strokeWidth: 2 }}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
```

**Step 4: Test in App.tsx with mock data**

Temporarily render SplitChart in App.tsx with mock data to verify it works:
```tsx
import SplitChart from "./components/SplitChart";
import { MOCK_ATHLETE_RESULTS } from "./lib/mock-data";
import { ATHLETE_COLORS } from "./lib/constants";

export default function App() {
  const athletes = MOCK_ATHLETE_RESULTS.map((ar, i) => ({
    athleteResult: ar,
    color: ATHLETE_COLORS[i],
    visible: true,
  }));

  return (
    <div className="min-h-screen bg-zinc-950 text-white p-8">
      <h1 className="text-3xl font-bold mb-6">PACE</h1>
      <div className="bg-zinc-900 rounded-lg p-4">
        <SplitChart athletes={athletes} />
      </div>
    </div>
  );
}
```

**Step 5: Verify chart renders**

```bash
cd apps/web && npm run dev
```
Expected: Line chart with 2 athletes' split-to-split times, colored blue and red, with hover tooltips.

**Step 6: Commit**

```bash
git add apps/web/src/components/SplitChart.tsx apps/web/src/lib/constants.ts apps/web/src/lib/mock-data.ts
git commit -m "feat: add SplitChart component with mock data"
```

---

## Phase 2: Window System & Search

### Task 5: Window state management (Zustand store)

**Files:**
- Create: `apps/web/src/stores/window-store.ts`

**Step 1: Install Zustand (if not already)**

```bash
cd apps/web && npm install zustand
```

**Step 2: Write the window store**

`apps/web/src/stores/window-store.ts`:
```ts
import { create } from "zustand";
import type { AthleteResult, WindowAthleteData } from "../types/pace";
import { ATHLETE_COLORS, MAX_ATHLETES_PER_WINDOW, MAX_WINDOWS } from "../lib/constants";

export interface PaceWindow {
  id: string;
  distance: string | null;
  athletes: WindowAthleteData[];
}

interface WindowStore {
  windows: PaceWindow[];
  addWindow: () => string | null;
  removeWindow: (windowId: string) => void;
  setDistance: (windowId: string, distance: string) => void;
  addAthlete: (windowId: string, athleteResult: AthleteResult) => boolean;
  removeAthlete: (windowId: string, athleteId: string) => void;
  toggleAthleteVisibility: (windowId: string, athleteId: string) => void;
}

let nextId = 0;
function genId() {
  return `win_${++nextId}`;
}

export const useWindowStore = create<WindowStore>((set, get) => ({
  windows: [],

  addWindow: () => {
    const { windows } = get();
    if (windows.length >= MAX_WINDOWS) return null;
    const id = genId();
    set({ windows: [...windows, { id, distance: null, athletes: [] }] });
    return id;
  },

  removeWindow: (windowId) => {
    set({ windows: get().windows.filter((w) => w.id !== windowId) });
  },

  setDistance: (windowId, distance) => {
    set({
      windows: get().windows.map((w) =>
        w.id === windowId ? { ...w, distance, athletes: [] } : w
      ),
    });
  },

  addAthlete: (windowId, athleteResult) => {
    const { windows } = get();
    const win = windows.find((w) => w.id === windowId);
    if (!win) return false;
    if (win.athletes.length >= MAX_ATHLETES_PER_WINDOW) return false;

    const already = win.athletes.some(
      (a) =>
        a.athleteResult.athlete.id === athleteResult.athlete.id &&
        a.athleteResult.result.id === athleteResult.result.id
    );
    if (already) return false;

    const colorIndex = win.athletes.length;
    const newAthlete: WindowAthleteData = {
      athleteResult,
      color: ATHLETE_COLORS[colorIndex],
      visible: true,
    };

    set({
      windows: windows.map((w) =>
        w.id === windowId
          ? { ...w, athletes: [...w.athletes, newAthlete] }
          : w
      ),
    });
    return true;
  },

  removeAthlete: (windowId, athleteId) => {
    set({
      windows: get().windows.map((w) => {
        if (w.id !== windowId) return w;
        const filtered = w.athletes.filter(
          (a) => a.athleteResult.athlete.id !== athleteId
        );
        // Reassign colors to maintain positional order
        return {
          ...w,
          athletes: filtered.map((a, i) => ({ ...a, color: ATHLETE_COLORS[i] })),
        };
      }),
    });
  },

  toggleAthleteVisibility: (windowId, athleteId) => {
    set({
      windows: get().windows.map((w) => {
        if (w.id !== windowId) return w;
        return {
          ...w,
          athletes: w.athletes.map((a) =>
            a.athleteResult.athlete.id === athleteId
              ? { ...a, visible: !a.visible }
              : a
          ),
        };
      }),
    });
  },
}));
```

**Step 3: Commit**

```bash
git add apps/web/src/stores/window-store.ts
git commit -m "feat: add Zustand window state management"
```

---

### Task 6: Legend component

**Files:**
- Create: `apps/web/src/components/Legend.tsx`

**Step 1: Build Legend with hover tooltips**

`apps/web/src/components/Legend.tsx`:
```tsx
import { useState } from "react";
import type { WindowAthleteData } from "../types/pace";

interface LegendProps {
  athletes: WindowAthleteData[];
  onToggle: (athleteId: string) => void;
}

export default function Legend({ athletes, onToggle }: LegendProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1">
      {athletes.map((a) => {
        const { athlete, team } = a.athleteResult;
        const event = a.athleteResult.event;
        const isHovered = hoveredId === athlete.id;

        return (
          <div key={athlete.id} className="relative">
            <button
              onClick={() => onToggle(athlete.id)}
              onMouseEnter={() => setHoveredId(athlete.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`flex items-center gap-1.5 text-sm transition-opacity ${
                a.visible ? "opacity-100" : "opacity-40"
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: a.color }}
              />
              <span className="text-zinc-200">{athlete.name}</span>
              <span className="text-zinc-500">
                {a.athleteResult.result.time_str}
              </span>
            </button>

            {isHovered && (
              <div className="absolute bottom-full left-0 mb-1 z-50 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 shadow-lg whitespace-nowrap text-xs">
                <p className="text-white font-medium">{athlete.name}</p>
                {team && <p className="text-zinc-400">{team.name}</p>}
                <p className="text-zinc-400">{event.name}</p>
                {event.date && (
                  <p className="text-zinc-500">{event.date}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/Legend.tsx
git commit -m "feat: add Legend component with hover tooltips"
```

---

### Task 7: DistanceSelector component

**Files:**
- Create: `apps/web/src/components/DistanceSelector.tsx`

**Step 1: Build distance selector**

`apps/web/src/components/DistanceSelector.tsx`:
```tsx
import { useEffect, useState } from "react";
import { getDistances } from "../lib/db";

interface DistanceSelectorProps {
  value: string | null;
  onChange: (distance: string) => void;
}

export default function DistanceSelector({ value, onChange }: DistanceSelectorProps) {
  const [distances, setDistances] = useState<string[]>([]);

  useEffect(() => {
    getDistances().then(setDistances).catch(console.error);
  }, []);

  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-md px-3 py-1.5 focus:ring-1 focus:ring-blue-500 focus:outline-none"
    >
      <option value="" disabled>
        Select distance...
      </option>
      {distances.map((d) => (
        <option key={d} value={d}>
          {d}
        </option>
      ))}
    </select>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/DistanceSelector.tsx
git commit -m "feat: add DistanceSelector component"
```

---

### Task 8: AthleteSearch panel

**Files:**
- Create: `apps/web/src/components/AthleteSearch.tsx`

**Step 1: Build the collapsible search panel with cascading filters**

`apps/web/src/components/AthleteSearch.tsx`:
```tsx
import { useState, useEffect, useCallback } from "react";
import { getEvents, searchAthletes, getTeamsForEvent } from "../lib/db";
import type { Event, AthleteResult } from "../types/pace";

interface AthleteSearchProps {
  distance: string;
  selectedCount: number;
  maxAthletes: number;
  onAdd: (athleteResult: AthleteResult) => void;
}

export default function AthleteSearch({
  distance,
  selectedCount,
  maxAthletes,
  onAdd,
}: AthleteSearchProps) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [nameQuery, setNameQuery] = useState("");
  const [results, setResults] = useState<AthleteResult[]>([]);
  const [loading, setLoading] = useState(false);

  // Load events for this distance
  useEffect(() => {
    getEvents({ distance }).then(setEvents).catch(console.error);
  }, [distance]);

  // Load teams when event is selected
  useEffect(() => {
    if (!selectedEventId) {
      setTeams([]);
      return;
    }
    getTeamsForEvent(selectedEventId).then(setTeams).catch(console.error);
  }, [selectedEventId]);

  // Search athletes when filters change
  const doSearch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await searchAthletes(nameQuery, {
        eventId: selectedEventId || undefined,
        distance,
      });
      let filtered = data;
      if (selectedTeam) {
        filtered = data.filter((r) => r.team?.name === selectedTeam);
      }
      setResults(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [nameQuery, selectedEventId, selectedTeam, distance]);

  useEffect(() => {
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [doSearch]);

  const atCapacity = selectedCount >= maxAthletes;

  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <span>
          {open ? "▾" : "▸"} Add/Remove Athletes ({selectedCount}/{maxAthletes})
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {/* Competition filter */}
          <select
            value={selectedEventId}
            onChange={(e) => {
              setSelectedEventId(e.target.value);
              setSelectedTeam("");
            }}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5"
          >
            <option value="">All competitions</option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} {e.date ? `(${e.date})` : ""}
              </option>
            ))}
          </select>

          {/* Team filter */}
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5"
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Name search */}
          <input
            type="text"
            placeholder="Search by name..."
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5 placeholder-zinc-500"
          />

          {/* Results */}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {loading && (
              <p className="text-xs text-zinc-500 py-2">Searching...</p>
            )}
            {!loading && results.length === 0 && (
              <p className="text-xs text-zinc-500 py-2">No results</p>
            )}
            {!loading &&
              results.map((ar) => (
                <div
                  key={`${ar.athlete.id}-${ar.result.id}`}
                  className="flex items-center justify-between bg-zinc-800/50 rounded px-2 py-1.5"
                >
                  <div>
                    <p className="text-xs text-zinc-200 font-medium">
                      {ar.athlete.name}
                      {ar.team && (
                        <span className="text-zinc-500"> · {ar.team.name}</span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {ar.result.time_str} · {ar.event.name}
                      {ar.event.date ? ` · ${ar.event.date}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => onAdd(ar)}
                    disabled={atCapacity}
                    className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add apps/web/src/components/AthleteSearch.tsx
git commit -m "feat: add AthleteSearch panel with cascading filters"
```

---

### Task 9: PaceWindow and WindowGrid

**Files:**
- Create: `apps/web/src/components/PaceWindow.tsx`
- Create: `apps/web/src/components/WindowGrid.tsx`

**Step 1: Build PaceWindow (self-contained window)**

`apps/web/src/components/PaceWindow.tsx`:
```tsx
import { useWindowStore } from "../stores/window-store";
import DistanceSelector from "./DistanceSelector";
import AthleteSearch from "./AthleteSearch";
import SplitChart from "./SplitChart";
import Legend from "./Legend";
import { MAX_ATHLETES_PER_WINDOW } from "../lib/constants";

interface PaceWindowProps {
  windowId: string;
}

export default function PaceWindow({ windowId }: PaceWindowProps) {
  const window = useWindowStore((s) => s.windows.find((w) => w.id === windowId));
  const setDistance = useWindowStore((s) => s.setDistance);
  const addAthlete = useWindowStore((s) => s.addAthlete);
  const removeAthlete = useWindowStore((s) => s.removeAthlete);
  const removeWindow = useWindowStore((s) => s.removeWindow);
  const toggleVisibility = useWindowStore((s) => s.toggleAthleteVisibility);

  if (!window) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/80">
        <DistanceSelector
          value={window.distance}
          onChange={(d) => setDistance(windowId, d)}
        />
        <button
          onClick={() => removeWindow(windowId)}
          className="text-zinc-500 hover:text-red-400 text-lg leading-none px-1"
          title="Close window"
        >
          ×
        </button>
      </div>

      {/* Search panel (only when distance is set) */}
      {window.distance && (
        <AthleteSearch
          distance={window.distance}
          selectedCount={window.athletes.length}
          maxAthletes={MAX_ATHLETES_PER_WINDOW}
          onAdd={(ar) => addAthlete(windowId, ar)}
        />
      )}

      {/* Selected athletes removal list */}
      {window.athletes.length > 0 && (
        <div className="px-3 py-1 flex flex-wrap gap-1 border-b border-zinc-800">
          {window.athletes.map((a) => (
            <span
              key={a.athleteResult.athlete.id}
              className="inline-flex items-center gap-1 bg-zinc-800 text-xs text-zinc-300 rounded px-2 py-0.5"
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: a.color }}
              />
              {a.athleteResult.athlete.name}
              <button
                onClick={() => removeAthlete(windowId, a.athleteResult.athlete.id)}
                className="text-zinc-500 hover:text-red-400 ml-0.5"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 p-2 min-h-[200px]">
        {!window.distance ? (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            Select a distance to get started
          </div>
        ) : (
          <SplitChart athletes={window.athletes} />
        )}
      </div>

      {/* Legend */}
      {window.athletes.length > 0 && (
        <Legend
          athletes={window.athletes}
          onToggle={(id) => toggleVisibility(windowId, id)}
        />
      )}
    </div>
  );
}
```

**Step 2: Build WindowGrid**

`apps/web/src/components/WindowGrid.tsx`:
```tsx
import { useWindowStore } from "../stores/window-store";
import PaceWindow from "./PaceWindow";

function gridClass(count: number): string {
  if (count <= 1) return "grid-cols-1";
  if (count <= 2) return "grid-cols-2";
  if (count <= 4) return "grid-cols-2";
  return "grid-cols-3";
}

export default function WindowGrid() {
  const windows = useWindowStore((s) => s.windows);

  if (windows.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-zinc-500">
        Click "+ New Window" to start comparing athletes
      </div>
    );
  }

  return (
    <div className={`grid ${gridClass(windows.length)} gap-4 p-4`}>
      {windows.map((w) => (
        <PaceWindow key={w.id} windowId={w.id} />
      ))}
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add apps/web/src/components/PaceWindow.tsx apps/web/src/components/WindowGrid.tsx
git commit -m "feat: add PaceWindow and WindowGrid components"
```

---

### Task 10: Header and App assembly

**Files:**
- Create: `apps/web/src/components/Header.tsx`
- Modify: `apps/web/src/App.tsx`

**Step 1: Build Header**

`apps/web/src/components/Header.tsx`:
```tsx
import { useWindowStore } from "../stores/window-store";
import { MAX_WINDOWS } from "../lib/constants";

export default function Header() {
  const windowCount = useWindowStore((s) => s.windows.length);
  const addWindow = useWindowStore((s) => s.addWindow);
  const atCapacity = windowCount >= MAX_WINDOWS;

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950">
      <h1 className="text-xl font-bold tracking-tight text-white">PACE</h1>
      <button
        onClick={() => addWindow()}
        disabled={atCapacity}
        className="text-sm px-4 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        + New Window {windowCount > 0 && `(${windowCount}/${MAX_WINDOWS})`}
      </button>
    </header>
  );
}
```

**Step 2: Wire up App.tsx**

`apps/web/src/App.tsx`:
```tsx
import Header from "./components/Header";
import WindowGrid from "./components/WindowGrid";

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <Header />
      <WindowGrid />
    </div>
  );
}
```

**Step 3: Verify full UI renders**

```bash
cd apps/web && npm run dev
```
Expected: Dark page with PACE header, "+ New Window" button. Clicking it adds a window with distance selector. Selecting a distance shows the search panel (queries will fail until Supabase has data — that's expected).

**Step 4: Commit**

```bash
git add apps/web/src/components/Header.tsx apps/web/src/App.tsx
git commit -m "feat: wire up Header, WindowGrid, and App"
```

---

## Phase 3: Python Pipeline

### Task 11: Validation script (pace_validate.py)

**Files:**
- Create: `py/pace_validate.py`

**Step 1: Write validation with clear error reporting**

`py/pace_validate.py`:
```python
#!/usr/bin/env python3
"""
pace_validate.py
Validate pace.v1 JSON before uploading to Supabase.
Blocks upload on any critical error. Outputs clear report.
"""

import json
import pathlib
import sys
from typing import Any, Dict, List, Tuple

# Plausible time bounds per distance (seconds): (min, max)
DISTANCE_BOUNDS: Dict[str, Tuple[float, float]] = {
    "800m":  (100, 300),
    "1500m": (210, 480),
    "mile":  (225, 510),
    "1600m": (225, 510),
    "3000m": (450, 960),
    "3000mSC": (480, 1020),
    "5K":    (780, 1800),
    "5000m": (780, 1800),
    "6K":    (960, 2100),
    "8K":    (1260, 2700),
    "10K":   (1620, 3600),
    "10000m":(1620, 3600),
}

# World-record-ish minimum lap pace per km (seconds)
MIN_LAP_PACE_PER_KM = 145  # ~2:25/km, faster than any human

class ValidationError:
    def __init__(self, athlete: str, team: str, message: str, severity: str = "BLOCK"):
        self.athlete = athlete
        self.team = team
        self.message = message
        self.severity = severity

    def __str__(self):
        return f"  [{self.severity}] {self.athlete} ({self.team}): {self.message}"


def validate_pace_v1(data: Dict[str, Any]) -> List[ValidationError]:
    errors: List[ValidationError] = []

    # Schema check
    if data.get("schema") != "pace.v1":
        errors.append(ValidationError("", "", f"Invalid schema: {data.get('schema')}", "BLOCK"))
        return errors

    event = data.get("event", {})
    athletes = data.get("athletes", [])

    if not athletes:
        errors.append(ValidationError("", "", "No athletes in data", "BLOCK"))
        return errors

    distance = event.get("distance") or event.get("name") or ""

    # Infer distance bounds
    bounds = None
    for key, b in DISTANCE_BOUNDS.items():
        if key.lower() in distance.lower():
            bounds = b
            break

    # Count splits per athlete for completeness check
    split_counts = [len(a.get("splits", [])) for a in athletes if a.get("splits")]
    median_splits = sorted(split_counts)[len(split_counts) // 2] if split_counts else 0

    seen_keys: set = set()

    for a in athletes:
        name = a.get("name", "").strip()
        team = a.get("team", "").strip()
        time_s = a.get("time_s")
        splits = a.get("splits", [])

        # Name quality
        if not name:
            errors.append(ValidationError(name or "???", team, "Empty athlete name", "BLOCK"))
            continue

        if name.isdigit():
            errors.append(ValidationError(name, team, f"Name is just a number: '{name}'", "BLOCK"))

        # Duplicate check
        key = (name.lower(), team.lower())
        if key in seen_keys:
            errors.append(ValidationError(name, team, "Duplicate athlete in event", "BLOCK"))
        seen_keys.add(key)

        # Time bounds
        if time_s is not None and bounds:
            if time_s < bounds[0]:
                errors.append(ValidationError(name, team, f"Finish time {time_s:.1f}s below minimum {bounds[0]:.0f}s for {distance}", "BLOCK"))
            if time_s > bounds[1]:
                errors.append(ValidationError(name, team, f"Finish time {time_s:.1f}s above maximum {bounds[1]:.0f}s for {distance}", "BLOCK"))

        # Split validation
        prev_elapsed = 0.0
        for i, sp in enumerate(splits):
            elapsed = sp.get("elapsed_s")
            lap = sp.get("lap_s")
            label = sp.get("label", f"S{i+1}")

            if elapsed is not None:
                # Monotonic check
                if elapsed <= prev_elapsed and prev_elapsed > 0:
                    errors.append(ValidationError(
                        name, team,
                        f"Non-monotonic elapsed at {label}: {elapsed:.1f}s <= {prev_elapsed:.1f}s",
                        "BLOCK"
                    ))
                prev_elapsed = elapsed

            if lap is not None:
                # Negative lap
                if lap < 0:
                    errors.append(ValidationError(name, team, f"Negative lap at {label}: {lap:.1f}s", "BLOCK"))

                # Impossibly fast lap
                if lap < MIN_LAP_PACE_PER_KM * 0.15:  # sub-22s per ~200m
                    errors.append(ValidationError(
                        name, team,
                        f"Impossibly fast lap at {label}: {lap:.1f}s",
                        "BLOCK"
                    ))

        # Split completeness
        if median_splits > 0 and len(splits) < median_splits * 0.5:
            errors.append(ValidationError(
                name, team,
                f"Missing splits: {len(splits)} of {median_splits} expected",
                "WARN"
            ))

    return errors


def validate_file(path: pathlib.Path) -> Tuple[bool, str]:
    """Validate a pace.v1 JSON file. Returns (passed, report)."""
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        return False, f"Failed to read/parse {path}: {e}"

    errors = validate_pace_v1(data)
    event = data.get("event", {})
    athletes = data.get("athletes", [])

    blocks = [e for e in errors if e.severity == "BLOCK"]
    warns = [e for e in errors if e.severity == "WARN"]

    lines = []
    if blocks:
        lines.append(f"\n❌ VALIDATION FAILED — {path.name} NOT uploaded\n")
        for e in blocks:
            lines.append(str(e))
        if warns:
            lines.append(f"\n  Warnings ({len(warns)}):")
            for e in warns:
                lines.append(str(e))
        lines.append(f"\n  Provider: {event.get('provider', 'unknown')}")
        lines.append(f"  Source file: {path}")
        return False, "\n".join(lines)

    if warns:
        lines.append(f"\n⚠️  VALIDATION PASSED WITH WARNINGS — {path.name}\n")
        for e in warns:
            lines.append(str(e))
    else:
        lines.append(f"\n✅ {path.name} validated")

    athlete_count = len(athletes)
    split_counts = [len(a.get("splits", [])) for a in athletes]
    avg_splits = sum(split_counts) / len(split_counts) if split_counts else 0
    lines.append(f"   {athlete_count} athletes, ~{avg_splits:.0f} splits each, {len(warns)} warnings")

    return True, "\n".join(lines)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python pace_validate.py <path_to_pace_normalized.json> [...]")
        sys.exit(1)

    all_passed = True
    for fpath in sys.argv[1:]:
        passed, report = validate_file(pathlib.Path(fpath))
        print(report)
        if not passed:
            all_passed = False

    sys.exit(0 if all_passed else 1)
```

**Step 2: Test with existing normalized data**

```bash
cd py
python pace_normalize.py --root ../data --force
python pace_validate.py ../data/2149044/pace_normalized.json
```
Expected: Either passes or shows specific validation errors.

**Step 3: Commit**

```bash
git add py/pace_validate.py
git commit -m "feat: add pace_validate.py with split sanity checks"
```

---

### Task 12: Supabase upload script (pace_upload.py)

**Files:**
- Create: `py/pace_upload.py`

**Step 1: Write the uploader**

`py/pace_upload.py`:
```python
#!/usr/bin/env python3
"""
pace_upload.py
Upload validated pace.v1 JSON into Supabase.
Handles athlete deduplication and upserts.
"""

import json
import os
import pathlib
import sys
from typing import Any, Dict

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("VITE_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")  # Use service key for writes

if not SUPABASE_URL or not SUPABASE_KEY:
    print("[err] Set SUPABASE_URL and SUPABASE_SERVICE_KEY in .env")
    sys.exit(1)

sb = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_or_create_team(name: str) -> str:
    """Return team UUID, creating if needed."""
    result = sb.table("teams").select("id").eq("name", name).maybe_single().execute()
    if result.data:
        return result.data["id"]
    insert = sb.table("teams").insert({"name": name}).execute()
    return insert.data[0]["id"]


def get_or_create_athlete(name: str, team_id: str) -> str:
    """Return athlete UUID, deduplicating on (name, team_id)."""
    result = (
        sb.table("athletes")
        .select("id")
        .eq("name", name)
        .eq("team_id", team_id)
        .maybe_single()
        .execute()
    )
    if result.data:
        return result.data["id"]
    insert = sb.table("athletes").insert({"name": name, "team_id": team_id}).execute()
    return insert.data[0]["id"]


def upload_event(data: Dict[str, Any], event_meta: Dict[str, str] | None = None) -> None:
    """Upload a pace.v1 JSON object to Supabase."""
    ev = data["event"]
    athletes = data["athletes"]

    source_id = ev["id"]
    meta = event_meta or {}

    # Upsert event
    event_row = {
        "source_id": source_id,
        "name": meta.get("name") or ev.get("name") or source_id,
        "date": meta.get("date"),
        "location": meta.get("location"),
        "gender": meta.get("gender", "Men"),
        "distance": meta.get("distance", ""),
        "season": meta.get("season"),
        "provider": ev.get("provider"),
    }

    result = (
        sb.table("events")
        .upsert(event_row, on_conflict="source_id")
        .execute()
    )
    event_id = result.data[0]["id"]
    print(f"[upload] event {source_id} -> {event_id}")

    for a in athletes:
        name = a.get("name", "").strip()
        team_name = a.get("team", "").strip()
        if not name:
            continue

        team_id = get_or_create_team(team_name) if team_name else None
        athlete_id = get_or_create_athlete(name, team_id)

        # Upsert result
        result_row = {
            "event_id": event_id,
            "athlete_id": athlete_id,
            "place": a.get("place"),
            "time_s": a.get("time_s"),
            "time_str": a.get("time_str"),
        }
        res = (
            sb.table("results")
            .upsert(result_row, on_conflict="event_id,athlete_id")
            .execute()
        )
        result_id = res.data[0]["id"]

        # Delete existing splits for this result (full replace)
        sb.table("splits").delete().eq("result_id", result_id).execute()

        # Insert splits
        splits_rows = []
        for i, sp in enumerate(a.get("splits", [])):
            splits_rows.append({
                "result_id": result_id,
                "label": sp.get("label", f"S{i+1}"),
                "ordinal": i,
                "elapsed_s": sp.get("elapsed_s"),
                "lap_s": sp.get("lap_s"),
                "place": sp.get("place"),
            })

        if splits_rows:
            sb.table("splits").insert(splits_rows).execute()

    print(f"[upload] {len(athletes)} athletes uploaded for event {source_id}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python pace_upload.py <pace_normalized.json> [--meta event_meta.json]")
        sys.exit(1)

    path = pathlib.Path(sys.argv[1])
    data = json.loads(path.read_text(encoding="utf-8"))

    meta = None
    if "--meta" in sys.argv:
        idx = sys.argv.index("--meta")
        if idx + 1 < len(sys.argv):
            meta = json.loads(pathlib.Path(sys.argv[idx + 1]).read_text(encoding="utf-8"))

    upload_event(data, meta)
```

**Step 2: Commit**

```bash
git add py/pace_upload.py
git commit -m "feat: add pace_upload.py for Supabase ingestion"
```

---

### Task 13: Ingestion orchestrator (pace_ingest.py)

**Files:**
- Create: `py/pace_ingest.py`

**Step 1: Write the orchestrator**

`py/pace_ingest.py`:
```python
#!/usr/bin/env python3
"""
pace_ingest.py
Orchestrator: URL(s) -> scrape -> normalize -> validate -> upload

Usage:
  python pace_ingest.py "https://live.xpresstiming.com/..."
  python pace_ingest.py "url1" "url2" "url3"
  python pace_ingest.py --from race_input.txt
  python pace_ingest.py --from race_input.txt --force-upload
"""

import argparse
import pathlib
import subprocess
import sys

def parse_urls_from_file(path: pathlib.Path) -> list[str]:
    """Extract URLs from a race_input.txt-style file."""
    urls = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line.startswith("http://") or line.startswith("https://"):
            urls.append(line)
    return urls


def run_step(label: str, cmd: list[str]) -> bool:
    """Run a subprocess, print output, return success."""
    print(f"\n{'='*60}")
    print(f"  {label}")
    print(f"{'='*60}\n")
    result = subprocess.run(cmd, capture_output=False)
    return result.returncode == 0


def ingest_url(url: str, data_root: pathlib.Path, force_upload: bool, headful: bool) -> bool:
    """Full pipeline for one URL."""
    py_dir = pathlib.Path(__file__).parent

    # Step 1: Scrape
    scrape_cmd = [
        sys.executable, str(py_dir / "pace_scraper.py"),
        "--url", url,
        "--outdir", str(data_root),
    ]
    if headful:
        scrape_cmd.append("--headful")

    if not run_step(f"SCRAPE: {url}", scrape_cmd):
        print(f"[FAIL] Scraping failed for {url}")
        return False

    # Step 2: Normalize
    norm_cmd = [
        sys.executable, str(py_dir / "pace_normalize.py"),
        "--root", str(data_root),
        "--force",
    ]
    if not run_step("NORMALIZE", norm_cmd):
        print(f"[FAIL] Normalization failed")
        return False

    # Step 3: Find normalized files and validate
    normalized_files = list(data_root.rglob("pace_normalized.json"))
    if not normalized_files:
        print("[FAIL] No pace_normalized.json files found after normalization")
        return False

    all_valid = True
    for nf in normalized_files:
        validate_cmd = [sys.executable, str(py_dir / "pace_validate.py"), str(nf)]
        if not run_step(f"VALIDATE: {nf.parent.name}", validate_cmd):
            all_valid = False
            print(f"[FAIL] Validation failed for {nf}")

    if not all_valid and not force_upload:
        print("\n❌ Validation failed. Fix issues above or use --force-upload to bypass.")
        return False

    if not all_valid and force_upload:
        print("\n⚠️  Validation failed but --force-upload is set. Proceeding...")

    # Step 4: Upload
    for nf in normalized_files:
        upload_cmd = [sys.executable, str(py_dir / "pace_upload.py"), str(nf)]
        if not run_step(f"UPLOAD: {nf.parent.name}", upload_cmd):
            print(f"[FAIL] Upload failed for {nf}")
            return False

    print(f"\n✅ Pipeline complete for {url}")
    return True


def main():
    ap = argparse.ArgumentParser("PACE ingestion pipeline")
    ap.add_argument("urls", nargs="*", help="One or more race URLs")
    ap.add_argument("--from", dest="from_file", help="File with race URLs (one per line)")
    ap.add_argument("--data-root", default="data", help="Root data directory")
    ap.add_argument("--force-upload", action="store_true", help="Upload even if validation fails")
    ap.add_argument("--headful", action="store_true", help="Visible browser for debugging")
    args = ap.parse_args()

    urls = list(args.urls)
    if args.from_file:
        urls.extend(parse_urls_from_file(pathlib.Path(args.from_file)))

    if not urls:
        print("No URLs provided. Use positional args or --from <file>")
        sys.exit(1)

    data_root = pathlib.Path(args.data_root)
    data_root.mkdir(parents=True, exist_ok=True)

    results = []
    for url in urls:
        ok = ingest_url(url, data_root, args.force_upload, args.headful)
        results.append((url, ok))

    print(f"\n{'='*60}")
    print("  SUMMARY")
    print(f"{'='*60}")
    for url, ok in results:
        status = "✅" if ok else "❌"
        print(f"  {status} {url}")

    failures = sum(1 for _, ok in results if not ok)
    sys.exit(1 if failures > 0 else 0)


if __name__ == "__main__":
    main()
```

**Step 2: Test with an existing URL**

```bash
cd py
python pace_ingest.py "https://live.xpresstiming.com/meets/57259/events/xc/2149044" --headful
```

**Step 3: Commit**

```bash
git add py/pace_ingest.py
git commit -m "feat: add pace_ingest.py orchestrator pipeline"
```

---

## Phase 4: Integration

### Task 14: End-to-end wiring and smoke test

**Step 1: Ingest sample data into Supabase**

```bash
cd py
python pace_ingest.py --from ../race_input.txt --headful
```

**Step 2: Verify frontend loads data**

```bash
cd apps/web && npm run dev
```

Open browser, click "+ New Window", select a distance, verify events appear in competition dropdown, search for athletes, add to graph, verify chart renders with split-to-split data.

**Step 3: Fix any query issues**

The Supabase nested select syntax may need adjustment based on actual schema. Debug in browser console and fix `db.ts` as needed.

**Step 4: Commit**

```bash
git add -A
git commit -m "feat: end-to-end integration verified"
```

---

## Agent Spec Document Mapping

For parallel agent work, tasks map to spec docs as follows:

| Spec Doc | Tasks | Can Start |
|----------|-------|-----------|
| `DATABASE-SPEC.md` | Tasks 2, 3 | Immediately |
| `CHART-SPEC.md` | Tasks 4, 6 | Immediately |
| `FRONTEND-SPEC.md` | Tasks 5, 7, 8, 9, 10 | After Tasks 2-3 |
| `BACKEND-SPEC.md` | Tasks 11, 12, 13 | After Task 2 |

Task 1 (scaffolding) and Task 14 (integration) are done by the user/coordinator.

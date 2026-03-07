# Frontend Fixes 1, 2, 3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three issues in the PACE frontend: (1) add season filter to event dropdown, (2) fix cross-provider split chart alignment via ordinal fallback, (3) handle athletes with no splits via flat dotted reference line.

**Architecture:** All changes are in `apps/web/src/components/`. Fix 1 touches only `AthleteSearch.tsx`. Fix 2 rewrites chart data-building logic in `SplitChart.tsx` with a label-mode detector and ordinal fallback. Fix 3 adds flat-line rendering in `SplitChart.tsx` and a "(no splits)" badge in `Legend.tsx`. No DB schema or store changes needed.

**Tech Stack:** React 18, TypeScript, Recharts, Tailwind CSS, Zustand (store, not modified here), Supabase (already returns `season` and `ordinal` fields)

---

## Background

The `Event` type already has `season: "indoor" | "outdoor" | "xc" | null` and `db.ts:getEvents` already accepts a `season` filter — the filter button is the only missing piece for Fix 1.

`Split` already has `ordinal: number` and splits are sorted by ordinal in `db.ts` — the ordinal alignment logic for Fix 2 can rely on array index (`splits[i]`) since they're pre-sorted.

No test infrastructure exists in this project. Each task ends with a commit and a manual smoke-test checklist.

---

## Task 1: Fix 1 — Season Filter in AthleteSearch

**Files:**
- Modify: `apps/web/src/components/AthleteSearch.tsx`

**What to do:**
Add a `seasonFilter` state (`"" | "indoor" | "outdoor" | "xc"`) and render filter buttons beside the existing gender buttons. Wire it into the `getEvents()` call and reset `selectedEventId`/`yearFilter`/`eventSearch` when it changes.

**Step 1: Add `seasonFilter` state and update the `useEffect` that loads events**

In `AthleteSearch.tsx`, after line 26 (`const [eventSearch, setEventSearch] = useState("")`), add:

```tsx
const [seasonFilter, setSeasonFilter] = useState<"" | "indoor" | "outdoor" | "xc">("");
```

Replace the existing `useEffect` that calls `getEvents` (lines 31–38):

```tsx
useEffect(() => {
  getEvents({
    distance,
    gender: genderFilter || undefined,
    season: seasonFilter || undefined,
  })
    .then(setEvents)
    .catch(console.error);
  setSelectedEventId("");
  setYearFilter("");
  setEventSearch("");
}, [distance, genderFilter, seasonFilter]);
```

**Step 2: Add the season filter buttons to the filter row (after gender buttons)**

Replace the existing filter row div (lines 102–137) with:

```tsx
{/* Gender + Season + Year filter row */}
<div className="flex flex-wrap items-center gap-2">
  <div className="flex rounded overflow-hidden border border-zinc-700 text-xs">
    {(["", "Men", "Women"] as const).map((g) => (
      <button
        key={g}
        className={`px-2 py-1 transition-colors ${
          genderFilter === g
            ? "bg-zinc-700 text-white"
            : "text-zinc-400 hover:text-white"
        }`}
        onClick={() => setGenderFilter(g)}
      >
        {g === "" ? "All" : g === "Men" ? "M" : "W"}
      </button>
    ))}
  </div>
  <div className="flex rounded overflow-hidden border border-zinc-700 text-xs">
    {(["", "indoor", "outdoor", "xc"] as const).map((s) => (
      <button
        key={s}
        className={`px-2 py-1 transition-colors ${
          seasonFilter === s
            ? "bg-zinc-700 text-white"
            : "text-zinc-400 hover:text-white"
        }`}
        onClick={() => setSeasonFilter(s)}
      >
        {s === "" ? "All" : s === "indoor" ? "IN" : s === "outdoor" ? "OUT" : "XC"}
      </button>
    ))}
  </div>
  {availableYears.length > 1 && (
    <div className="flex rounded overflow-hidden border border-zinc-700 text-xs">
      <button
        className={`px-2 py-1 transition-colors ${yearFilter === "" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}
        onClick={() => setYearFilter("")}
      >
        All
      </button>
      {availableYears.map((y) => (
        <button
          key={y}
          className={`px-2 py-1 transition-colors ${yearFilter === y ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}
          onClick={() => setYearFilter(y)}
        >
          {y}
        </button>
      ))}
    </div>
  )}
</div>
```

**Step 3: Verify the event option label already shows useful context**

The current option render at line 158 already shows name + gender + date:
```tsx
{e.name}{e.gender && !genderFilter ? ` (${e.gender === "Women" ? "W" : "M"})` : ""}{e.date ? ` · ${e.date}` : ""}
```
This is sufficient — event names from the DB include conference prefix (e.g. "2026 NSIC Indoor Championships Men 3000m"). No changes needed here.

**Step 4: Smoke test**
- Open the app, add a PaceWindow, select "5000m"
- Verify filter buttons appear: All / M / W (gender) and All / IN / OUT / XC (season)
- Click "IN" → event dropdown narrows to indoor events only
- Click "XC" → dropdown narrows to XC events
- Click "All" season → returns all events

**Step 5: Commit**
```bash
git add apps/web/src/components/AthleteSearch.tsx
git commit -m "feat: add season filter (indoor/outdoor/xc) to event dropdown"
```

---

## Task 2: Fix 2 — Ordinal Alignment Fallback in SplitChart

**Files:**
- Modify: `apps/web/src/components/SplitChart.tsx`

This is the most complex change. The fix has two parts:
- A. Detect whether athletes share consistent labels; if not, fall back to ordinal (positional) alignment
- B. Remove `connectNulls` (gaps are real missing data, not holes to fill)

### Background on the bug

`buildChartData` (lines 30–51) collects x-axis labels from whichever athlete has the **most splits**, then does `splits.find(s => s.label === label)`. When Brody's labels are `"200m", "400m"...` and Ramon's are `"1", "2"...`, Ramon's find() returns undefined for every label — his line never renders.

### Strategy

1. **`detectLabelMode(athletes)`** → `"label" | "ordinal"`: checks if ≥50% of athletes-with-splits share at least one label with another athlete. If yes → label mode (current behavior). If no → ordinal mode.
2. **`buildChartDataOrdinal(athletes)`**: uses array index `i` (splits are pre-sorted by ordinal from db.ts) as position. Sets `label: "Lap ${i+1}"`. Every athlete maps `splits[i].lap_s` to their ID key.
3. **Update lookup builders** to accept `mode` param and key by "Lap N" in ordinal mode.
4. **UI**: in ordinal mode, add a small italic note below chart.
5. **Remove `connectNulls`** from all `<Line>` components.

**Step 1: Add `detectLabelMode` helper after `buildChartData` (line 51)**

```typescript
type LabelMode = "label" | "ordinal";

function detectLabelMode(athletes: WindowAthleteData[]): LabelMode {
  const withSplits = athletes.filter((a) => a.athleteResult.splits.length > 0);
  if (withSplits.length <= 1) return "label";

  const labelSets = withSplits.map(
    (a) => new Set(a.athleteResult.splits.map((s) => s.label))
  );

  let athletesWithSharedLabel = 0;
  for (let i = 0; i < labelSets.length; i++) {
    for (let j = 0; j < labelSets.length; j++) {
      if (i === j) continue;
      if ([...labelSets[i]].some((l) => labelSets[j].has(l))) {
        athletesWithSharedLabel++;
        break;
      }
    }
  }

  return athletesWithSharedLabel / withSplits.length >= 0.5 ? "label" : "ordinal";
}
```

**Step 2: Add `buildChartDataOrdinal` helper after `buildChartData`**

```typescript
function buildChartDataOrdinal(athletes: WindowAthleteData[]): ChartPoint[] {
  const athletesWithSplits = athletes.filter(
    (a) => a.athleteResult.splits.length > 0
  );
  if (athletesWithSplits.length === 0) return [];
  const maxLen = Math.max(
    ...athletesWithSplits.map((a) => a.athleteResult.splits.length)
  );

  return Array.from({ length: maxLen }, (_, i) => {
    const point: ChartPoint = { label: `Lap ${i + 1}` };
    for (const a of athletes) {
      if (!a.visible) continue;
      const split = a.athleteResult.splits[i];
      if (split?.lap_s != null) {
        point[a.athleteResult.athlete.id] = split.lap_s;
      }
    }
    return point;
  });
}
```

**Step 3: Update `buildElapsedLookup` to accept a `mode` param**

Replace the function (lines 79–91):

```typescript
function buildElapsedLookup(
  athletes: WindowAthleteData[],
  mode: LabelMode
): Record<string, Record<string, number>> {
  const lookup: Record<string, Record<string, number>> = {};
  for (const a of athletes) {
    const map: Record<string, number> = {};
    a.athleteResult.splits.forEach((s, i) => {
      const key = mode === "ordinal" ? `Lap ${i + 1}` : s.label;
      if (s.elapsed_s != null) map[key] = s.elapsed_s;
    });
    lookup[a.athleteResult.athlete.id] = map;
  }
  return lookup;
}
```

**Step 4: Update `buildRawLapLookup` to accept a `mode` param**

Replace the function (lines 94–106):

```typescript
function buildRawLapLookup(
  athletes: WindowAthleteData[],
  mode: LabelMode
): Record<string, Record<string, number>> {
  const lookup: Record<string, Record<string, number>> = {};
  for (const a of athletes) {
    const map: Record<string, number> = {};
    a.athleteResult.splits.forEach((s, i) => {
      const key = mode === "ordinal" ? `Lap ${i + 1}` : s.label;
      if (s.lap_s != null) map[key] = s.lap_s;
    });
    lookup[a.athleteResult.athlete.id] = map;
  }
  return lookup;
}
```

**Step 5: Update `SplitChart` component body to use mode detection**

In the `SplitChart` function (starting line 176), update the data-building section.

Replace lines 181–193:

```tsx
const labelMode = detectLabelMode(athletes);
const data =
  labelMode === "ordinal"
    ? buildChartDataOrdinal(athletes)
    : buildChartData(athletes);
```

Then update the lookup calls (currently lines 192–193):

```tsx
const elapsedLookup = buildElapsedLookup(athletes, labelMode);
const rawLapLookup = buildRawLapLookup(athletes, labelMode);
```

**Step 6: Remove `connectNulls` from Line components**

In the `visibleAthletes.map(...)` section (around line 307–318), change:

```tsx
{visibleAthletes.map((a) => (
  <Line
    key={a.athleteResult.athlete.id}
    type="monotone"
    dataKey={a.athleteResult.athlete.id}
    stroke={a.color}
    strokeWidth={2}
    dot={{ r: 5, fill: a.color }}
    activeDot={{ r: 7, stroke: "#fff", strokeWidth: 2 }}
  />
))}
```

(Remove `connectNulls` — it was `true`, which was wrong. Default is `false`.)

**Step 7: Add ordinal mode note below chart**

After the `</ResponsiveContainer>` closing tag and before the closing `</div>` of the chart container, add:

```tsx
{labelMode === "ordinal" && (
  <p className="text-xs text-zinc-500 italic text-center mt-1">
    Note: splits aligned by position — intervals may differ between athletes.
  </p>
)}
```

**Step 8: Pass `labelMode` down to `CustomTooltip`**

`CustomTooltip` doesn't need changes since it receives `label` (already "Lap N" in ordinal mode) — the lookups already use the correct keys after Step 3–4.

**Step 9: Smoke test**
- Add Brody Kemble (label-based splits: "200m", "400m"...) and Ramon Rodriguez (ordinal-based: "1", "2"...)
- Verify BOTH lines render simultaneously
- Verify the italic note appears: "Note: splits aligned by position..."
- Add two athletes from the same provider (same label format) — verify no note appears, chart uses distance labels as before
- Hover a point — tooltip shows correct lap time for each athlete

**Step 10: Commit**
```bash
git add apps/web/src/components/SplitChart.tsx
git commit -m "fix: ordinal alignment fallback for cross-provider split charts"
```

---

## Task 3: Fix 3 — No-Splits Visual Fallback

**Files:**
- Modify: `apps/web/src/components/SplitChart.tsx`
- Modify: `apps/web/src/components/Legend.tsx`

### Strategy

1. Partition athletes into `withSplits` and `noSplitAthletes`
2. If ALL athletes have 0 splits → show "No split data available for this race."
3. Otherwise:
   - Build chart data from `withSplits` athletes normally
   - For each `noSplitAthletes[i]` inject their constant `flatLap_s` at every chart x-point
   - Render them as a separate dashed `<Line>` (no dots)
   - In deviation mode: omit them entirely + show a note
4. Legend: show "(no splits)" italic badge for no-split athletes
5. Below chart: one italic line per no-split athlete

**Step 1: Add `getExpectedLaps` helper at top of `SplitChart.tsx` (after imports)**

```typescript
function getExpectedLaps(distance: string): number {
  const map: Record<string, number> = {
    "800m": 4, "1000m": 5, "1500m": 8, "Mile": 9,
    "3000m": 15, "5000m": 25, "10000m": 50,
  };
  return map[distance] ?? 25;
}
```

**Step 2: Partition athletes in `SplitChart` component body**

At the top of the `SplitChart` function, after `const visibleAthletes = ...`, add:

```tsx
const athletesWithSplits = athletes.filter(
  (a) => a.athleteResult.splits.length > 0
);
const noSplitAthletes = athletes.filter(
  (a) => a.athleteResult.splits.length === 0 && a.visible
);
const allNoSplits =
  athletes.length > 0 && athletesWithSplits.length === 0;
```

**Step 3: Update the empty-state check**

Replace the current check (lines 183–189):

```tsx
if (allNoSplits) {
  return (
    <div className="flex items-center justify-center h-48 text-zinc-500 text-sm italic">
      No split data available for this race.
    </div>
  );
}

if (data.length === 0 || visibleAthletes.length === 0) {
  return (
    <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
      Add athletes to see split data
    </div>
  );
}
```

**Step 4: Inject flat lap values for no-split athletes into `data`**

After building `data` (the `const data = ...` line), add:

```tsx
// Inject flat reference line for no-split athletes
if (!deviationMode) {
  for (const a of noSplitAthletes) {
    if (a.athleteResult.result.time_s == null) continue;
    const laps = getExpectedLaps(a.athleteResult.event.distance);
    const flatLap = a.athleteResult.result.time_s / laps;
    for (const point of data) {
      point[a.athleteResult.athlete.id] = flatLap;
    }
  }
}
```

**Step 5: Render dashed Lines for no-split athletes**

In the JSX, after the existing `visibleAthletes.map(...)` block, add:

```tsx
{!deviationMode &&
  noSplitAthletes.map((a) => (
    <Line
      key={`nosplit-${a.athleteResult.athlete.id}`}
      type="monotone"
      dataKey={a.athleteResult.athlete.id}
      stroke={a.color}
      strokeWidth={1}
      strokeDasharray="4 4"
      strokeOpacity={0.5}
      dot={false}
      activeDot={false}
    />
  ))}
```

**Step 6: Add "Splits unavailable" notes below chart**

After the ordinal mode note (from Task 2 Step 7), add:

```tsx
{!deviationMode && noSplitAthletes.length > 0 && (
  <div className="mt-1 space-y-0.5">
    {noSplitAthletes.map((a) => (
      <p
        key={a.athleteResult.athlete.id}
        className="text-xs text-zinc-500 italic text-center"
      >
        Splits unavailable for {a.athleteResult.athlete.name}
      </p>
    ))}
  </div>
)}
{deviationMode && noSplitAthletes.length > 0 && (
  <p className="text-xs text-zinc-500 italic text-center mt-1">
    {noSplitAthletes.map((a) => a.athleteResult.athlete.name).join(", ")}{" "}
    {noSplitAthletes.length === 1 ? "has" : "have"} no splits and{" "}
    {noSplitAthletes.length === 1 ? "is" : "are"} omitted from deviation view.
  </p>
)}
```

**Step 7: Update `Legend.tsx` to show "(no splits)" badge**

Replace the athlete name span in `Legend.tsx` (lines 34–35):

```tsx
<span className="text-zinc-200">{athlete.name}</span>
{a.athleteResult.splits.length === 0 && (
  <span className="text-zinc-500 italic text-xs">(no splits)</span>
)}
<span className="text-zinc-500">
  {a.athleteResult.result.time_str}
</span>
```

**Step 8: Smoke test**
- Add an athlete with splits + one GLIAC athlete with 0 splits
- Verify: both show in legend; no-split athlete has "(no splits)" italic tag
- Verify: no-split athlete renders as a thin flat dashed line across the chart
- Verify: italic note "Splits unavailable for [Name]" appears below chart
- Switch to deviation mode: verify no-split athlete's dashed line disappears; note about omission appears
- Add ONLY the no-split athlete: verify "No split data available for this race." message

**Step 9: Commit**
```bash
git add apps/web/src/components/SplitChart.tsx apps/web/src/components/Legend.tsx
git commit -m "feat: no-splits flat reference line and legend badge for athletes without split data"
```

---

## Final Verification

After all three tasks:

1. **Run the dev server:**
   ```bash
   cd apps/web && npm run dev
   ```

2. **End-to-end check:**
   - Fix 1: season filter buttons appear, filter works, event names show conference context
   - Fix 2: cross-provider athletes both render; ordinal note appears when needed; no connectNulls gaps
   - Fix 3: no-split athlete → flat dashed line + legend badge + italic note below

---

**Plan complete and saved to `docs/plans/2026-03-04-frontend-fixes-123.md`. Two execution options:**

**1. Subagent-Driven (this session)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Parallel Session (separate)** — Open a new session with `executing-plans`, batch execution with checkpoints.

**Which approach?**

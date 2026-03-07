# Frontend Update v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace deviation toggle with elapsed split view, add reset/clear UX, fix Ko-fi link, enlarge logo, add tooltip transparency + source URL link.

**Architecture:** All changes are in `apps/web/src/`. The elapsed split view replaces deviation mode in SplitChart.tsx using existing `elapsed_s` data. A new `resetWindow` Zustand action clears window state. Header/Legend receive small targeted edits.

**Tech Stack:** React 18, TypeScript, Recharts, Zustand, Tailwind CSS, Vite

**Design doc:** `docs/plans/2026-03-06-frontend-update-v2-design.md`

**No test framework is configured.** Verification uses `tsc -b && vite build` (type-check + build) and manual browser testing via `npm run dev`.

---

## Parallel Batching Strategy

Tasks 1-4 are **fully independent** — they touch different files with no overlap. They can be dispatched to parallel agents.

| Task | Files | Depends On |
|------|-------|------------|
| 1. Header fixes (Ko-fi + logo) | `Header.tsx` | — |
| 2. Legend (transparency + source link) | `Legend.tsx`, `types/pace.ts` | — |
| 3. Reset + clear buttons | `window-store.ts`, `PaceWindow.tsx`, `AthleteSearch.tsx` | — |
| 4. Elapsed split view | `SplitChart.tsx` | — |
| 5. Build verification | all | 1, 2, 3, 4 |
| 6. Final commit | all | 5 |

---

## Task 1: Header Fixes (Ko-fi Link + Logo Size)

**Files:**
- Modify: `apps/web/src/components/Header.tsx`

**Step 1: Update Ko-fi URL**

In `Header.tsx` line 35, change:
```tsx
href="https://ko-fi.com/PLACEHOLDER"
```
to:
```tsx
href="https://ko-fi.com/devbynemo"
```

**Step 2: Increase logo size**

In `Header.tsx` line 16, change:
```tsx
<img src="/favicon.png" alt="PACE logo" className="w-8 h-8" />
```
to:
```tsx
<img src="/favicon.png" alt="PACE logo" className="w-10 h-10" />
```

**Step 3: Verify**

Run: `cd apps/web && npx tsc -b --noEmit`
Expected: No errors.

---

## Task 2: Legend Tooltip (Transparency + Source URL Link)

**Files:**
- Modify: `apps/web/src/types/pace.ts` (add `source_url` to Event)
- Modify: `apps/web/src/components/Legend.tsx` (tooltip styling + link)

**Step 1: Add `source_url` to Event type**

In `types/pace.ts`, add `source_url` field to the `Event` interface after `provider`:

```typescript
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
  source_url: string | null;
}
```

**Step 2: Make tooltip semi-transparent**

In `Legend.tsx` line 41, change the tooltip container class from:
```tsx
className="absolute bottom-full left-0 mb-1 z-50 bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 shadow-lg whitespace-nowrap text-xs"
```
to:
```tsx
className="absolute bottom-full left-0 mb-1 z-50 bg-zinc-800/80 backdrop-blur-sm border border-zinc-700 rounded-md px-3 py-2 shadow-lg whitespace-nowrap text-xs"
```

**Step 3: Make race name a conditional link**

In `Legend.tsx` line 44, replace the plain text event name:
```tsx
<p className="text-zinc-400">{event.name}</p>
```
with a conditional link:
```tsx
{event.source_url ? (
  <a
    href={event.source_url}
    target="_blank"
    rel="noopener noreferrer"
    className="text-blue-400 hover:text-blue-300 underline"
    onClick={(e) => e.stopPropagation()}
  >
    {event.name}
  </a>
) : (
  <p className="text-zinc-400">{event.name}</p>
)}
```

Note: `e.stopPropagation()` prevents the click from toggling athlete visibility.

**Step 4: Verify**

Run: `cd apps/web && npx tsc -b --noEmit`
Expected: No errors.

---

## Task 3: Reset Button + Clear "x" on Search Inputs

**Files:**
- Modify: `apps/web/src/stores/window-store.ts` (add `resetWindow` action)
- Modify: `apps/web/src/components/PaceWindow.tsx` (add reset button)
- Modify: `apps/web/src/components/AthleteSearch.tsx` (add clear "x" to inputs)

**Step 1: Add `resetWindow` action to Zustand store**

In `window-store.ts`, add to the `WindowStore` interface (after line 18):
```typescript
resetWindow: (windowId: string) => void;
```

Add the implementation inside the `create` call (after `removeWindow`, around line 39):
```typescript
resetWindow: (windowId) => {
  set({
    windows: get().windows.map((w) =>
      w.id === windowId ? { ...w, distance: null, athletes: [] } : w
    ),
  });
},
```

**Step 2: Add reset button to PaceWindow header**

In `PaceWindow.tsx`, add `resetWindow` to the store selectors (after line 17):
```typescript
const resetWindow = useWindowStore((s) => s.resetWindow);
```

In the header bar (line 25-37), add a reset button before the close button. Replace the header `div` content:
```tsx
<div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/80">
  <DistanceSelector
    value={paceWindow.distance}
    onChange={(d) => setDistance(windowId, d)}
  />
  <div className="flex items-center gap-1">
    <button
      onClick={() => resetWindow(windowId)}
      className="text-zinc-500 hover:text-zinc-200 text-xs px-1.5 py-0.5 rounded border border-zinc-700 hover:border-zinc-500 transition-colors"
      title="Reset window"
    >
      Reset
    </button>
    <button
      onClick={() => removeWindow(windowId)}
      className="text-zinc-500 hover:text-red-400 text-lg leading-none px-1"
      title="Close window"
    >
      &times;
    </button>
  </div>
</div>
```

**Step 3: Add clear "x" to search inputs in AthleteSearch**

In `AthleteSearch.tsx`, replace the race search input (lines 141-147) with a wrapper that includes a clear button:
```tsx
<div className="relative">
  <input
    type="text"
    placeholder="Search races..."
    value={eventSearch}
    onChange={(e) => setEventSearch(e.target.value)}
    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5 pr-6 placeholder-zinc-500"
  />
  {eventSearch && (
    <button
      onClick={() => setEventSearch("")}
      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
    >
      &times;
    </button>
  )}
</div>
```

Replace the name search input (lines 179-185) with the same pattern:
```tsx
<div className="relative">
  <input
    type="text"
    placeholder="Search by name..."
    value={nameQuery}
    onChange={(e) => setNameQuery(e.target.value)}
    className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5 pr-6 placeholder-zinc-500"
  />
  {nameQuery && (
    <button
      onClick={() => setNameQuery("")}
      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
    >
      &times;
    </button>
  )}
</div>
```

**Step 4: Verify**

Run: `cd apps/web && npx tsc -b --noEmit`
Expected: No errors.

---

## Task 4: Elapsed Split View (Main Feature)

**Files:**
- Modify: `apps/web/src/components/SplitChart.tsx`

This is the largest change. We replace deviation mode with elapsed mode and make elapsed the default.

**Step 1: Remove deviation-specific code**

Delete the following functions and code from `SplitChart.tsx`:
- `buildDeviationData()` function (lines 122-145)
- `buildRawLapLookup()` function (lines 163-177)

**Step 2: Add `buildElapsedChartData()` function**

Add this function after `buildChartData()` (after line 120):

```typescript
function buildElapsedChartData(athletes: WindowAthleteData[]): ChartPoint[] {
  // Collect all unique distance_m values across visible athletes
  const distSet = new Set<number>();
  for (const a of athletes) {
    if (!a.visible) continue;
    for (const s of a.athleteResult.splits) {
      if (s.distance_m != null) distSet.add(s.distance_m);
    }
  }

  // Fallback: if no distance_m data, use label-based (legacy behavior)
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
        if (split?.elapsed_s != null) {
          point[a.athleteResult.athlete.id] = split.elapsed_s;
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
      const elapsed = interpolateElapsed(a.athleteResult.splits, dist);
      if (elapsed != null) {
        point[a.athleteResult.athlete.id] = elapsed;
      }
    }
    return point;
  });
}
```

**Step 3: Update the component state and toggle**

In the `SplitChart` component function, rename state from `deviationMode` to `elapsedMode` and default to `true`:

```typescript
const [elapsedMode, setElapsedMode] = useState(true);
```

**Step 4: Update chart data selection**

Replace the old chart data logic (around line 262):
```typescript
const chartData = deviationMode ? buildDeviationData(data, athletes) : data;
```
with:
```typescript
const chartData = elapsedMode ? buildElapsedChartData(athletes) : data;
```

Remove `rawLapLookup` (no longer needed):
```typescript
// DELETE: const rawLapLookup = buildRawLapLookup(athletes);
```

Remove `baselineName` (no longer needed):
```typescript
// DELETE: const baselineName = athletes[0]?.athleteResult.athlete.name.split(" ").pop() ?? "First";
```

**Step 5: Update the toggle buttons**

Replace the toggle button group (lines 306-328) with:
```tsx
<div className="flex rounded overflow-hidden border border-zinc-700 text-xs">
  <button
    className={`px-3 py-1 transition-colors ${
      elapsedMode
        ? "bg-zinc-700 text-white"
        : "text-zinc-400 hover:text-white"
    }`}
    onClick={() => setElapsedMode(true)}
  >
    Elapsed
  </button>
  <button
    className={`px-3 py-1 transition-colors ${
      !elapsedMode
        ? "bg-zinc-700 text-white"
        : "text-zinc-400 hover:text-white"
    }`}
    onClick={() => setElapsedMode(false)}
  >
    Raw Splits
  </button>
</div>
```

**Step 6: Update Y-axis and tooltip**

Replace the Y-axis `tickFormatter` and `label` (lines 346-362):
```tsx
<YAxis
  tick={{ fill: "#999", fontSize: 12 }}
  tickFormatter={(v: number) => formatSeconds(v)}
  domain={[yMin - padding, yMax + padding]}
/>
```

Remove the `ReferenceLine` for deviation zero line (lines 364-367) — no longer needed.

**Step 7: Update CustomTooltip**

Replace the `CustomTooltip` component. Remove `deviationMode` and `rawLapLookup` props. The tooltip now shows:
- **Elapsed mode:** elapsed time + lap split in parentheses
- **Raw mode:** lap time + elapsed in parentheses (same as current raw mode)

```tsx
function CustomTooltip({
  active,
  payload,
  label,
  elapsedLookup,
  athleteNames,
  elapsedMode,
  rawLapLookup,
}: any) {
  if (!active || !payload?.length) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs text-zinc-400 mb-1">{label}</p>
      {payload.map((entry: any) => {
        const athleteId = entry.dataKey;
        const elapsed = elapsedLookup?.[athleteId]?.[label];
        const rawLap = rawLapLookup?.[athleteId]?.[label];
        const name = athleteNames?.[athleteId] ?? athleteId;
        return (
          <div key={athleteId} className="mb-1 last:mb-0">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs text-zinc-400">{name}</span>
            </div>
            <div className="ml-4">
              {elapsedMode ? (
                <>
                  <span className="text-sm font-medium text-white">
                    {formatSeconds(entry.value)}
                  </span>
                  {rawLap != null && (
                    <span className="text-xs text-zinc-500 italic ml-2">
                      (lap: {formatSeconds(rawLap)})
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-sm font-medium text-white">
                    {formatSeconds(entry.value)}
                  </span>
                  {elapsed != null && (
                    <span className="text-xs text-zinc-500 italic ml-2">
                      ({formatSeconds(elapsed)})
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
```

**Step 8: Update Tooltip rendering**

Replace the `<Tooltip>` in the JSX to pass updated props:
```tsx
<Tooltip
  content={
    <CustomTooltip
      elapsedLookup={elapsedLookup}
      athleteNames={athleteNames}
      elapsedMode={elapsedMode}
      rawLapLookup={rawLapLookup}
    />
  }
/>
```

Note: We need to keep `buildRawLapLookup` after all — the elapsed tooltip uses it to show the lap split in parentheses. **Do NOT delete `buildRawLapLookup` in Step 1.** Only delete `buildDeviationData`.

**Step 9: Build rawLapLookup in component**

Keep the existing `rawLapLookup` computation in the component body. The final variable declarations should be:
```typescript
const chartData = elapsedMode ? buildElapsedChartData(athletes) : data;
const elapsedLookup = buildElapsedLookup(athletes);
const rawLapLookup = buildRawLapLookup(athletes);
const athleteNames: Record<string, string> = {};
for (const a of athletes) {
  athleteNames[a.athleteResult.athlete.id] = a.athleteResult.athlete.name;
}
```

**Step 10: Verify**

Run: `cd apps/web && npx tsc -b --noEmit`
Expected: No errors.

---

## Task 5: Build Verification

**Depends on:** Tasks 1-4 complete.

**Step 1: Type check**

Run: `cd apps/web && npx tsc -b --noEmit`
Expected: No errors.

**Step 2: Production build**

Run: `cd apps/web && npm run build`
Expected: Build succeeds with no errors.

**Step 3: Manual browser test**

Run: `cd apps/web && npm run dev`

Verify in browser:
- [ ] Header: Nemo logo is 40px, Ko-fi heart links to `https://ko-fi.com/devbynemo`
- [ ] Chart defaults to Elapsed view (lines going upward, cumulative times)
- [ ] Toggle to Raw Splits shows lap-by-lap times (same as before)
- [ ] Tooltip in elapsed mode shows elapsed time + "(lap: Xs)" in italics
- [ ] Tooltip in raw mode shows lap time + "(elapsed)" in italics
- [ ] Reset button in window header resets to "Select a distance"
- [ ] Clear "x" appears on text inputs when text is entered, clears on click
- [ ] Legend hover tooltip is semi-transparent with blur
- [ ] Event name in tooltip renders as plain text (source_url not yet populated)

---

## Task 6: Commit

**Step 1: Stage and commit**

```bash
cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace
git add apps/web/src/components/Header.tsx \
        apps/web/src/components/Legend.tsx \
        apps/web/src/components/SplitChart.tsx \
        apps/web/src/components/PaceWindow.tsx \
        apps/web/src/components/AthleteSearch.tsx \
        apps/web/src/stores/window-store.ts \
        apps/web/src/types/pace.ts
git commit -m "feat: frontend update v2 — elapsed split view, reset/clear, Ko-fi, tooltip transparency"
```

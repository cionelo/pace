# Chart Toggles — Four Core Views Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current 3-mode chart toggle (gap/virtual/raw) with a 4-mode toggle (Virtual Gap, Lap Pace, Position, Time Gain/Loss) and add a `?` FAQ modal explaining each view.

**Architecture:** All data is computable from existing split fields (`elapsed_s`, `lap_s`, `distance_m`) — no backend changes. Changes are confined to `SplitChart.tsx` (update type, remove one builder, add two new builders, update routing/UI) and a new `ChartFaqModal.tsx`.

**Tech Stack:** React, TypeScript, Recharts, Tailwind CSS (zinc palette)

---

## Mode Map

| mode key | display label | data builder | Y-axis | zero line |
|---|---|---|---|---|
| `"virtual"` | Virtual Gap | `buildVirtualGapData` (existing) | `+/-Xs` | yes |
| `"raw"` | Lap Pace | `buildChartData` (existing) | `mm:ss` | no |
| `"position"` | Position | `buildPositionData` (NEW) | integer rank | no, Y inverted |
| `"time_gain_loss"` | Time Gain/Loss | `buildTimeGainLossData` (NEW) | `+/-Xs` | yes |

**Dropped:** `"gap"` (Gap vs [Name]) and `"split_delta"` — both removed.

**Time Gain/Loss reference:** field average lap pace per segment (`avg(lap_s)` across all visible athletes), NOT the first athlete. Formula: `lap_s_athlete - avg(lap_s_all_visible_at_that_segment)`.

---

## Task 1: Update SplitChart.tsx — type, default, remove gap builder, add two new builders, update all routing/UI

**Files:**
- Modify: `apps/web/src/components/SplitChart.tsx`

This task covers all changes to SplitChart.tsx in one pass (it's one file, all changes are interdependent).

### Step 1: Update ChartMode type (line ~18)

```typescript
// Before
type ChartMode = "gap" | "virtual" | "raw";

// After
type ChartMode = "virtual" | "raw" | "position" | "time_gain_loss";
```

### Step 2: Update useState default (line ~327)

```typescript
// Before
const [mode, setMode] = useState<ChartMode>("gap");

// After
const [mode, setMode] = useState<ChartMode>("virtual");
```

### Step 3: Delete buildCumulativeGapData entirely

Remove the entire function `buildCumulativeGapData` (~lines 131–165). It will not be replaced — the "Gap vs [Name]" mode is dropped.

### Step 4: Add buildPositionData

Insert after `buildVirtualGapData`:

```typescript
/** Position: Y = rank of athlete at each split (1 = leader). Inverted Y-axis in chart. */
function buildPositionData(athletes: WindowAthleteData[]): ChartPoint[] {
  const visible = athletes.filter((a) => a.visible);
  const distances = collectDistances(athletes);

  if (distances.length === 0) {
    return collectLabels(athletes).map((label) => {
      const point: ChartPoint = { label };
      const elapseds: { id: string; elapsed: number }[] = [];
      for (const a of visible) {
        const split = a.athleteResult.splits.find((s) => s.label === label);
        if (split?.elapsed_s != null) {
          elapseds.push({ id: a.athleteResult.athlete.id, elapsed: split.elapsed_s });
        }
      }
      elapseds.sort((a, b) => a.elapsed - b.elapsed);
      elapseds.forEach((e, i) => { point[e.id] = i + 1; });
      return point;
    });
  }

  return distances.map((dist) => {
    const point: ChartPoint = { label: formatDistance(dist) };
    const elapseds: { id: string; elapsed: number }[] = [];
    for (const a of visible) {
      const elapsed = interpolateElapsed(a.athleteResult.splits, dist);
      if (elapsed != null) {
        elapseds.push({ id: a.athleteResult.athlete.id, elapsed });
      }
    }
    elapseds.sort((a, b) => a.elapsed - b.elapsed);
    elapseds.forEach((e, i) => { point[e.id] = i + 1; });
    return point;
  });
}
```

### Step 5: Add buildTimeGainLossData (field average reference)

Insert after `buildPositionData`:

```typescript
/** Time Gain/Loss: per-segment lap_s delta vs field average (positive = lost time vs avg) */
function buildTimeGainLossData(athletes: WindowAthleteData[]): ChartPoint[] {
  const visible = athletes.filter((a) => a.visible);
  const distances = collectDistances(athletes);

  if (distances.length === 0) {
    return collectLabels(athletes).map((label) => {
      const point: ChartPoint = { label };
      const laps = visible
        .map((a) => a.athleteResult.splits.find((s) => s.label === label)?.lap_s)
        .filter((v): v is number => v != null);
      if (laps.length === 0) return point;
      const avg = laps.reduce((a, b) => a + b, 0) / laps.length;
      for (const a of visible) {
        const lap = a.athleteResult.splits.find((s) => s.label === label)?.lap_s ?? null;
        if (lap != null) {
          point[a.athleteResult.athlete.id] = lap - avg;
        }
      }
      return point;
    });
  }

  return distances.map((dist) => {
    const point: ChartPoint = { label: formatDistance(dist) };
    const laps = visible
      .map((a) => a.athleteResult.splits.find((s) => s.distance_m === dist)?.lap_s)
      .filter((v): v is number => v != null);
    if (laps.length === 0) return point;
    const avg = laps.reduce((a, b) => a + b, 0) / laps.length;
    for (const a of visible) {
      const split = a.athleteResult.splits.find((s) => s.distance_m === dist);
      const lap = split?.lap_s ?? null;
      if (lap != null) {
        point[a.athleteResult.athlete.id] = lap - avg;
      }
    }
    return point;
  });
}
```

### Step 6: Update chartData routing

Find:
```typescript
const chartData =
  mode === "gap"
    ? buildCumulativeGapData(athletes)
    : mode === "virtual"
      ? buildVirtualGapData(athletes)
      : data;
```

Replace with:
```typescript
const chartData =
  mode === "virtual"
    ? buildVirtualGapData(athletes)
    : mode === "position"
      ? buildPositionData(athletes)
      : mode === "time_gain_loss"
        ? buildTimeGainLossData(athletes)
        : data; // "raw" → buildChartData result (already in `data`)
```

### Step 7: Delete baselineName

Remove the block:
```typescript
const baselineName =
  mode === "gap"
    ? athletes[0]?.athleteResult.athlete.name.split(" ").pop() ?? "First"
    : null;
```

It's only used in the old "Gap vs [Name]" toggle label.

### Step 8: Update isGapMode + add isPositionMode

Find:
```typescript
const isGapMode = mode === "gap" || mode === "virtual";
```

Replace with:
```typescript
const isGapMode = mode === "virtual" || mode === "time_gain_loss";
const isPositionMode = mode === "position";
```

### Step 9: Update Y-axis tickFormatter

Find the `tickFormatter` prop and replace with:
```typescript
tickFormatter={
  isGapMode
    ? (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}s`
    : isPositionMode
      ? (v: number) => String(Math.round(v))
      : (v: number) => formatSeconds(v)
}
```

### Step 10: Add reversed prop to YAxis for position mode

Add `reversed={isPositionMode}` to the `<YAxis>` component.

### Step 11: Update CustomTooltip value rendering

In the `CustomTooltip` function, replace the value rendering branch:

```typescript
// Before
{mode === "gap" || mode === "virtual" ? ( ... ) : ( ... )}

// After
{isGapMode ? (
  <>
    <span className="text-sm font-medium text-white">
      {entry.value >= 0 ? "+" : ""}
      {entry.value.toFixed(2)}s
    </span>
    {elapsed != null && (
      <span className="text-xs text-zinc-500 italic ml-2">
        ({formatSeconds(elapsed)})
      </span>
    )}
    {rawLap != null && (
      <span className="text-xs text-zinc-500 italic ml-2">
        lap: {formatSeconds(rawLap)}
      </span>
    )}
  </>
) : isPositionMode ? (
  <>
    <span className="text-sm font-medium text-white">
      P{Math.round(entry.value)}
    </span>
    {elapsed != null && (
      <span className="text-xs text-zinc-500 italic ml-2">
        ({formatSeconds(elapsed)})
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
```

Note: `CustomTooltip` currently receives `mode` as a prop but `isGapMode`/`isPositionMode` are only computed inside `SplitChart`. Either:
- Pass `isGapMode` and `isPositionMode` as props to `CustomTooltip` instead of `mode`, or
- Compute them inside `CustomTooltip` using the same logic.

Simplest: pass `mode` (already done) and compute inside `CustomTooltip`:
```typescript
const isGapModeTooltip = mode === "virtual" || mode === "time_gain_loss";
const isPositionModeTooltip = mode === "position";
```

### Step 12: Update toggle button array

Find the button array and replace with 4 modes:

```tsx
{(
  [
    ["virtual", "Virtual Gap"],
    ["raw", "Lap Pace"],
    ["position", "Position"],
    ["time_gain_loss", "Time Gain/Loss"],
  ] as [ChartMode, string][]
).map(([key, label]) => (
  <button
    key={key}
    className={`px-3 py-1 transition-colors ${
      mode === key
        ? "bg-zinc-700 text-white"
        : "text-zinc-400 hover:text-white"
    }`}
    onClick={() => setMode(key)}
  >
    {label}
  </button>
))}
```

### Step 13: Verify TypeScript compiles

```bash
cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace/apps/web && npx tsc --noEmit 2>&1 | head -40
```

Expected: zero new errors.

### Step 14: Commit

```bash
cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace
git add apps/web/src/components/SplitChart.tsx
git commit -m "feat: replace 3-mode toggle with 4-mode (virtual gap, lap pace, position, time gain/loss)"
```

---

## Task 2: Create ChartFaqModal and wire into SplitChart

**Files:**
- Create: `apps/web/src/components/ChartFaqModal.tsx`
- Modify: `apps/web/src/components/SplitChart.tsx` (add import + wire `?` button)

### Step 1: Create ChartFaqModal.tsx

```tsx
import { useState } from "react";

const CHART_FAQS = [
  {
    name: "Virtual Gap",
    description:
      "Shows how each athlete's pacing deviates from a perfectly even effort across the race. The zero line represents an idealized even-pace finish at the average field time. Peaks mean slower laps; valleys mean faster laps. Use this to spot surges, slowdowns, and who was working hardest at each point.",
  },
  {
    name: "Lap Pace",
    description:
      "Displays the raw lap-by-lap split time for each athlete in mm:ss format. Lower on the Y-axis is faster. Use this to see absolute speed at each segment — useful for identifying kick pace, early blazing laps, or the exact splits that decided a race.",
  },
  {
    name: "Position",
    description:
      "Shows each athlete's race position (rank among visible athletes) at every split, with rank 1 at the top. Use this to see tactical moves — when an athlete moved through the field, held position, or got dropped — which raw split times alone cannot reveal.",
  },
  {
    name: "Time Gain/Loss",
    description:
      "Shows per-segment time gained or lost relative to the field average pace for that segment. Negative values mean the athlete ran that lap faster than average; positive means slower. Unlike Virtual Gap (cumulative), this isolates each individual lap so you can pinpoint the exact segment that decided the race.",
  },
] as const;

export default function ChartFaqModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-5 h-5 flex items-center justify-center rounded-full border border-zinc-600 text-zinc-500 hover:text-zinc-300 hover:border-zinc-400 text-xs leading-none transition-colors flex-shrink-0"
        title="Chart view explanations"
        aria-label="Chart FAQ"
      >
        ?
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-lg w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-white">Chart Views</h2>
              <button
                onClick={() => setOpen(false)}
                className="text-zinc-500 hover:text-white transition-colors text-lg leading-none"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="flex flex-col gap-4">
              {CHART_FAQS.map((faq) => (
                <div key={faq.name}>
                  <p className="text-xs font-semibold text-zinc-200 mb-1">
                    {faq.name}
                  </p>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {faq.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
```

### Step 2: Wire into SplitChart.tsx

Add import at top of SplitChart.tsx:
```typescript
import ChartFaqModal from "./ChartFaqModal";
```

Find the right side of the header row (currently just the toggle group `div`). Wrap both the `?` button and toggle inside a flex container:

```tsx
<div className="flex items-center gap-2">
  <ChartFaqModal />
  <div className="flex rounded overflow-hidden border border-zinc-700 text-xs">
    {/* ... existing 4-button toggle ... */}
  </div>
</div>
```

### Step 3: Verify TypeScript compiles

```bash
cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace/apps/web && npx tsc --noEmit 2>&1 | head -40
```

### Step 4: Visual QA checklist

- [ ] `?` button appears left of toggle group
- [ ] Click `?` opens modal with 4 chart descriptions
- [ ] Click outside modal closes it
- [ ] `×` closes modal
- [ ] All 4 toggle modes switch the chart without errors
- [ ] Virtual Gap: `+/-Xs` Y-axis, zero reference line
- [ ] Lap Pace: `mm:ss` Y-axis, no zero line
- [ ] Position: integer Y-axis (1, 2, 3), Y inverted (1 at top)
- [ ] Time Gain/Loss: `+/-Xs` Y-axis, zero reference line
- [ ] Tooltip shows `P1`, `P2` etc for Position mode

### Step 5: Commit

```bash
cd /Users/ncionelo/Downloads/JOBS/FOR\ GITHUB/PACE/pace
git add apps/web/src/components/SplitChart.tsx apps/web/src/components/ChartFaqModal.tsx
git commit -m "feat: add chart FAQ modal with ? button"
```

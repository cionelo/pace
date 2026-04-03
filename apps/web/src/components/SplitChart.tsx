import { useState, useEffect } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { WindowAthleteData, AthleteResult } from "../types/pace";
import { getEventResults } from "../lib/db";
import ChartFaqModal from "./ChartFaqModal";
import { useThemeStore } from "../stores/theme-store";

interface SplitChartProps {
  athletes: WindowAthleteData[];
}

type ChartMode = "virtual" | "raw" | "position" | "time_gain_loss";

function formatSeconds(s: number): string {
  const abs = Math.abs(s);
  const min = Math.floor(abs / 60);
  const sec = abs % 60;
  if (min === 0) return `${sec.toFixed(1)}s`;
  return `${min}:${sec.toFixed(1).padStart(4, "0")}`;
}

interface ChartPoint {
  label: string;
  [athleteId: string]: number | string;
}

function formatDistance(meters: number): string {
  if (meters >= 1000 && meters % 1000 === 0) return `${meters / 1000}K`;
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)}K`;
  return `${meters}m`;
}

/** Linear interpolation of elapsed_s at a target distance */
function interpolateElapsed(
  splits: { distance_m: number | null; elapsed_s: number | null }[],
  targetDist: number
): number | null {
  const exact = splits.find((s) => s.distance_m === targetDist);
  if (exact?.elapsed_s != null) return exact.elapsed_s;

  let before: (typeof splits)[0] | null = null;
  let after: (typeof splits)[0] | null = null;
  for (const s of splits) {
    if (s.elapsed_s == null || s.distance_m == null) continue;
    if (s.distance_m <= targetDist) before = s;
    if (s.distance_m >= targetDist && !after) after = s;
  }

  if (!before || !after || before === after) return null;
  if (before.elapsed_s == null || after.elapsed_s == null) return null;
  if (before.distance_m == null || after.distance_m == null) return null;

  const frac =
    (targetDist - before.distance_m) / (after.distance_m - before.distance_m);
  return before.elapsed_s + frac * (after.elapsed_s - before.elapsed_s);
}

/** Collect sorted unique distance_m values from visible athletes */
function collectDistances(athletes: WindowAthleteData[]): number[] {
  const distSet = new Set<number>();
  for (const a of athletes) {
    if (!a.visible) continue;
    for (const s of a.athleteResult.splits) {
      if (s.distance_m != null) distSet.add(s.distance_m);
    }
  }
  return [...distSet].sort((a, b) => a - b);
}

/** Collect ordered labels from the athlete with the most splits (legacy fallback) */
function collectLabels(athletes: WindowAthleteData[]): string[] {
  const allLabels: string[] = [];
  for (const a of athletes) {
    if (a.athleteResult.splits.length > allLabels.length) {
      allLabels.length = 0;
      a.athleteResult.splits.forEach((s) => allLabels.push(s.label));
    }
  }
  return allLabels;
}

/** Raw splits: Y = lap_s per segment */
function buildChartData(athletes: WindowAthleteData[]): ChartPoint[] {
  const distances = collectDistances(athletes);

  if (distances.length === 0) {
    return collectLabels(athletes).map((label) => {
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

  return distances.map((dist, idx) => {
    const point: ChartPoint = { label: formatDistance(dist) };
    for (const a of athletes) {
      if (!a.visible) continue;
      const splits = a.athleteResult.splits;

      const exactSplit = splits.find((s) => s.distance_m === dist);
      if (exactSplit?.lap_s != null) {
        point[a.athleteResult.athlete.id] = exactSplit.lap_s;
        continue;
      }

      const prevDist = idx > 0 ? distances[idx - 1] : null;
      const elapsedHere = interpolateElapsed(splits, dist);
      const elapsedPrev =
        prevDist != null ? interpolateElapsed(splits, prevDist) : null;

      if (elapsedHere != null && elapsedPrev != null) {
        point[a.athleteResult.athlete.id] = elapsedHere - elapsedPrev;
      }
    }
    return point;
  });
}

/** Virtual gap: Y = athlete_elapsed - average_even_pace at each split */
function buildVirtualGapData(athletes: WindowAthleteData[]): ChartPoint[] {
  const visible = athletes.filter((a) => a.visible);
  const distances = collectDistances(athletes);

  const finishTimes: number[] = [];
  let maxDist = 0;
  for (const a of visible) {
    const last = a.athleteResult.splits
      .filter((s) => s.elapsed_s != null)
      .sort((x, y) => (x.ordinal ?? 0) - (y.ordinal ?? 0))
      .pop();
    if (last?.elapsed_s != null) finishTimes.push(last.elapsed_s);
    for (const s of a.athleteResult.splits) {
      if (s.distance_m != null && s.distance_m > maxDist) maxDist = s.distance_m;
    }
  }
  const avgFinish =
    finishTimes.length > 0
      ? finishTimes.reduce((a, b) => a + b, 0) / finishTimes.length
      : 0;

  if (distances.length === 0) {
    const labels = collectLabels(athletes);
    const totalSplits = labels.length;
    return labels.map((label, idx) => {
      const point: ChartPoint = { label };
      const ref = avgFinish * ((idx + 1) / totalSplits);
      for (const a of athletes) {
        if (!a.visible) continue;
        const split = a.athleteResult.splits.find((s) => s.label === label);
        if (split?.elapsed_s != null) {
          point[a.athleteResult.athlete.id] = split.elapsed_s - ref;
        }
      }
      return point;
    });
  }

  return distances.map((dist) => {
    const point: ChartPoint = { label: formatDistance(dist) };
    const ref = maxDist > 0 ? avgFinish * (dist / maxDist) : 0;
    for (const a of athletes) {
      if (!a.visible) continue;
      const elapsed = interpolateElapsed(a.athleteResult.splits, dist);
      if (elapsed != null) {
        point[a.athleteResult.athlete.id] = elapsed - ref;
      }
    }
    return point;
  });
}

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

  return distances.map((dist, idx) => {
    const point: ChartPoint = { label: formatDistance(dist) };

    const lapsByAthlete: { id: string; lap: number }[] = [];
    for (const a of visible) {
      const splits = a.athleteResult.splits;
      const exactSplit = splits.find((s) => s.distance_m === dist);
      let lap: number | null = null;

      if (exactSplit?.lap_s != null) {
        lap = exactSplit.lap_s;
      } else {
        const prevDist = idx > 0 ? distances[idx - 1] : null;
        const elapsedHere = interpolateElapsed(splits, dist);
        const elapsedPrev = prevDist != null ? interpolateElapsed(splits, prevDist) : null;
        if (elapsedHere != null && elapsedPrev != null) {
          lap = elapsedHere - elapsedPrev;
        }
      }

      if (lap != null) {
        lapsByAthlete.push({ id: a.athleteResult.athlete.id, lap });
      }
    }

    if (lapsByAthlete.length === 0) return point;

    const avg = lapsByAthlete.reduce((sum, x) => sum + x.lap, 0) / lapsByAthlete.length;
    for (const { id, lap } of lapsByAthlete) {
      point[id] = lap - avg;
    }

    return point;
  });
}

/** Build a lookup of athlete id -> chart label -> elapsed_s for tooltip */
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

/** Build a lookup of athlete id -> chart label -> lap_s for tooltip */
function buildRawLapLookup(
  athletes: WindowAthleteData[]
): Record<string, Record<string, number>> {
  const lookup: Record<string, Record<string, number>> = {};
  for (const a of athletes) {
    const map: Record<string, number> = {};
    for (const s of a.athleteResult.splits) {
      const key = s.distance_m != null ? formatDistance(s.distance_m) : s.label;
      if (s.lap_s != null) map[key] = s.lap_s;
    }
    lookup[a.athleteResult.athlete.id] = map;
  }
  return lookup;
}

/** Average lap_s for a single athlete across all their splits */
function computeAthleteAvgLap(a: WindowAthleteData): number | null {
  const laps = a.athleteResult.splits
    .map((s) => s.lap_s)
    .filter((v): v is number => v != null);
  if (laps.length === 0) return null;
  return laps.reduce((a, b) => a + b, 0) / laps.length;
}

/** Average lap_s across all athletes in a full field */
function computeFieldOverallAvg(field: AthleteResult[]): number | null {
  const laps: number[] = [];
  for (const ar of field) {
    for (const s of ar.splits) {
      if (s.lap_s != null) laps.push(s.lap_s);
    }
  }
  if (laps.length === 0) return null;
  return laps.reduce((a, b) => a + b, 0) / laps.length;
}

/** Average lap_s per split point across a full field, keyed by chart label */
function computeFieldAvgPerSplit(
  field: AthleteResult[],
  distances: number[]
): Record<string, number> {
  const result: Record<string, number> = {};
  distances.forEach((dist, idx) => {
    const laps: number[] = [];
    for (const ar of field) {
      const exact = ar.splits.find((s) => s.distance_m === dist);
      if (exact?.lap_s != null) {
        laps.push(exact.lap_s);
      } else {
        const prevDist = idx > 0 ? distances[idx - 1] : null;
        const elapsedHere = interpolateElapsed(ar.splits, dist);
        const elapsedPrev =
          prevDist != null ? interpolateElapsed(ar.splits, prevDist) : null;
        if (elapsedHere != null && elapsedPrev != null) {
          laps.push(elapsedHere - elapsedPrev);
        }
      }
    }
    if (laps.length > 0) {
      result[formatDistance(dist)] = laps.reduce((a, b) => a + b, 0) / laps.length;
    }
  });
  return result;
}

function CustomTooltip({
  active,
  payload,
  label,
  elapsedLookup,
  athleteNames,
  mode,
  rawLapLookup,
  theme,
}: any) {
  if (!active || !payload?.length) return null;

  const isDark = theme === "dark";
  const wrapperStyle = {
    backgroundColor: isDark ? "#18181b" : "#ffffff",
    border: isDark ? "1px solid #3f3f46" : "1px solid #e4e4e7",
  };
  const labelColor = isDark ? "#a1a1aa" : "#71717a";
  const nameColor = isDark ? "#a1a1aa" : "#71717a";
  const primaryColor = isDark ? "#ffffff" : "#18181b";
  const secondaryColor = isDark ? "#71717a" : "#a1a1aa";

  return (
    <div style={wrapperStyle} className="rounded-lg px-3 py-2 shadow-lg">
      <p className="text-xs mb-1" style={{ color: labelColor }}>{label}</p>
      {payload.map((entry: any) => {
        const athleteId = entry.dataKey;
        const isFieldAvgSplit = athleteId === "field_avg";
        const elapsed = elapsedLookup?.[athleteId]?.[label];
        const rawLap = rawLapLookup?.[athleteId]?.[label];
        const name = isFieldAvgSplit
          ? "Field avg/split"
          : (athleteNames?.[athleteId] ?? athleteId);
        const isGapModeTooltip = mode === "virtual" || mode === "time_gain_loss";
        const isPositionModeTooltip = mode === "position";
        return (
          <div key={athleteId} className="mb-1 last:mb-0">
            <div className="flex items-center gap-2">
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs" style={{ color: nameColor }}>{name}</span>
            </div>
            <div className="ml-4">
              {isGapModeTooltip ? (
                <>
                  <span className="text-sm font-medium" style={{ color: primaryColor }}>
                    {entry.value >= 0 ? "+" : ""}
                    {entry.value.toFixed(2)}s
                  </span>
                  {elapsed != null && (
                    <span className="text-xs italic ml-2" style={{ color: secondaryColor }}>
                      ({formatSeconds(elapsed)})
                    </span>
                  )}
                  {rawLap != null && (
                    <span className="text-xs italic ml-2" style={{ color: secondaryColor }}>
                      lap: {formatSeconds(rawLap)}
                    </span>
                  )}
                </>
              ) : isPositionModeTooltip ? (
                <>
                  <span className="text-sm font-medium" style={{ color: primaryColor }}>
                    P{Math.round(entry.value)}
                  </span>
                  {elapsed != null && (
                    <span className="text-xs italic ml-2" style={{ color: secondaryColor }}>
                      ({formatSeconds(elapsed)})
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-sm font-medium" style={{ color: primaryColor }}>
                    {formatSeconds(entry.value)}
                  </span>
                  {elapsed != null && (
                    <span className="text-xs italic ml-2" style={{ color: secondaryColor }}>
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

const Y_ZOOM_LEVELS = [
  { height: 240, paddingFactor: 0.5 },   // 0: zoomed out
  { height: 240, paddingFactor: 0.1 },   // 1: default
  { height: 320, paddingFactor: 0.025 }, // 2: in
  { height: 420, paddingFactor: 0.005 }, // 3: max
];

export default function SplitChart({ athletes }: SplitChartProps) {
  const [mode, setMode] = useState<ChartMode>("virtual");
  const [yZoom, setYZoom] = useState(1);
  const [overlayA, setOverlayA] = useState(false);
  const [overlayB, setOverlayB] = useState(false);
  const [overlayC, setOverlayC] = useState(false);
  const [fieldAthletes, setFieldAthletes] = useState<AthleteResult[]>([]);
  const [fieldLoading, setFieldLoading] = useState(false);
  const theme = useThemeStore((s) => s.theme);
  const gridColor = theme === "dark" ? "#333" : "#e4e4e7";
  const axisColor = theme === "dark" ? "#999" : "#71717a";
  const refLineColor = theme === "dark" ? "#666" : "#a1a1aa";

  const firstEventId = athletes[0]?.athleteResult.event.id ?? null;

  useEffect(() => {
    if (!firstEventId || (!overlayB && !overlayC)) {
      setFieldAthletes([]);
      return;
    }
    let cancelled = false;
    setFieldLoading(true);
    getEventResults(firstEventId)
      .then((results) => { if (!cancelled) setFieldAthletes(results); })
      .catch(console.error)
      .finally(() => { if (!cancelled) setFieldLoading(false); });
    return () => { cancelled = true; };
  }, [firstEventId, overlayB, overlayC]);

  const visibleAthletes = athletes.filter((a) => a.visible);
  const data = buildChartData(athletes);

  if (data.length === 0 || visibleAthletes.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-400 dark:text-zinc-500 text-sm">
        Add athletes to see split data
      </div>
    );
  }

  const baseChartData =
    mode === "virtual"
      ? buildVirtualGapData(athletes)
      : mode === "position"
        ? buildPositionData(athletes)
        : mode === "time_gain_loss"
          ? buildTimeGainLossData(athletes)
          : data;

  // Inject field_avg per split into chartData for overlay C (raw mode only)
  const activeDistances = collectDistances(athletes);
  const fieldAvgMap =
    mode === "raw" && overlayC && fieldAthletes.length > 0 && activeDistances.length > 0
      ? computeFieldAvgPerSplit(fieldAthletes, activeDistances)
      : {};
  const displayChartData: ChartPoint[] =
    mode === "raw" && overlayC && Object.keys(fieldAvgMap).length > 0
      ? baseChartData.map((point) => ({
          ...point,
          ...(fieldAvgMap[point.label] != null ? { field_avg: fieldAvgMap[point.label] } : {}),
        })) as ChartPoint[]
      : baseChartData;

  const elapsedLookup = buildElapsedLookup(athletes);
  const rawLapLookup = buildRawLapLookup(athletes);
  const athleteNames: Record<string, string> = {};
  for (const a of athletes) {
    athleteNames[a.athleteResult.athlete.id] = a.athleteResult.athlete.name;
  }

  const zoomLevel = Y_ZOOM_LEVELS[yZoom];

  // Y domain: include athlete data + all active overlay values
  const mainValues = displayChartData
    .flatMap((d) => visibleAthletes.map((a) => d[a.athleteResult.athlete.id]))
    .filter((v): v is number => typeof v === "number");
  const overlayValues: number[] = [];
  if (mode === "raw") {
    if (overlayA) {
      for (const a of visibleAthletes) {
        const avg = computeAthleteAvgLap(a);
        if (avg != null) overlayValues.push(avg);
      }
    }
    if (overlayB && fieldAthletes.length > 0) {
      const avg = computeFieldOverallAvg(fieldAthletes);
      if (avg != null) overlayValues.push(avg);
    }
    if (overlayC) {
      overlayValues.push(...Object.values(fieldAvgMap));
    }
  }
  const allValues = [...mainValues, ...overlayValues];
  const yMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const yMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  const padding = (yMax - yMin) * zoomLevel.paddingFactor || 0.5;

  const xInterval = displayChartData.length > 12 ? Math.floor(displayChartData.length / 8) : 0;
  const isGapMode = mode === "virtual" || mode === "time_gain_loss";
  const isPositionMode = mode === "position";

  const fieldOverallAvg = overlayB && fieldAthletes.length > 0
    ? computeFieldOverallAvg(fieldAthletes)
    : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span>Y</span>
          <button
            className="w-6 h-6 flex items-center justify-center rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={() => setYZoom((z) => Math.min(z + 1, Y_ZOOM_LEVELS.length - 1))}
            disabled={yZoom === Y_ZOOM_LEVELS.length - 1}
            title="Zoom in Y axis"
          >+</button>
          <button
            className="w-6 h-6 flex items-center justify-center rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={() => setYZoom((z) => Math.max(z - 1, 0))}
            disabled={yZoom === 0}
            title="Zoom out Y axis"
          >−</button>
        </div>
        <div className="flex items-center gap-2">
          <ChartFaqModal />
          <div className="flex rounded overflow-hidden border border-zinc-300 dark:border-zinc-700 text-xs">
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
                    ? "bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white"
                    : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
                }`}
                onClick={() => setMode(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Overlay toggles — Lap Pace mode only */}
      {mode === "raw" && (
        <div className="flex items-center justify-end gap-2 px-2">
          <span className="text-xs text-zinc-400 dark:text-zinc-600">Overlays:</span>
          {(
            [
              ["A", "Athlete avg", overlayA, () => setOverlayA((v) => !v)],
              ["B", "Field avg", overlayB, () => setOverlayB((v) => !v)],
              ["C", "Field/split", overlayC, () => setOverlayC((v) => !v)],
            ] as [string, string, boolean, () => void][]
          ).map(([key, label, active, toggle]) => (
            <button
              key={key}
              onClick={toggle}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                active
                  ? "border-zinc-400 dark:border-zinc-500 bg-zinc-200 dark:bg-zinc-700 text-zinc-900 dark:text-white"
                  : "border-zinc-300 dark:border-zinc-700 text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              {label}
            </button>
          ))}
          {fieldLoading && (
            <span className="text-xs text-zinc-400 dark:text-zinc-600 italic">loading...</span>
          )}
        </div>
      )}

      <div className="w-full">
        {mode === "time_gain_loss" && visibleAthletes.length < 2 ? (
          <div className="flex items-center justify-center h-48 text-zinc-400 dark:text-zinc-500 text-sm">
            Time Gain/Loss requires at least 2 athletes
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={zoomLevel.height}>
            <LineChart
              data={displayChartData}
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={gridColor} />
              <XAxis
                dataKey="label"
                tick={{ fill: axisColor, fontSize: 12 }}
                interval={xInterval}
              />
              <YAxis
                tick={{ fill: axisColor, fontSize: 12 }}
                tickFormatter={
                  isGapMode
                    ? (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}s`
                    : isPositionMode
                      ? (v: number) => String(Math.round(v))
                      : (v: number) => formatSeconds(v)
                }
                domain={
                  isPositionMode
                    ? [0.5, visibleAthletes.length + 0.5]
                    : [yMin - padding, yMax + padding]
                }
                reversed={isPositionMode}
              />
              {isGapMode && (
                <ReferenceLine y={0} stroke={refLineColor} strokeDasharray="4 4" />
              )}
              <Tooltip
                content={
                  <CustomTooltip
                    elapsedLookup={elapsedLookup}
                    athleteNames={athleteNames}
                    mode={mode}
                    rawLapLookup={rawLapLookup}
                    theme={theme}
                  />
                }
              />
              {visibleAthletes.map((a) => (
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
              {/* Overlay C: field avg lap pace per split (non-flat line) */}
              {mode === "raw" && overlayC && fieldAthletes.length > 0 && (
                <Line
                  dataKey="field_avg"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  strokeOpacity={0.75}
                  dot={false}
                  connectNulls
                />
              )}
              {/* Overlay A: per-athlete avg lap pace (dotted flat reference line) */}
              {mode === "raw" && overlayA &&
                visibleAthletes.map((a) => {
                  const avg = computeAthleteAvgLap(a);
                  if (avg == null) return null;
                  return (
                    <ReferenceLine
                      key={`overlay-a-${a.athleteResult.athlete.id}`}
                      y={avg}
                      stroke={a.color}
                      strokeDasharray="5 3"
                      strokeWidth={1.5}
                      strokeOpacity={0.8}
                    />
                  );
                })}
              {/* Overlay B: full field overall avg lap pace (flat reference line, gray) */}
              {mode === "raw" && overlayB && fieldOverallAvg != null && (
                <ReferenceLine
                  y={fieldOverallAvg}
                  stroke="#9ca3af"
                  strokeWidth={2}
                  strokeOpacity={0.7}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

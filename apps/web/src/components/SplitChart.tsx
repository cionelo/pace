import { useState } from "react";
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
import type { WindowAthleteData } from "../types/pace";
import ChartFaqModal from "./ChartFaqModal";

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

  // Compute average finish time and max distance for even-pace reference
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

    // Pass 1: derive lap for each athlete (exact lap_s or interpolated elapsed diff)
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

    // Pass 2: field average then delta per athlete
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

function CustomTooltip({
  active,
  payload,
  label,
  elapsedLookup,
  athleteNames,
  mode,
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
        const isGapModeTooltip = mode === "virtual" || mode === "time_gain_loss";
        const isPositionModeTooltip = mode === "position";
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
              {isGapModeTooltip ? (
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
              ) : isPositionModeTooltip ? (
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

  const visibleAthletes = athletes.filter((a) => a.visible);
  const data = buildChartData(athletes);

  if (data.length === 0 || visibleAthletes.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
        Add athletes to see split data
      </div>
    );
  }

  const chartData =
    mode === "virtual"
      ? buildVirtualGapData(athletes)
      : mode === "position"
        ? buildPositionData(athletes)
        : mode === "time_gain_loss"
          ? buildTimeGainLossData(athletes)
          : data; // "raw" uses buildChartData result already in `data`
  const elapsedLookup = buildElapsedLookup(athletes);
  const rawLapLookup = buildRawLapLookup(athletes);
  const athleteNames: Record<string, string> = {};
  for (const a of athletes) {
    athleteNames[a.athleteResult.athlete.id] = a.athleteResult.athlete.name;
  }

  const zoomLevel = Y_ZOOM_LEVELS[yZoom];

  const allValues = chartData
    .flatMap((d) =>
      visibleAthletes.map((a) => d[a.athleteResult.athlete.id])
    )
    .filter((v): v is number => typeof v === "number");
  const yMin = allValues.length > 0 ? Math.min(...allValues) : 0;
  const yMax = allValues.length > 0 ? Math.max(...allValues) : 1;
  const padding = (yMax - yMin) * zoomLevel.paddingFactor || 0.5;

  const xInterval = chartData.length > 12 ? Math.floor(chartData.length / 8) : 0;
  const isGapMode = mode === "virtual" || mode === "time_gain_loss";
  const isPositionMode = mode === "position";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-1 text-xs text-zinc-400">
          <span>Y</span>
          <button
            className="w-6 h-6 flex items-center justify-center rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={() => setYZoom((z) => Math.min(z + 1, Y_ZOOM_LEVELS.length - 1))}
            disabled={yZoom === Y_ZOOM_LEVELS.length - 1}
            title="Zoom in Y axis"
          >+</button>
          <button
            className="w-6 h-6 flex items-center justify-center rounded border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 disabled:opacity-30 disabled:cursor-not-allowed"
            onClick={() => setYZoom((z) => Math.max(z - 1, 0))}
            disabled={yZoom === 0}
            title="Zoom out Y axis"
          >−</button>
        </div>
        <div className="flex items-center gap-2">
          <ChartFaqModal />
          <div className="flex rounded overflow-hidden border border-zinc-700 text-xs">
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
          </div>
        </div>
      </div>

      <div className="w-full">
        {mode === "time_gain_loss" && visibleAthletes.length < 2 ? (
          <div className="flex items-center justify-center h-48 text-zinc-500 text-sm">
            Time Gain/Loss requires at least 2 athletes
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={zoomLevel.height}>
            <LineChart
              data={chartData}
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="label"
                tick={{ fill: "#999", fontSize: 12 }}
                interval={xInterval}
              />
              <YAxis
                tick={{ fill: "#999", fontSize: 12 }}
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
                <ReferenceLine y={0} stroke="#666" strokeDasharray="4 4" />
              )}
              <Tooltip
                content={
                  <CustomTooltip
                    elapsedLookup={elapsedLookup}
                    athleteNames={athleteNames}
                    mode={mode}
                    rawLapLookup={rawLapLookup}
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
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

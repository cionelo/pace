import type { Split } from "../types/pace";

let counter = 0;

export interface SplitPoint {
  /** Cumulative distance from the start (m) */
  cumulative: number;
  /** Distance covered in this lap (m) — <400 for remainder laps */
  lapDistance: number;
}

/**
 * Compute split points for a race at 400m intervals.
 * The final point covers whatever distance remains (may be <400m).
 */
export function computeSplitPoints(distanceM: number): SplitPoint[] {
  const points: SplitPoint[] = [];
  let current = 0;
  while (current < distanceM) {
    const lapDist = Math.min(400, distanceM - current);
    current += lapDist;
    points.push({ cumulative: current, lapDistance: lapDist });
  }
  return points;
}

/** Generate a unique custom athlete ID */
export function genCustomId(): string {
  return `custom_${++counter}_${Date.now()}`;
}

/**
 * Parse time strings like "4:00.00", "16:52.10", or "60.00" to seconds.
 * Returns null for invalid input.
 */
export function timeStringToSeconds(str: string): number | null {
  const trimmed = str.trim();
  if (trimmed === "") return null;

  // mm:ss.ss or m:ss.ss
  const colonMatch = trimmed.match(/^(\d+):(\d{1,2}(?:\.\d+)?)$/);
  if (colonMatch) {
    const minutes = parseInt(colonMatch[1], 10);
    const seconds = parseFloat(colonMatch[2]);
    if (isNaN(minutes) || isNaN(seconds) || seconds >= 60) return null;
    return minutes * 60 + seconds;
  }

  // ss.ss (seconds only)
  const secMatch = trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (secMatch) {
    const seconds = parseFloat(secMatch[1]);
    if (isNaN(seconds)) return null;
    return seconds;
  }

  return null;
}

function buildSplit(index: number, lapTime: number, cumulativeElapsed: number): Split {
  return {
    id: `gen_${index}`,
    result_id: "",
    label: `S${index + 1}`,
    ordinal: index,
    distance_m: null,
    elapsed_s: cumulativeElapsed,
    lap_s: lapTime,
    place: null,
  };
}

/** Generate N even splits totaling totalSeconds */
export function generateEvenSplits(totalSeconds: number, numSplits: number): Split[] {
  const lapTime = totalSeconds / numSplits;
  const splits: Split[] = [];

  for (let i = 0; i < numSplits; i++) {
    const isLast = i === numSplits - 1;
    const elapsed = isLast ? totalSeconds : lapTime * (i + 1);
    splits.push(buildSplit(i, lapTime, elapsed));
  }

  return splits;
}

/**
 * Generate splits where the second half is pctFaster% faster.
 *
 * "Half" = first Math.floor(numSplits / 2) splits.
 * First half uses slowLap, second half uses fastLap.
 * fastLap = slowLap * (1 - factor)
 * slowLap * half + fastLap * (total - half) = totalSeconds
 */
export function generateNegativeSplits(
  totalSeconds: number,
  numSplits: number,
  pctFaster: number,
): Split[] {
  const half = Math.floor(numSplits / 2);
  const rest = numSplits - half;
  const factor = pctFaster / 100;

  // slowLap * half + slowLap * (1 - factor) * rest = totalSeconds
  // slowLap * (half + (1 - factor) * rest) = totalSeconds
  const slowLap = totalSeconds / (half + (1 - factor) * rest);
  const fastLap = slowLap * (1 - factor);

  const splits: Split[] = [];
  let cumulative = 0;

  for (let i = 0; i < numSplits; i++) {
    const lap = i < half ? slowLap : fastLap;
    cumulative += lap;
    const isLast = i === numSplits - 1;
    const elapsed = isLast ? totalSeconds : cumulative;
    splits.push(buildSplit(i, lap, elapsed));
  }

  return splits;
}

/**
 * Generate splits where the second half is pctSlower% slower.
 *
 * "Half" = first Math.floor(numSplits / 2) splits.
 * First half uses fastLap, second half uses slowLap.
 * slowLap = fastLap * (1 + factor)
 * fastLap * half + slowLap * (total - half) = totalSeconds
 */
export function generatePositiveSplits(
  totalSeconds: number,
  numSplits: number,
  pctSlower: number,
): Split[] {
  const half = Math.floor(numSplits / 2);
  const rest = numSplits - half;
  const factor = pctSlower / 100;

  // fastLap * half + fastLap * (1 + factor) * rest = totalSeconds
  // fastLap * (half + (1 + factor) * rest) = totalSeconds
  const fastLap = totalSeconds / (half + (1 + factor) * rest);
  const slowLap = fastLap * (1 + factor);

  const splits: Split[] = [];
  let cumulative = 0;

  for (let i = 0; i < numSplits; i++) {
    const lap = i < half ? fastLap : slowLap;
    cumulative += lap;
    const isLast = i === numSplits - 1;
    const elapsed = isLast ? totalSeconds : cumulative;
    splits.push(buildSplit(i, lap, elapsed));
  }

  return splits;
}

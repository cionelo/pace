import { useState, useCallback, useEffect } from "react";
import type { AthleteResult, Split } from "../types/pace";
import {
  genCustomId,
  generateEvenSplits,
  generateNegativeSplits,
  generatePositiveSplits,
  timeStringToSeconds,
  computeSplitPoints,
  type SplitPoint,
} from "../stores/custom-athlete-store";

type Tab = "coach" | "generator";
type Strategy = "even" | "negative" | "positive";

interface CustomAthleteModalProps {
  onAdd: (athleteResult: AthleteResult) => void;
  onClose: () => void;
}

function formatSecondsToStr(s: number): string {
  const min = Math.floor(s / 60);
  const sec = s % 60;
  if (min === 0) return sec.toFixed(2);
  return `${min}:${sec.toFixed(2).padStart(5, "0")}`;
}

function buildAthleteResult(name: string, splits: Split[], timeSeconds: number): AthleteResult {
  const id = genCustomId();
  return {
    athlete: { id, name, team_id: null },
    team: null,
    result: {
      id: `result_${id}`,
      event_id: `event_${id}`,
      athlete_id: id,
      place: null,
      time_s: timeSeconds,
      time_str: formatSecondsToStr(timeSeconds),
      points: null,
    },
    event: {
      id: `event_${id}`,
      source_id: "",
      name: "Custom",
      date: null,
      location: null,
      gender: "Men",
      distance: "",
      season: null,
      division: null,
      conference_id: null,
      provider: null,
      source_url: null,
    },
    splits,
  };
}

const inputClass =
  "w-full bg-pace-input border border-pace-border text-pace-text text-sm rounded-xl px-4 py-2.5 placeholder-pace-text-muted focus:border-pace-accent focus:outline-none focus:ring-2 focus:ring-pace-accent/10 transition-all duration-300";
const smallInputClass =
  "bg-pace-input border border-pace-border text-pace-text text-xs rounded-lg px-3 py-2 focus:border-pace-accent focus:outline-none focus:ring-2 focus:ring-pace-accent/10 transition-all duration-300";

// ─── Common race distances ────────────────────────────────────────────────────

const PRESET_DISTANCES = [
  { label: "800m", value: 800 },
  { label: "1500m", value: 1500 },
  { label: "Mile", value: 1609 },
  { label: "3000m", value: 3000 },
  { label: "5000m", value: 5000 },
  { label: "10K", value: 10000 },
];

function splitLabel(sp: SplitPoint): string {
  return `${sp.cumulative}m`;
}

// ─── Coach Splits Tab ─────────────────────────────────────────────────────────

function CoachSplitsTab({ onAdd, onClose }: Pick<CustomAthleteModalProps, "onAdd" | "onClose">) {
  const [name, setName] = useState("");
  const [selectedDist, setSelectedDist] = useState<number | null>(1500);
  const [customDistStr, setCustomDistStr] = useState("");
  const [lapStrs, setLapStrs] = useState<string[]>([]);
  const [error, setError] = useState("");

  const effectiveDist =
    selectedDist !== null ? selectedDist : parseInt(customDistStr, 10) || null;

  const splitPoints: SplitPoint[] =
    effectiveDist && effectiveDist > 0 ? computeSplitPoints(effectiveDist) : [];

  // Reset lap inputs whenever the distance changes
  useEffect(() => {
    setLapStrs(Array(splitPoints.length).fill(""));
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveDist]);

  function updateLap(i: number, val: string) {
    setLapStrs((prev) => prev.map((s, idx) => (idx === i ? val : s)));
  }

  // Compute running elapsed from lap inputs
  const parsedLaps = lapStrs.map((s) => timeStringToSeconds(s));
  const elapsedSecs: (number | null)[] = [];
  let running: number | null = 0;
  for (const lap of parsedLaps) {
    if (running !== null && lap !== null && lap > 0) {
      running += lap;
      elapsedSecs.push(running);
    } else {
      running = null;
      elapsedSecs.push(null);
    }
  }

  const totalTime = elapsedSecs[elapsedSecs.length - 1] ?? null;
  const allFilled = splitPoints.length > 0 && parsedLaps.every((l) => l !== null && l > 0);

  function handleAdd() {
    setError("");
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!effectiveDist || effectiveDist <= 0) {
      setError("Select a race distance");
      return;
    }

    const validLaps: number[] = [];
    for (let i = 0; i < splitPoints.length; i++) {
      const t = timeStringToSeconds(lapStrs[i] ?? "");
      if (t === null || t <= 0) {
        setError(`Enter a valid lap time for ${splitPoints[i].cumulative}m`);
        return;
      }
      validLaps.push(t);
    }

    const totalSeconds = validLaps.reduce((a, b) => a + b, 0);
    let cumulative = 0;
    const splits: Split[] = validLaps.map((lap, i) => {
      cumulative += lap;
      const sp = splitPoints[i];
      const isLast = i === validLaps.length - 1;
      return {
        id: `gen_${i}`,
        result_id: "",
        label: splitLabel(sp),
        ordinal: i,
        distance_m: sp.cumulative,
        elapsed_s: isLast ? totalSeconds : cumulative,
        lap_s: lap,
        place: null,
      };
    });

    onAdd(buildAthleteResult(name.trim(), splits, totalSeconds));
    onClose();
  }

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-pace-text-secondary mb-1.5">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Race Plan A"
          className={inputClass}
        />
      </div>

      {/* Distance selector */}
      <div>
        <label className="block text-xs font-medium text-pace-text-secondary mb-2">
          Race distance
        </label>
        <div className="flex flex-wrap gap-1.5 mb-2">
          {PRESET_DISTANCES.map((d) => (
            <button
              key={d.value}
              onClick={() => {
                setSelectedDist(d.value);
                setCustomDistStr("");
              }}
              className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all duration-200 ${
                selectedDist === d.value
                  ? "border-pace-accent text-pace-accent bg-pace-accent/10"
                  : "border-pace-border text-pace-text-muted hover:text-pace-text hover:border-pace-text-muted"
              }`}
            >
              {d.label}
            </button>
          ))}
          <button
            onClick={() => setSelectedDist(null)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-all duration-200 ${
              selectedDist === null
                ? "border-pace-accent text-pace-accent bg-pace-accent/10"
                : "border-pace-border text-pace-text-muted hover:text-pace-text hover:border-pace-text-muted"
            }`}
          >
            Custom
          </button>
        </div>
        {selectedDist === null && (
          <input
            type="number"
            min={100}
            max={100000}
            value={customDistStr}
            onChange={(e) => setCustomDistStr(e.target.value)}
            placeholder="Distance in meters (e.g. 2000)"
            className={inputClass}
          />
        )}
      </div>

      {/* Split rows */}
      {splitPoints.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-pace-text-secondary mb-1.5">
            Lap times — enter the split-to-split time for each point
          </label>
          <div className="bg-pace-card-inner border border-pace-border rounded-xl overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-[5rem_1fr_5rem] text-xs border-b border-pace-border">
              <span className="px-3 py-2 text-pace-text-muted font-medium">Point</span>
              <span className="px-3 py-2 text-pace-text-muted font-medium">Lap time</span>
              <span className="px-3 py-2 text-pace-text-muted font-medium text-right">Elapsed</span>
            </div>

            {/* Rows — scrollable for long races */}
            <div className="max-h-64 overflow-y-auto">
              {splitPoints.map((sp, i) => {
                const isRemainder = sp.lapDistance < 400;
                const elapsed = elapsedSecs[i] ?? null;
                return (
                  <div
                    key={sp.cumulative}
                    className="grid grid-cols-[5rem_1fr_5rem] items-center border-b border-pace-border-subtle last:border-0"
                  >
                    {/* Point label */}
                    <div className="px-3 py-2">
                      <span className="text-xs font-medium text-pace-text font-mono">
                        {sp.cumulative}m
                      </span>
                      {isRemainder && (
                        <span className="block text-[10px] text-pace-text-muted leading-tight">
                          {sp.lapDistance}m lap
                        </span>
                      )}
                    </div>

                    {/* Lap input */}
                    <div className="px-2 py-1.5">
                      <input
                        type="text"
                        value={lapStrs[i] ?? ""}
                        onChange={(e) => updateLap(i, e.target.value)}
                        placeholder="0:00.00"
                        className={`w-full ${smallInputClass}`}
                      />
                    </div>

                    {/* Elapsed */}
                    <div className="px-3 py-2 text-right">
                      <span
                        className={`text-xs font-mono ${
                          elapsed !== null ? "text-pace-text" : "text-pace-text-muted"
                        }`}
                      >
                        {elapsed !== null ? formatSecondsToStr(elapsed) : "—"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Total row */}
            {allFilled && totalTime !== null && (
              <div className="flex justify-between items-center px-3 py-2 border-t border-pace-border bg-pace-card">
                <span className="text-xs font-medium text-pace-text-secondary">Total</span>
                <span className="text-xs font-mono font-semibold text-pace-accent">
                  {formatSecondsToStr(totalTime)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        onClick={handleAdd}
        disabled={!effectiveDist || splitPoints.length === 0}
        className="w-full bg-pace-accent hover:bg-pace-accent-hover text-white text-sm font-medium rounded-full px-4 py-2.5 transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Add to Window
      </button>
    </div>
  );
}

// ─── Pace Line Tab (unchanged) ────────────────────────────────────────────────

function PaceLineTab({ onAdd, onClose }: Pick<CustomAthleteModalProps, "onAdd" | "onClose">) {
  const [targetTimeStr, setTargetTimeStr] = useState("");
  const [numSplits, setNumSplits] = useState(4);
  const [strategy, setStrategy] = useState<Strategy>("even");
  const [pct, setPct] = useState(5);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<Split[]>([]);

  const generatePreview = useCallback(() => {
    const totalSeconds = timeStringToSeconds(targetTimeStr);
    if (totalSeconds === null || totalSeconds <= 0 || numSplits < 1) {
      setPreview([]);
      return;
    }
    let splits: Split[];
    switch (strategy) {
      case "negative":
        splits = generateNegativeSplits(totalSeconds, numSplits, pct);
        break;
      case "positive":
        splits = generatePositiveSplits(totalSeconds, numSplits, pct);
        break;
      default:
        splits = generateEvenSplits(totalSeconds, numSplits);
    }
    setPreview(splits);
  }, [targetTimeStr, numSplits, strategy, pct]);

  useEffect(() => {
    generatePreview();
  }, [generatePreview]);

  function handleAdd() {
    setError("");
    const totalSeconds = timeStringToSeconds(targetTimeStr);
    if (totalSeconds === null || totalSeconds <= 0) {
      setError("Enter a valid target time");
      return;
    }
    if (numSplits < 1) {
      setError("Need at least 1 split");
      return;
    }
    if (preview.length === 0) {
      setError("No splits generated");
      return;
    }
    const strategyLabel =
      strategy === "even" ? "Even" : strategy === "negative" ? `Neg ${pct}%` : `Pos ${pct}%`;
    const name = `${targetTimeStr} ${strategyLabel}`;
    onAdd(buildAthleteResult(name, preview, totalSeconds));
    onClose();
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-pace-text-secondary mb-1.5">
          Target time (mm:ss.ss)
        </label>
        <input
          type="text"
          value={targetTimeStr}
          onChange={(e) => setTargetTimeStr(e.target.value)}
          placeholder="4:00.00"
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-pace-text-secondary mb-1.5">
          Number of splits
        </label>
        <input
          type="number"
          min={1}
          max={50}
          value={numSplits}
          onChange={(e) => setNumSplits(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className={inputClass}
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-pace-text-secondary mb-1.5">
          Strategy
        </label>
        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as Strategy)}
          className={inputClass}
        >
          <option value="even">Even</option>
          <option value="negative">Negative Split</option>
          <option value="positive">Positive Split</option>
        </select>
      </div>

      {strategy !== "even" && (
        <div>
          <label className="block text-xs font-medium text-pace-text-secondary mb-1.5">
            {strategy === "negative" ? "% faster (2nd half)" : "% slower (2nd half)"}
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={pct}
            onChange={(e) => setPct(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className={inputClass}
          />
        </div>
      )}

      {preview.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-pace-text-secondary mb-1.5">
            Preview
          </label>
          <div className="bg-pace-card-inner border border-pace-border rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-pace-border">
                  <th className="text-left px-3 py-2 text-pace-text-muted font-medium">Split</th>
                  <th className="text-right px-3 py-2 text-pace-text-muted font-medium">Lap</th>
                  <th className="text-right px-3 py-2 text-pace-text-muted font-medium">Elapsed</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((s) => (
                  <tr key={s.id} className="border-b border-pace-border-subtle last:border-0">
                    <td className="px-3 py-2 text-pace-text">{s.label}</td>
                    <td className="text-right px-3 py-2 text-pace-text font-mono">
                      {s.lap_s != null ? formatSecondsToStr(s.lap_s) : "-"}
                    </td>
                    <td className="text-right px-3 py-2 text-pace-text font-mono">
                      {s.elapsed_s != null ? formatSecondsToStr(s.elapsed_s) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}

      <button
        onClick={handleAdd}
        className="w-full bg-pace-accent hover:bg-pace-accent-hover text-white text-sm font-medium rounded-full px-4 py-2.5 transition-all duration-300"
      >
        Add to Window
      </button>
    </div>
  );
}

// ─── Modal shell ──────────────────────────────────────────────────────────────

export default function CustomAthleteModal({ onAdd, onClose }: CustomAthleteModalProps) {
  const [tab, setTab] = useState<Tab>("coach");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-pace-card border border-pace-border rounded-2xl shadow-pace-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-pace-border">
          <h2 className="font-display text-lg text-pace-text">Custom Athlete</h2>
          <button
            onClick={onClose}
            className="text-pace-text-muted hover:text-pace-text text-xl leading-none transition-colors duration-300"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-pace-border">
          {(
            [
              ["coach", "Custom Splits"],
              ["generator", "Pace Line"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 px-4 py-3 text-sm font-medium transition-all duration-300 ${
                tab === key
                  ? "text-pace-accent border-b-2 border-pace-accent"
                  : "text-pace-text-muted hover:text-pace-text"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-5">
          {tab === "coach" ? (
            <CoachSplitsTab onAdd={onAdd} onClose={onClose} />
          ) : (
            <PaceLineTab onAdd={onAdd} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

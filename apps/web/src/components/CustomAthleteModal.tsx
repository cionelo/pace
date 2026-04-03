import { useState, useCallback, useEffect } from "react";
import type { AthleteResult, Split } from "../types/pace";
import {
  genCustomId,
  generateEvenSplits,
  generateNegativeSplits,
  generatePositiveSplits,
  timeStringToSeconds,
} from "../stores/custom-athlete-store";

type Tab = "manual" | "generator";
type Strategy = "even" | "negative" | "positive";

interface ManualRow {
  label: string;
  elapsedStr: string;
}

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
    athlete: {
      id,
      name,
      team_id: null,
    },
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

function ManualSplitsTab({ onAdd, onClose }: Pick<CustomAthleteModalProps, "onAdd" | "onClose">) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<ManualRow[]>([
    { label: "S1", elapsedStr: "" },
    { label: "S2", elapsedStr: "" },
    { label: "S3", elapsedStr: "" },
    { label: "S4", elapsedStr: "" },
  ]);
  const [error, setError] = useState("");

  function addRow() {
    setRows((prev) => [
      ...prev,
      { label: `S${prev.length + 1}`, elapsedStr: "" },
    ]);
  }

  function removeRow() {
    if (rows.length <= 1) return;
    setRows((prev) => prev.slice(0, -1));
  }

  function updateRow(index: number, field: keyof ManualRow, value: string) {
    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, [field]: value } : r))
    );
  }

  function handleAdd() {
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const splits: Split[] = [];
    let prevElapsed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const elapsed = timeStringToSeconds(row.elapsedStr);
      if (elapsed === null) {
        setError(`Invalid time in row ${i + 1}: "${row.elapsedStr}"`);
        return;
      }
      if (elapsed <= prevElapsed) {
        setError(`Row ${i + 1} elapsed must be greater than row ${i}`);
        return;
      }
      const lap = elapsed - prevElapsed;
      splits.push({
        id: `gen_${i}`,
        result_id: "",
        label: row.label || `S${i + 1}`,
        ordinal: i,
        distance_m: null,
        elapsed_s: elapsed,
        lap_s: lap,
        place: null,
      });
      prevElapsed = elapsed;
    }

    const totalSeconds = splits[splits.length - 1].elapsed_s!;
    const ar = buildAthleteResult(name.trim(), splits, totalSeconds);
    onAdd(ar);
    onClose();
  }

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My Athlete"
          className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 text-sm rounded-md px-3 py-2 placeholder-zinc-400 dark:placeholder-zinc-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Split rows */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400">
          Splits (elapsed time, mm:ss.ss)
        </label>
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={row.label}
              onChange={(e) => updateRow(i, "label", e.target.value)}
              className="w-16 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 text-xs rounded px-2 py-1.5 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
            <input
              type="text"
              value={row.elapsedStr}
              onChange={(e) => updateRow(i, "elapsedStr", e.target.value)}
              placeholder="0:00.00"
              className="flex-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 text-sm rounded px-2 py-1.5 placeholder-zinc-400 dark:placeholder-zinc-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
        ))}
        <div className="flex gap-2">
          <button
            onClick={addRow}
            className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors"
          >
            + Add row
          </button>
          <button
            onClick={removeRow}
            disabled={rows.length <= 1}
            className="text-xs px-2 py-1 rounded border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            - Remove row
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      )}

      <button
        onClick={handleAdd}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md px-4 py-2 transition-colors"
      >
        Add to Window
      </button>
    </div>
  );
}

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
      strategy === "even"
        ? "Even"
        : strategy === "negative"
          ? `Neg ${pct}%`
          : `Pos ${pct}%`;
    const name = `${targetTimeStr} ${strategyLabel}`;
    const ar = buildAthleteResult(name, preview, totalSeconds);
    onAdd(ar);
    onClose();
  }

  return (
    <div className="space-y-4">
      {/* Target time */}
      <div>
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
          Target time (mm:ss.ss)
        </label>
        <input
          type="text"
          value={targetTimeStr}
          onChange={(e) => setTargetTimeStr(e.target.value)}
          placeholder="4:00.00"
          className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 text-sm rounded-md px-3 py-2 placeholder-zinc-400 dark:placeholder-zinc-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Number of splits */}
      <div>
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
          Number of splits
        </label>
        <input
          type="number"
          min={1}
          max={50}
          value={numSplits}
          onChange={(e) => setNumSplits(Math.max(1, parseInt(e.target.value, 10) || 1))}
          className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 text-sm rounded-md px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
      </div>

      {/* Strategy */}
      <div>
        <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
          Strategy
        </label>
        <select
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as Strategy)}
          className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 text-sm rounded-md px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        >
          <option value="even">Even</option>
          <option value="negative">Negative Split</option>
          <option value="positive">Positive Split</option>
        </select>
      </div>

      {/* Percentage (only for negative/positive) */}
      {strategy !== "even" && (
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            {strategy === "negative" ? "% faster (2nd half)" : "% slower (2nd half)"}
          </label>
          <input
            type="number"
            min={1}
            max={50}
            value={pct}
            onChange={(e) => setPct(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 text-sm rounded-md px-3 py-2 focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
        </div>
      )}

      {/* Preview */}
      {preview.length > 0 && (
        <div>
          <label className="block text-xs font-medium text-zinc-600 dark:text-zinc-400 mb-1">
            Preview
          </label>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-zinc-200 dark:border-zinc-700">
                  <th className="text-left px-2 py-1 text-zinc-500 dark:text-zinc-400 font-medium">Split</th>
                  <th className="text-right px-2 py-1 text-zinc-500 dark:text-zinc-400 font-medium">Lap</th>
                  <th className="text-right px-2 py-1 text-zinc-500 dark:text-zinc-400 font-medium">Elapsed</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((s) => (
                  <tr key={s.id} className="border-b border-zinc-100 dark:border-zinc-700/50 last:border-0">
                    <td className="px-2 py-1 text-zinc-700 dark:text-zinc-300">{s.label}</td>
                    <td className="text-right px-2 py-1 text-zinc-700 dark:text-zinc-300">
                      {s.lap_s != null ? formatSecondsToStr(s.lap_s) : "-"}
                    </td>
                    <td className="text-right px-2 py-1 text-zinc-700 dark:text-zinc-300">
                      {s.elapsed_s != null ? formatSecondsToStr(s.elapsed_s) : "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">{error}</p>
      )}

      <button
        onClick={handleAdd}
        className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-md px-4 py-2 transition-colors"
      >
        Add to Window
      </button>
    </div>
  );
}

export default function CustomAthleteModal({ onAdd, onClose }: CustomAthleteModalProps) {
  const [tab, setTab] = useState<Tab>("generator");

  // Close on Escape
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
      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            Custom Athlete
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 dark:text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200 text-lg leading-none"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-zinc-200 dark:border-zinc-800">
          {(
            [
              ["generator", "Pace Line"],
              ["manual", "Manual Splits"],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                tab === key
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-4">
          {tab === "manual" ? (
            <ManualSplitsTab onAdd={onAdd} onClose={onClose} />
          ) : (
            <PaceLineTab onAdd={onAdd} onClose={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

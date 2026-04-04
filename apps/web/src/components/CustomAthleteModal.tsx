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

const inputClass = "w-full bg-pace-input border border-pace-border text-pace-text text-sm rounded-xl px-4 py-2.5 placeholder-pace-text-muted focus:border-pace-accent focus:outline-none focus:ring-2 focus:ring-pace-accent/10 transition-all duration-300";
const smallInputClass = "bg-pace-input border border-pace-border text-pace-text text-xs rounded-lg px-3 py-2 focus:border-pace-accent focus:outline-none focus:ring-2 focus:ring-pace-accent/10 transition-all duration-300";

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
      <div>
        <label className="block text-xs font-medium text-pace-text-secondary mb-1.5">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. My Athlete"
          className={inputClass}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-xs font-medium text-pace-text-secondary">
          Splits (elapsed time, mm:ss.ss)
        </label>
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              value={row.label}
              onChange={(e) => updateRow(i, "label", e.target.value)}
              className={`w-16 ${smallInputClass}`}
            />
            <input
              type="text"
              value={row.elapsedStr}
              onChange={(e) => updateRow(i, "elapsedStr", e.target.value)}
              placeholder="0:00.00"
              className={`flex-1 ${smallInputClass}`}
            />
          </div>
        ))}
        <div className="flex gap-2">
          <button
            onClick={addRow}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-pace-border text-pace-text-secondary hover:text-pace-text hover:border-pace-text-secondary transition-all duration-300"
          >
            + Add row
          </button>
          <button
            onClick={removeRow}
            disabled={rows.length <= 1}
            className="text-xs font-medium px-3 py-1.5 rounded-full border border-pace-border text-pace-text-secondary hover:text-pace-text hover:border-pace-text-secondary transition-all duration-300 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            - Remove row
          </button>
        </div>
      </div>

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      <button
        onClick={handleAdd}
        className="w-full bg-pace-accent hover:bg-pace-accent-hover text-white text-sm font-medium rounded-full px-4 py-2.5 transition-all duration-300"
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

      {error && (
        <p className="text-xs text-red-500">{error}</p>
      )}

      <button
        onClick={handleAdd}
        className="w-full bg-pace-accent hover:bg-pace-accent-hover text-white text-sm font-medium rounded-full px-4 py-2.5 transition-all duration-300"
      >
        Add to Window
      </button>
    </div>
  );
}

export default function CustomAthleteModal({ onAdd, onClose }: CustomAthleteModalProps) {
  const [tab, setTab] = useState<Tab>("generator");

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
          <h2 className="font-display text-lg text-pace-text">
            Custom Athlete
          </h2>
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
              ["generator", "Pace Line"],
              ["manual", "Manual Splits"],
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

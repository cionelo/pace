import { useState } from "react";
import { useWindowStore } from "../stores/window-store";
import UnifiedSearch from "./UnifiedSearch";
import SplitChart from "./SplitChart";
import Legend from "./Legend";
import CustomAthleteModal from "./CustomAthleteModal";
import { MAX_ATHLETES_PER_WINDOW } from "../lib/constants";

interface PaceWindowProps {
  windowId: string;
}

export default function PaceWindow({ windowId }: PaceWindowProps) {
  const paceWindow = useWindowStore((s) => s.windows.find((w) => w.id === windowId));
  const addAthlete = useWindowStore((s) => s.addAthlete);
  const removeAthlete = useWindowStore((s) => s.removeAthlete);
  const removeWindow = useWindowStore((s) => s.removeWindow);
  const resetWindow = useWindowStore((s) => s.resetWindow);
  const toggleVisibility = useWindowStore((s) => s.toggleAthleteVisibility);

  const [customOpen, setCustomOpen] = useState(false);

  if (!paceWindow) return null;

  return (
    <div className="bg-pace-card border border-pace-border rounded-2xl overflow-hidden flex flex-col shadow-pace transition-shadow duration-300 hover:shadow-pace-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-pace-border">
        <span className="text-sm font-medium text-pace-text-secondary">
          Pace Window
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => resetWindow(windowId)}
            className="text-pace-text-muted hover:text-pace-text-secondary text-xs px-3 py-1 rounded-full border border-pace-border hover:border-pace-text-secondary transition-all duration-300"
            title="Reset window"
          >
            Reset
          </button>
          <button
            onClick={() => removeWindow(windowId)}
            className="text-pace-text-muted hover:text-red-500 text-xl leading-none px-1 transition-colors duration-300"
            title="Close window"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Unified search */}
      <UnifiedSearch
        selectedCount={paceWindow.athletes.length}
        maxAthletes={MAX_ATHLETES_PER_WINDOW}
        onAdd={(ar) => addAthlete(windowId, ar)}
      />

      {/* Custom athlete button */}
      <div className="px-4 pb-3 border-b border-pace-border-subtle">
        <button
          onClick={() => setCustomOpen(true)}
          className="text-xs font-medium px-3.5 py-1.5 rounded-full border border-dashed border-pace-border text-pace-text-muted hover:text-pace-accent hover:border-pace-accent transition-all duration-300"
        >
          + Custom
        </button>
      </div>

      {/* Custom athlete modal */}
      {customOpen && (
        <CustomAthleteModal
          onAdd={(ar) => {
            addAthlete(windowId, ar);
            setCustomOpen(false);
          }}
          onClose={() => setCustomOpen(false)}
        />
      )}

      {/* Selected athletes chips */}
      {paceWindow.athletes.length > 0 && (
        <div className="px-4 py-2 flex flex-wrap gap-1.5 border-b border-pace-border-subtle">
          {paceWindow.athletes.map((a) => (
            <span
              key={a.athleteResult.athlete.id}
              className="inline-flex items-center gap-1.5 bg-pace-card-inner text-xs text-pace-text-secondary rounded-full px-3 py-1"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: a.color }}
              />
              {a.athleteResult.athlete.name}
              <button
                onClick={() => removeAthlete(windowId, a.athleteResult.athlete.id)}
                className="text-pace-text-muted hover:text-red-500 ml-0.5 transition-colors duration-200"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 p-3 min-h-[200px]">
        {paceWindow.athletes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-pace-text-muted text-sm font-light">
            Search for a race or athlete to get started
          </div>
        ) : (
          <SplitChart athletes={paceWindow.athletes} />
        )}
      </div>

      {/* Legend */}
      {paceWindow.athletes.length > 0 && (
        <Legend
          athletes={paceWindow.athletes}
          onToggle={(id) => toggleVisibility(windowId, id)}
        />
      )}
    </div>
  );
}

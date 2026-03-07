import { useWindowStore } from "../stores/window-store";
import DistanceSelector from "./DistanceSelector";
import AthleteSearch from "./AthleteSearch";
import SplitChart from "./SplitChart";
import Legend from "./Legend";
import { MAX_ATHLETES_PER_WINDOW } from "../lib/constants";

interface PaceWindowProps {
  windowId: string;
}

export default function PaceWindow({ windowId }: PaceWindowProps) {
  const paceWindow = useWindowStore((s) => s.windows.find((w) => w.id === windowId));
  const setDistance = useWindowStore((s) => s.setDistance);
  const addAthlete = useWindowStore((s) => s.addAthlete);
  const removeAthlete = useWindowStore((s) => s.removeAthlete);
  const removeWindow = useWindowStore((s) => s.removeWindow);
  const resetWindow = useWindowStore((s) => s.resetWindow);
  const toggleVisibility = useWindowStore((s) => s.toggleAthleteVisibility);

  if (!paceWindow) return null;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden flex flex-col">
      {/* Header */}
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

      {/* Search panel (only when distance is set) */}
      {paceWindow.distance && (
        <AthleteSearch
          distance={paceWindow.distance}
          selectedCount={paceWindow.athletes.length}
          maxAthletes={MAX_ATHLETES_PER_WINDOW}
          onAdd={(ar) => addAthlete(windowId, ar)}
        />
      )}

      {/* Selected athletes chips */}
      {paceWindow.athletes.length > 0 && (
        <div className="px-3 py-1 flex flex-wrap gap-1 border-b border-zinc-800">
          {paceWindow.athletes.map((a) => (
            <span
              key={a.athleteResult.athlete.id}
              className="inline-flex items-center gap-1 bg-zinc-800 text-xs text-zinc-300 rounded px-2 py-0.5"
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: a.color }}
              />
              {a.athleteResult.athlete.name}
              <button
                onClick={() => removeAthlete(windowId, a.athleteResult.athlete.id)}
                className="text-zinc-500 hover:text-red-400 ml-0.5"
              >
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="flex-1 p-2 min-h-[200px]">
        {!paceWindow.distance ? (
          <div className="flex items-center justify-center h-full text-zinc-500 text-sm">
            Select a distance to get started
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

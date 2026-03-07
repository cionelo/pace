import { useState } from "react";
import type { WindowAthleteData } from "../types/pace";

interface LegendProps {
  athletes: WindowAthleteData[];
  onToggle: (athleteId: string) => void;
}

export default function Legend({ athletes, onToggle }: LegendProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-3 pb-2">
      {athletes.map((a) => {
        const { athlete } = a.athleteResult;
        const team = a.athleteResult.team;
        const event = a.athleteResult.event;
        const isHovered = hoveredId === athlete.id;

        return (
          <div key={athlete.id} className="relative">
            <button
              onClick={() => onToggle(athlete.id)}
              onMouseEnter={() => setHoveredId(athlete.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`flex items-center gap-1.5 text-sm transition-opacity ${
                a.visible ? "opacity-100" : "opacity-40"
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: a.color }}
              />
              <span className="text-zinc-200">{athlete.name}</span>
              <span className="text-zinc-500">
                {a.athleteResult.result.time_str}
              </span>
            </button>

            {isHovered && (
              <div className="absolute bottom-full left-0 mb-1 z-50 bg-zinc-800/80 backdrop-blur-sm border border-zinc-700 rounded-md px-3 py-2 shadow-lg whitespace-nowrap text-xs">
                <p className="text-white font-medium">{athlete.name}</p>
                {team && <p className="text-zinc-400">{team.name}</p>}
                {event.source_url ? (
                  <a
                    href={event.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300 underline block"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {event.name}
                  </a>
                ) : (
                  <p className="text-zinc-400">{event.name}</p>
                )}
                {event.date && (
                  <p className="text-zinc-500">{event.date}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

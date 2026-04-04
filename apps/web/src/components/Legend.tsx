import { useState } from "react";
import type { WindowAthleteData } from "../types/pace";

interface LegendProps {
  athletes: WindowAthleteData[];
  onToggle: (athleteId: string) => void;
}

export default function Legend({ athletes, onToggle }: LegendProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2 px-4 pb-3 border-t border-pace-border-subtle pt-3">
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
              className={`flex items-center gap-2 text-sm transition-opacity duration-300 ${
                a.visible ? "opacity-100" : "opacity-40"
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: a.color }}
              />
              <span className="text-pace-text font-medium">{athlete.name}</span>
              <span className="text-pace-text-muted font-mono text-xs">
                {a.athleteResult.result.time_str}
              </span>
            </button>

            {isHovered && (
              <div className="absolute bottom-full left-0 mb-2 z-50 bg-pace-card/95 backdrop-blur-sm border border-pace-border rounded-xl px-4 py-2.5 shadow-pace-lg whitespace-nowrap text-xs">
                <p className="text-pace-text font-medium">{athlete.name}</p>
                {team && <p className="text-pace-text-secondary">{team.name}</p>}
                {event.source_url ? (
                  <a
                    href={event.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-pace-accent hover:underline flex items-center gap-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {event.name}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      className="w-3 h-3 flex-shrink-0"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Z"
                        clipRule="evenodd"
                      />
                      <path
                        fillRule="evenodd"
                        d="M6.194 12.753a.75.75 0 0 0 1.06.053L16.5 4.44v2.81a.75.75 0 0 0 1.5 0v-4.5a.75.75 0 0 0-.75-.75h-4.5a.75.75 0 0 0 0 1.5h2.553l-9.056 8.194a.75.75 0 0 0-.053 1.06Z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </a>
                ) : (
                  <p className="text-pace-text-secondary">{event.name}</p>
                )}
                {event.date && (
                  <p className="text-pace-text-muted">{event.date}</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

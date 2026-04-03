import type { Event, Conference, AthleteResult } from "../types/pace";
import { formatRaceDisplay } from "../lib/format";

type RaceWithConference = Event & { conference?: Conference };

interface SearchResultsProps {
  races: RaceWithConference[];
  athletes: AthleteResult[];
  loading: boolean;
  query: string;
  onSelectRace: (event: RaceWithConference) => void;
  onSelectAthlete: (ar: AthleteResult) => void;
  atCapacity: boolean;
}

export default function SearchResults({
  races,
  athletes,
  loading,
  query,
  onSelectRace,
  onSelectAthlete,
  atCapacity,
}: SearchResultsProps) {
  const hasResults = races.length > 0 || athletes.length > 0;

  if (loading) {
    return (
      <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-3">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Searching...</p>
      </div>
    );
  }

  if (!hasResults && query) {
    return (
      <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg p-3">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          No results for &ldquo;{query}&rdquo;
        </p>
      </div>
    );
  }

  if (!hasResults) return null;

  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-lg max-h-72 overflow-y-auto">
      {/* Races section */}
      {races.length > 0 && (
        <div>
          <div className="sticky top-0 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-100 dark:border-zinc-800">
            Races
          </div>
          {races.map((race) => (
            <button
              key={race.id}
              className="w-full text-left px-3 py-2 text-xs text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              onClick={() => onSelectRace(race)}
            >
              {formatRaceDisplay({
                conferenceName: race.conference?.name,
                eventName: race.name,
                season: race.season,
                gender: race.gender,
                distance: race.distance,
                date: race.date,
              })}
            </button>
          ))}
        </div>
      )}

      {/* Athletes section */}
      {athletes.length > 0 && (
        <div>
          <div className="sticky top-0 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-800/60 border-b border-zinc-100 dark:border-zinc-800">
            Athletes
          </div>
          {athletes.map((ar) => (
            <div
              key={`${ar.athlete.id}-${ar.result.id}`}
              className="flex items-center justify-between px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-zinc-800 dark:text-zinc-200 truncate">
                  {ar.athlete.name}
                  {ar.team && (
                    <span className="text-zinc-400 dark:text-zinc-500">
                      {" "}
                      &middot; {ar.team.name}
                    </span>
                  )}
                </p>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 truncate">
                  {ar.result.time_str} &middot; {ar.event.name}
                  {ar.event.date ? ` \u00B7 ${ar.event.date}` : ""}
                </p>
              </div>
              <button
                onClick={() => onSelectAthlete(ar)}
                disabled={atCapacity}
                className="ml-2 shrink-0 text-xs px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                +
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

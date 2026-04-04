import type { Event, Conference, AthleteResult } from "../types/pace";
import { formatRaceDisplay, extractRound } from "../lib/format";

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
      <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-pace-border bg-pace-card shadow-pace-lg p-4">
        <p className="text-xs text-pace-text-muted">Searching...</p>
      </div>
    );
  }

  if (!hasResults && query) {
    return (
      <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-pace-border bg-pace-card shadow-pace-lg p-4">
        <p className="text-xs text-pace-text-muted">
          No results for &ldquo;{query}&rdquo;
        </p>
      </div>
    );
  }

  if (!hasResults) return null;

  return (
    <div className="absolute left-0 right-0 top-full z-50 mt-2 rounded-2xl border border-pace-border bg-pace-card shadow-pace-lg max-h-72 overflow-y-auto overflow-x-hidden">
      {/* Races section */}
      {races.length > 0 && (
        <div>
          <div className="sticky top-0 px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-pace-text-muted bg-pace-card-inner border-b border-pace-border-subtle">
            Races
          </div>
          {races.map((race) => {
            const round = extractRound(race.name);
            return (
              <button
                key={race.id}
                className="w-full text-left px-4 py-2.5 text-sm text-pace-text-secondary hover:bg-pace-card-inner transition-colors duration-200 flex items-center gap-2"
                onClick={() => onSelectRace(race)}
              >
                <span className="flex-1 truncate">
                  {formatRaceDisplay({
                    conferenceName: race.conference?.name,
                    eventName: race.name,
                    season: race.season,
                    gender: race.gender,
                    distance: race.distance,
                    date: race.date,
                  })}
                </span>
                {round && (
                  <span className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full ${
                    round === "Final"
                      ? "bg-pace-accent/10 text-pace-accent"
                      : "bg-pace-card-inner text-pace-text-muted border border-pace-border-subtle"
                  }`}>
                    {round}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Athletes section */}
      {athletes.length > 0 && (
        <div>
          <div className="sticky top-0 px-4 py-2 text-[10px] font-medium uppercase tracking-widest text-pace-text-muted bg-pace-card-inner border-b border-pace-border-subtle">
            Athletes
          </div>
          {athletes.map((ar) => (
            <div
              key={`${ar.athlete.id}-${ar.result.id}`}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-pace-card-inner transition-colors duration-200"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-pace-text truncate">
                  {ar.athlete.name}
                  {ar.team && (
                    <span className="text-pace-text-muted">
                      {" "}
                      &middot; {ar.team.name}
                    </span>
                  )}
                </p>
                <p className="text-xs text-pace-text-muted truncate">
                  <span className="font-mono">{ar.result.time_str}</span> &middot;{" "}
                  {ar.event.source_url ? (
                    <a
                      href={ar.event.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-pace-accent hover:underline inline-flex items-center gap-0.5"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {ar.event.name}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 20 20"
                        fill="currentColor"
                        className="w-2.5 h-2.5 flex-shrink-0"
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
                    ar.event.name
                  )}
                  {ar.event.date ? ` \u00B7 ${ar.event.date}` : ""}
                </p>
              </div>
              <button
                onClick={() => onSelectAthlete(ar)}
                disabled={atCapacity}
                className="ml-2 shrink-0 text-xs font-medium px-3.5 py-1 rounded-full bg-pace-accent text-white hover:bg-pace-accent-hover disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
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

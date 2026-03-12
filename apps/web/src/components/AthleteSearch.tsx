import { useState, useEffect, useCallback } from "react";
import { getEvents, searchAthletes, getTeamsForEvent } from "../lib/db";
import type { Event, AthleteResult } from "../types/pace";

interface AthleteSearchProps {
  distance: string;
  selectedCount: number;
  maxAthletes: number;
  onAdd: (athleteResult: AthleteResult) => void;
}

export default function AthleteSearch({
  distance,
  selectedCount,
  maxAthletes,
  onAdd,
}: AthleteSearchProps) {
  const [open, setOpen] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>("");
  const [teams, setTeams] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [nameQuery, setNameQuery] = useState("");
  const [results, setResults] = useState<AthleteResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [genderFilter, setGenderFilter] = useState<"" | "Men" | "Women">("");
  const [divisionFilter, setDivisionFilter] = useState<"" | "D1" | "D2">("");
  const [yearFilter, setYearFilter] = useState("");
  const [eventSearch, setEventSearch] = useState("");

  // Load events for this distance + gender + division
  useEffect(() => {
    getEvents({
      distance,
      gender: genderFilter || undefined,
      division: divisionFilter || undefined,
    })
      .then(setEvents)
      .catch(console.error);
    setSelectedEventId("");
    setYearFilter("");
    setEventSearch("");
  }, [distance, genderFilter, divisionFilter]);

  // Load teams when event is selected
  useEffect(() => {
    if (!selectedEventId) {
      setTeams([]);
      return;
    }
    getTeamsForEvent(selectedEventId).then(setTeams).catch(console.error);
  }, [selectedEventId]);

  // Search athletes when filters change
  const doSearch = useCallback(async () => {
    setLoading(true);
    try {
      const data = await searchAthletes(nameQuery, {
        eventId: selectedEventId || undefined,
        distance,
        gender: genderFilter || undefined,
      });
      let filtered = data;
      if (selectedTeam) {
        filtered = data.filter((r) => r.team?.name === selectedTeam);
      }
      setResults(filtered);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [nameQuery, selectedEventId, selectedTeam, distance, genderFilter]);

  useEffect(() => {
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [doSearch]);

  const atCapacity = selectedCount >= maxAthletes;

  const availableYears = [
    ...new Set(
      events.map((e) => e.date?.slice(0, 4)).filter(Boolean)
    ),
  ].sort().reverse() as string[];

  const filteredEvents = events.filter((e) => {
    if (yearFilter && e.date?.slice(0, 4) !== yearFilter) return false;
    if (eventSearch && !e.name.toLowerCase().includes(eventSearch.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="border-b border-zinc-800">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <span>
          {open ? "\u25BE" : "\u25B8"} Add/Remove Athletes ({selectedCount}/{maxAthletes})
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {/* Gender + Division + Year filter row */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex rounded overflow-hidden border border-zinc-700 text-xs">
              {(["", "Men", "Women"] as const).map((g) => (
                <button
                  key={g}
                  className={`px-2 py-1 transition-colors ${
                    genderFilter === g
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                  onClick={() => setGenderFilter(g)}
                >
                  {g === "" ? "All" : g === "Men" ? "M" : "W"}
                </button>
              ))}
            </div>
            <div className="flex rounded overflow-hidden border border-zinc-700 text-xs">
              {(["", "D1", "D2"] as const).map((d) => (
                <button
                  key={d}
                  className={`px-2 py-1 transition-colors ${
                    divisionFilter === d
                      ? "bg-zinc-700 text-white"
                      : "text-zinc-400 hover:text-white"
                  }`}
                  onClick={() => setDivisionFilter(d)}
                >
                  {d === "" ? "All" : d}
                </button>
              ))}
            </div>
            {availableYears.length > 1 && (
              <div className="flex rounded overflow-hidden border border-zinc-700 text-xs">
                <button
                  className={`px-2 py-1 transition-colors ${yearFilter === "" ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}
                  onClick={() => setYearFilter("")}
                >
                  All
                </button>
                {availableYears.map((y) => (
                  <button
                    key={y}
                    className={`px-2 py-1 transition-colors ${yearFilter === y ? "bg-zinc-700 text-white" : "text-zinc-400 hover:text-white"}`}
                    onClick={() => setYearFilter(y)}
                  >
                    {y}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Race search + Competition filter */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search races..."
              value={eventSearch}
              onChange={(e) => setEventSearch(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5 pr-6 placeholder-zinc-500"
            />
            {eventSearch && (
              <button
                onClick={() => setEventSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
              >
                &times;
              </button>
            )}
          </div>
          <select
            value={selectedEventId}
            onChange={(e) => {
              setSelectedEventId(e.target.value);
              setSelectedTeam("");
            }}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5"
          >
            <option value="">All competitions</option>
            {filteredEvents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}{e.gender && !genderFilter ? ` (${e.gender === "Women" ? "W" : "M"})` : ""}{e.date ? ` · ${e.date}` : ""}
              </option>
            ))}
          </select>

          {/* Team filter */}
          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5"
          >
            <option value="">All teams</option>
            {teams.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Name search */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search by name..."
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-xs rounded px-2 py-1.5 pr-6 placeholder-zinc-500"
            />
            {nameQuery && (
              <button
                onClick={() => setNameQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 text-xs"
              >
                &times;
              </button>
            )}
          </div>

          {/* Results */}
          <div className="max-h-48 overflow-y-auto space-y-1">
            {loading && (
              <p className="text-xs text-zinc-500 py-2">Searching...</p>
            )}
            {!loading && results.length === 0 && nameQuery && (
              <p className="text-xs text-zinc-500 py-2">
                No {distance} results found for &ldquo;{nameQuery}&rdquo;
              </p>
            )}
            {!loading && results.length === 0 && !nameQuery && (
              <p className="text-xs text-zinc-500 py-2">No results</p>
            )}
            {!loading &&
              results.map((ar) => (
                <div
                  key={`${ar.athlete.id}-${ar.result.id}`}
                  className="flex items-center justify-between bg-zinc-800/50 rounded px-2 py-1.5"
                >
                  <div>
                    <p className="text-xs text-zinc-200 font-medium">
                      {ar.athlete.name}
                      {ar.team && (
                        <span className="text-zinc-500"> &middot; {ar.team.name}</span>
                      )}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {ar.result.time_str} &middot; {ar.event.name}
                      {ar.event.date ? ` \u00B7 ${ar.event.date}` : ""}
                    </p>
                  </div>
                  <button
                    onClick={() => onAdd(ar)}
                    disabled={atCapacity}
                    className="text-xs px-2 py-0.5 rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-30 disabled:cursor-not-allowed"
                  >
                    +
                  </button>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

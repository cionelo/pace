import { useState, useEffect, useRef, useCallback } from "react";
import { searchRaces, searchAthletes } from "../lib/db";
import { formatRaceDisplay } from "../lib/format";
import type { Event, Conference, AthleteResult } from "../types/pace";
import FilterPills from "./FilterPills";
import SearchResults from "./SearchResults";

type RaceWithConference = Event & { conference?: Conference };

interface UnifiedSearchProps {
  selectedCount: number;
  maxAthletes: number;
  onAdd: (athleteResult: AthleteResult) => void;
}

export default function UnifiedSearch({
  selectedCount,
  maxAthletes,
  onAdd,
}: UnifiedSearchProps) {
  const [query, setQuery] = useState("");
  const [gender, setGender] = useState<"" | "Men" | "Women">("");
  const [division, setDivision] = useState<"" | "D1" | "D2">("");
  const [selectedRace, setSelectedRace] = useState<RaceWithConference | null>(null);

  const [races, setRaces] = useState<RaceWithConference[]>([]);
  const [athletes, setAthletes] = useState<AthleteResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, []);

  // Debounced search
  const doSearch = useCallback(async () => {
    const trimmed = query.trim();
    if (!trimmed && !selectedRace) {
      setRaces([]);
      setAthletes([]);
      setShowDropdown(false);
      return;
    }

    setLoading(true);
    setShowDropdown(true);

    try {
      if (selectedRace) {
        // Scoped to selected race: only search athletes within that event
        const athleteResults = await searchAthletes(trimmed, {
          eventId: selectedRace.id,
          gender: gender || undefined,
        });
        setRaces([]);
        setAthletes(athleteResults);
      } else {
        // Search both races and athletes simultaneously
        const [raceResults, athleteResults] = await Promise.all([
          searchRaces(trimmed, {
            gender: gender || undefined,
            division: division || undefined,
          }),
          searchAthletes(trimmed, {
            gender: gender || undefined,
          }),
        ]);
        setRaces(raceResults);
        setAthletes(athleteResults);
      }
    } catch (err) {
      console.error("Search failed:", err);
      setRaces([]);
      setAthletes([]);
    } finally {
      setLoading(false);
    }
  }, [query, gender, division, selectedRace]);

  useEffect(() => {
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [doSearch]);

  function handleSelectRace(race: RaceWithConference) {
    setSelectedRace(race);
    setQuery("");
    setShowDropdown(false);
    // Focus input so user can immediately search athletes within the race
    inputRef.current?.focus();
  }

  function handleRemoveRace() {
    setSelectedRace(null);
    setQuery("");
    setRaces([]);
    setAthletes([]);
    setShowDropdown(false);
  }

  function handleSelectAthlete(ar: AthleteResult) {
    onAdd(ar);
  }

  function handleInputFocus() {
    const trimmed = query.trim();
    if (trimmed || selectedRace) {
      setShowDropdown(true);
    }
  }

  const atCapacity = selectedCount >= maxAthletes;

  return (
    <div className="px-3 py-2 space-y-2 border-b border-zinc-200 dark:border-zinc-800">
      {/* Filter pills */}
      <FilterPills
        gender={gender}
        division={division}
        onGenderChange={setGender}
        onDivisionChange={setDivision}
      />

      {/* Selected race chip */}
      {selectedRace && (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-1 text-xs bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 rounded-md px-2 py-1 max-w-full">
            <span className="truncate">
              {formatRaceDisplay({
                conferenceName: selectedRace.conference?.name,
                eventName: selectedRace.name,
                season: selectedRace.season,
                gender: selectedRace.gender,
                distance: selectedRace.distance,
                date: selectedRace.date,
              })}
            </span>
            <button
              onClick={handleRemoveRace}
              className="shrink-0 text-blue-400 dark:text-blue-500 hover:text-blue-600 dark:hover:text-blue-300 ml-0.5"
            >
              &times;
            </button>
          </span>
        </div>
      )}

      {/* Search input + dropdown */}
      <div ref={containerRef} className="relative">
        <input
          ref={inputRef}
          type="text"
          placeholder={
            selectedRace
              ? "Search athletes in this race..."
              : "Search races or athletes..."
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleInputFocus}
          className="w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-200 text-sm rounded-md px-3 py-2 pr-8 placeholder-zinc-400 dark:placeholder-zinc-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setShowDropdown(false);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 text-sm"
          >
            &times;
          </button>
        )}

        {/* Dropdown results */}
        {showDropdown && (
          <SearchResults
            races={races}
            athletes={athletes}
            loading={loading}
            query={query}
            onSelectRace={handleSelectRace}
            onSelectAthlete={handleSelectAthlete}
            atCapacity={atCapacity}
          />
        )}
      </div>

      {/* Capacity indicator */}
      <p className="text-xs text-zinc-400 dark:text-zinc-500">
        {selectedCount}/{maxAthletes} athletes
      </p>
    </div>
  );
}

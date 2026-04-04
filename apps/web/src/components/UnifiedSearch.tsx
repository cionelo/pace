import { useState, useEffect, useRef, useCallback } from "react";
import { searchRaces, searchAthletes } from "../lib/db";
import { formatRaceDisplay } from "../lib/format";
import type { Event, Conference, AthleteResult } from "../types/pace";
import FilterPills, { type Distance } from "./FilterPills";
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
  const [distance, setDistance] = useState<"" | Distance>("");
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
        const athleteResults = await searchAthletes(trimmed, {
          eventId: selectedRace.id,
          gender: gender || undefined,
        });
        setRaces([]);
        setAthletes(athleteResults);
      } else {
        const [raceResults, athleteResults] = await Promise.all([
          searchRaces(trimmed, {
            gender: gender || undefined,
            division: division || undefined,
            distance: distance || undefined,
          }),
          searchAthletes(trimmed, {
            gender: gender || undefined,
            distance: distance || undefined,
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
  }, [query, gender, division, distance, selectedRace]);

  useEffect(() => {
    const timer = setTimeout(doSearch, 300);
    return () => clearTimeout(timer);
  }, [doSearch]);

  function handleSelectRace(race: RaceWithConference) {
    setSelectedRace(race);
    setQuery("");
    setShowDropdown(false);
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
    <div className="px-4 py-3 space-y-2.5 border-b border-pace-border-subtle">
      {/* Filter pills */}
      <FilterPills
        gender={gender}
        division={division}
        distance={distance}
        onGenderChange={setGender}
        onDivisionChange={setDivision}
        onDistanceChange={setDistance}
      />

      {/* Selected race chip */}
      {selectedRace && (
        <div className="flex items-center gap-1.5">
          <span className="inline-flex items-center gap-2 text-xs font-medium bg-pace-accent-subtle text-pace-accent border border-pace-accent rounded-full px-3.5 py-1.5 max-w-full">
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
              className="shrink-0 opacity-50 hover:opacity-100 ml-0.5 transition-opacity duration-200"
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
          className="w-full bg-pace-input border border-pace-border text-pace-text text-sm rounded-full px-4 py-2.5 pr-8 placeholder-pace-text-muted focus:border-pace-accent focus:outline-none focus:ring-2 focus:ring-pace-accent/10 shadow-pace transition-all duration-300"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              setShowDropdown(false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-pace-text-muted hover:text-pace-text-secondary text-sm transition-colors duration-200"
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
      <p className="text-xs text-pace-text-muted font-light">
        {selectedCount}/{maxAthletes} athletes
      </p>
    </div>
  );
}

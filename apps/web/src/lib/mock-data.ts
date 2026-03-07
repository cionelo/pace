import type { AthleteResult } from "../types/pace";

export const MOCK_ATHLETE_RESULTS: AthleteResult[] = [
  {
    athlete: { id: "a1", name: "Jane Smith", team_id: "t1" },
    team: { id: "t1", name: "Coastal Carolina", primary_hex: null, logo_url: null },
    result: { id: "r1", event_id: "e1", athlete_id: "a1", place: 1, time_s: 1012.1, time_str: "16:52.10", points: null },
    event: { id: "e1", source_id: "2149044", name: "2025 Sun Belt XC Championship", date: "2025-10-31", location: "Troy, AL", gender: "Women", distance: "5K", season: "xc", provider: "legacy_spa", source_url: null },
    splits: [
      { id: "s1", result_id: "r1", label: "1K", ordinal: 0, distance_m: 1000, elapsed_s: 203.4, lap_s: 203.4, place: 3 },
      { id: "s2", result_id: "r1", label: "2K", ordinal: 1, distance_m: 2000, elapsed_s: 408.3, lap_s: 204.9, place: 2 },
      { id: "s3", result_id: "r1", label: "3K", ordinal: 2, distance_m: 3000, elapsed_s: 610.0, lap_s: 201.7, place: 1 },
      { id: "s4", result_id: "r1", label: "4K", ordinal: 3, distance_m: 4000, elapsed_s: 812.5, lap_s: 202.5, place: 1 },
      { id: "s5", result_id: "r1", label: "5K", ordinal: 4, distance_m: 5000, elapsed_s: 1012.1, lap_s: 199.6, place: 1 },
    ],
  },
  {
    athlete: { id: "a2", name: "Maria Lopez", team_id: "t2" },
    team: { id: "t2", name: "Texas State", primary_hex: null, logo_url: null },
    result: { id: "r2", event_id: "e1", athlete_id: "a2", place: 2, time_s: 1021.5, time_str: "17:01.50", points: null },
    event: { id: "e1", source_id: "2149044", name: "2025 Sun Belt XC Championship", date: "2025-10-31", location: "Troy, AL", gender: "Women", distance: "5K", season: "xc", provider: "legacy_spa", source_url: null },
    splits: [
      { id: "s6", result_id: "r2", label: "1K", ordinal: 0, distance_m: 1000, elapsed_s: 200.0, lap_s: 200.0, place: 1 },
      { id: "s7", result_id: "r2", label: "2K", ordinal: 1, distance_m: 2000, elapsed_s: 405.0, lap_s: 205.0, place: 1 },
      { id: "s8", result_id: "r2", label: "3K", ordinal: 2, distance_m: 3000, elapsed_s: 614.0, lap_s: 209.0, place: 2 },
      { id: "s9", result_id: "r2", label: "4K", ordinal: 3, distance_m: 4000, elapsed_s: 820.0, lap_s: 206.0, place: 2 },
      { id: "s10", result_id: "r2", label: "5K", ordinal: 4, distance_m: 5000, elapsed_s: 1021.5, lap_s: 201.5, place: 2 },
    ],
  },
];

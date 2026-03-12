export interface Team {
  id: string;
  name: string;
  primary_hex: string | null;
  logo_url: string | null;
}

export interface Event {
  id: string;
  source_id: string;
  name: string;
  date: string | null;
  location: string | null;
  gender: "Men" | "Women";
  distance: string;
  season: "indoor" | "outdoor" | "xc" | null;
  division: "D1" | "D2" | null;
  provider: string | null;
  source_url: string | null;
}

export interface Athlete {
  id: string;
  name: string;
  team_id: string | null;
}

export interface Result {
  id: string;
  event_id: string;
  athlete_id: string;
  place: number | null;
  time_s: number | null;
  time_str: string | null;
  points: number | null;
}

export interface Split {
  id: string;
  result_id: string;
  label: string;
  ordinal: number;
  distance_m: number | null;
  elapsed_s: number | null;
  lap_s: number | null;
  place: number | null;
}

// Composite types for frontend use
export interface AthleteResult {
  athlete: Athlete;
  team: Team | null;
  result: Result;
  event: Event;
  splits: Split[];
}

export interface WindowAthleteData {
  athleteResult: AthleteResult;
  color: string;
  visible: boolean;
}

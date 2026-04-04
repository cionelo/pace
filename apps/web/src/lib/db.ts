import { supabase } from "./supabase";
import type { Event, AthleteResult, Conference } from "../types/pace";

interface EventFilters {
  gender?: string;
  distance?: string;
  season?: string;
  division?: string;
}

export async function getEvents(filters?: EventFilters): Promise<(Event & { conference?: Conference })[]> {
  let query = supabase
    .from("events")
    .select("*, conference:conferences(*)")
    .order("date", { ascending: false });

  if (filters?.gender) query = query.eq("gender", filters.gender);
  if (filters?.distance) query = query.eq("distance", filters.distance);
  if (filters?.season) query = query.eq("season", filters.season);
  if (filters?.division) query = query.eq("division", filters.division);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    conference: row.conference ?? undefined,
  }));
}

export async function getEventResults(eventId: string): Promise<AthleteResult[]> {
  const { data, error } = await supabase
    .from("results")
    .select(`
      *,
      athlete:athletes!inner(*, team:teams(*)),
      event:events!inner(*),
      splits(*)
    `)
    .eq("event_id", eventId)
    .order("place", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    athlete: { id: row.athlete.id, name: row.athlete.name, team_id: row.athlete.team_id },
    team: row.athlete.team ?? null,
    result: { id: row.id, event_id: row.event_id, athlete_id: row.athlete_id, place: row.place, time_s: row.time_s, time_str: row.time_str, points: row.points },
    event: row.event,
    splits: (row.splits ?? []).sort((a: any, b: any) => a.ordinal - b.ordinal),
  }));
}

interface AthleteSearchFilters {
  eventId?: string;
  teamName?: string;
  distance?: string;
  gender?: string;
}

export async function searchAthletes(
  query: string,
  filters?: AthleteSearchFilters
): Promise<AthleteResult[]> {
  let dbQuery = supabase
    .from("results")
    .select(`
      *,
      athlete:athletes!inner(*, team:teams(*)),
      event:events!inner(*),
      splits(*)
    `)
    .order("time_s", { ascending: true, nullsFirst: false })
    .limit(50);

  if (query) {
    // Multi-word: all words must appear in name (order-agnostic, e.g. "Jane Smith")
    const words = query.trim().split(/\s+/);
    for (const word of words) {
      dbQuery = dbQuery.ilike("athlete.name", `%${word}%`);
    }
  }
  if (filters?.eventId) {
    dbQuery = dbQuery.eq("event_id", filters.eventId);
  }
  if (filters?.distance) {
    dbQuery = dbQuery.eq("event.distance", filters.distance);
  }
  if (filters?.gender) {
    dbQuery = dbQuery.eq("event.gender", filters.gender);
  }

  const { data, error } = await dbQuery;
  if (error) throw error;

  return (data ?? []).map((row: any) => ({
    athlete: { id: row.athlete.id, name: row.athlete.name, team_id: row.athlete.team_id },
    team: row.athlete.team ?? null,
    result: { id: row.id, event_id: row.event_id, athlete_id: row.athlete_id, place: row.place, time_s: row.time_s, time_str: row.time_str, points: row.points },
    event: row.event,
    splits: (row.splits ?? []).sort((a: any, b: any) => a.ordinal - b.ordinal),
  }));
}

export async function getTeamsForEvent(eventId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("results")
    .select("athlete:athletes!inner(team:teams!inner(name))")
    .eq("event_id", eventId);

  if (error) throw error;

  const names = new Set<string>();
  (data ?? []).forEach((row: any) => {
    if (row.athlete?.team?.name) names.add(row.athlete.team.name);
  });
  return [...names].sort();
}

export async function getDistances(): Promise<string[]> {
  const { data, error } = await supabase
    .from("events")
    .select("distance")
    .order("distance");

  if (error) throw error;

  return [...new Set((data ?? []).map((e: any) => e.distance))];
}

export async function searchConferencesByAlias(query: string): Promise<string[]> {
  const { data, error } = await supabase
    .from("conference_aliases")
    .select("conference_id")
    .ilike("alias", `%${query}%`)
    .limit(10);
  if (error) throw error;
  return [...new Set((data ?? []).map((row: any) => row.conference_id as string))];
}

const SEARCH_SYNONYMS: Record<string, string[]> = {
  nationals: ["national", "championship", "championships", "champs"],
  national: ["nationals", "championship", "championships", "champs"],
  championship: ["nationals", "national", "championships", "champs"],
  championships: ["nationals", "national", "championship", "champs"],
  champs: ["nationals", "national", "championship", "championships"],
  indoors: ["indoor"],
  indoor: ["indoors"],
  outdoors: ["outdoor"],
  outdoor: ["outdoors"],
  invite: ["invitational"],
  invitational: ["invite"],
  conference: ["conf"],
  conf: ["conference"],
};

// Normalize common abbreviations before searching
function normalizeQuery(query: string): string {
  return query
    .replace(/\bd1\b/gi, "D1")
    .replace(/\bd2\b/gi, "D2")
    .trim();
}

function expandQueryTerms(query: string): string[] {
  const lower = normalizeQuery(query).toLowerCase();
  const terms = new Set<string>([lower]);
  // Single-term synonyms
  const direct = SEARCH_SYNONYMS[lower];
  if (direct) direct.forEach((s) => terms.add(s));
  // Word-level expansion for multi-word queries
  const words = lower.split(/\s+/);
  if (words.length > 1) {
    words.forEach((w) => {
      const syn = SEARCH_SYNONYMS[w];
      if (syn) {
        syn.forEach((s) => {
          const expanded = lower.replace(w, s);
          terms.add(expanded);
        });
      }
    });
  }
  return [...terms];
}

export async function searchRaces(
  query: string,
  filters?: { gender?: string; division?: string; distance?: string }
): Promise<(Event & { conference?: Conference })[]> {
  const conferenceIds = query ? await searchConferencesByAlias(query) : [];
  const terms = query ? expandQueryTerms(query) : [];

  let dbQuery = supabase
    .from("events")
    .select("*, conference:conferences(*)")
    .order("date", { ascending: false })
    .limit(20);

  if (filters?.gender) dbQuery = dbQuery.eq("gender", filters.gender);
  if (filters?.distance) dbQuery = dbQuery.eq("distance", filters.distance);

  if (query) {
    const nameFilters = terms.map((t) => `name.ilike.%${t}%`).join(",");
    const confFilter = conferenceIds.length > 0
      ? `,conference_id.in.(${conferenceIds.join(",")})`
      : "";
    dbQuery = dbQuery.or(`${nameFilters}${confFilter}`);
  }

  const { data, error } = await dbQuery;
  if (error) throw error;

  const results = (data ?? []).map((row: any) => ({
    ...row,
    conference: row.conference ?? undefined,
  }));

  // Client-side relevance sort when there's a query:
  // 1. Name starts with query term → top
  // 2. Name contains query term → next
  // 3. Conference match → after
  // Within each tier, sort by date descending
  if (query) {
    const lower = query.toLowerCase();
    results.sort((a: any, b: any) => {
      const aName = (a.name ?? "").toLowerCase();
      const bName = (b.name ?? "").toLowerCase();
      const aScore = aName.startsWith(lower) ? 0 : aName.includes(lower) ? 1 : 2;
      const bScore = bName.startsWith(lower) ? 0 : bName.includes(lower) ? 1 : 2;
      if (aScore !== bScore) return aScore - bScore;
      // Same tier: newer first
      return (b.date ?? "").localeCompare(a.date ?? "");
    });
  }

  return results;
}

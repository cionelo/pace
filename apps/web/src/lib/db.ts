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
    dbQuery = dbQuery.ilike("athlete.name", `%${query}%`);
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

export async function searchRaces(
  query: string,
  filters?: { gender?: string; division?: string }
): Promise<(Event & { conference?: Conference })[]> {
  const conferenceIds = query ? await searchConferencesByAlias(query) : [];

  let dbQuery = supabase
    .from("events")
    .select("*, conference:conferences(*)")
    .order("date", { ascending: false })
    .limit(20);

  if (filters?.gender) dbQuery = dbQuery.eq("gender", filters.gender);

  if (query && conferenceIds.length > 0) {
    dbQuery = dbQuery.or(
      `name.ilike.%${query}%,conference_id.in.(${conferenceIds.join(",")})`
    );
  } else if (query) {
    dbQuery = dbQuery.ilike("name", `%${query}%`);
  }

  const { data, error } = await dbQuery;
  if (error) throw error;
  return (data ?? []).map((row: any) => ({
    ...row,
    conference: row.conference ?? undefined,
  }));
}

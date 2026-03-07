-- Enable trigram extension for fuzzy name search
create extension if not exists pg_trgm;

-- Teams
create table teams (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  primary_hex text,
  logo_url text,
  created_at timestamptz default now()
);

-- Events (one row per race)
create table events (
  id uuid primary key default gen_random_uuid(),
  source_id text unique not null,
  name text not null,
  date date,
  location text,
  gender text not null check (gender in ('Men', 'Women')),
  distance text not null,
  season text check (season in ('indoor', 'outdoor', 'xc')),
  provider text,
  created_at timestamptz default now()
);

-- Athletes (deduplicated by name + team)
create table athletes (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  team_id uuid references teams(id),
  created_at timestamptz default now(),
  unique(name, team_id)
);

-- Results (one row per athlete per event)
create table results (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  athlete_id uuid not null references athletes(id) on delete cascade,
  place integer,
  time_s numeric,
  time_str text,
  points integer,
  created_at timestamptz default now(),
  unique(event_id, athlete_id)
);

-- Splits (one row per split point per result)
create table splits (
  id uuid primary key default gen_random_uuid(),
  result_id uuid not null references results(id) on delete cascade,
  label text not null,
  ordinal integer not null,
  elapsed_s numeric,
  lap_s numeric,
  place integer
);

-- Indexes for common query patterns
create index idx_results_event on results(event_id);
create index idx_results_athlete on results(athlete_id);
create index idx_splits_result on splits(result_id);
create index idx_events_distance on events(distance);
create index idx_events_gender on events(gender);
create index idx_athletes_name on athletes using gin(name gin_trgm_ops);

-- Row Level Security (read-only public access)
alter table teams enable row level security;
alter table events enable row level security;
alter table athletes enable row level security;
alter table results enable row level security;
alter table splits enable row level security;

create policy "Public read" on teams for select using (true);
create policy "Public read" on events for select using (true);
create policy "Public read" on athletes for select using (true);
create policy "Public read" on results for select using (true);
create policy "Public read" on splits for select using (true);

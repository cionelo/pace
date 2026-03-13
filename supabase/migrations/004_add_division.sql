-- Add division column to events table
-- Values: 'D1', 'D2', or NULL (unknown/unclassified)
ALTER TABLE events ADD COLUMN IF NOT EXISTS division text
  CHECK (division IN ('D1', 'D2'));

-- Index for division filtering
CREATE INDEX IF NOT EXISTS idx_events_division ON events(division);

-- Backfill D2 conferences (indoor 2026)
UPDATE events SET division = 'D2' WHERE division IS NULL AND (
  name ILIKE '%NSIC%'
  OR name ILIKE '%GNAC%'
  OR name ILIKE '%SIAC %'
  OR name ILIKE '%RMAC%'
  OR name ILIKE '%Conference Carolinas%'
  OR name ILIKE '%Gulf South%'
  OR name ILIKE '%G-MAC%'
  OR name ILIKE '%Great Midwest%'
  OR name ILIKE '%CIAA%'
  OR name ILIKE '%Peach Belt%'
  OR name ILIKE '%NE10%'
  OR name ILIKE '%Northeast-10%'
  OR name ILIKE '%GLIAC%'
);

-- Backfill D1 conferences (indoor 2026)
UPDATE events SET division = 'D1' WHERE division IS NULL AND (
  name ILIKE '%AAC Indoor%'
  OR name ILIKE '%American Athletic%'
  OR name ILIKE '%ASUN%'
  OR name ILIKE '%Atlantic 10%'
  OR name ILIKE '% A10 %'
  OR name ILIKE '%ACC Indoor%'
  OR name ILIKE '%Big East%'
  OR name ILIKE '%Big Sky%'
  OR name ILIKE '%Big South%'
  OR name ILIKE '%Big Ten%'
  OR name ILIKE '%Big 12%'
  OR name ILIKE '%CAA Indoor%'
  OR name ILIKE '%Coastal Athletic%'
  OR name ILIKE '%Conference USA%'
  OR name ILIKE '% CUSA %'
  OR name ILIKE '%Horizon League%'
  OR name ILIKE '%Ivy League%'
  OR name ILIKE '%MAAC Indoor%'
  OR name ILIKE '%Metro Atlantic%'
  OR name ILIKE '%MAC Indoor%'
  OR name ILIKE '%Mid-American%'
  OR name ILIKE '%MEAC%'
  OR name ILIKE '%Mid-Eastern%'
  OR name ILIKE '%Mountain West%'
  OR name ILIKE '% MWC %'
  OR name ILIKE '%Missouri Valley%'
  OR name ILIKE '% MVC %'
  OR name ILIKE '%NEC Indoor%'
  OR name ILIKE '%Northeast Conference%'
  OR name ILIKE '%OVC Indoor%'
  OR name ILIKE '%Ohio Valley%'
  OR name ILIKE '%Patriot League%'
  OR name ILIKE '%SEC Indoor%'
  OR name ILIKE '%Southeastern Conference%'
  OR name ILIKE '%SoCon%'
  OR name ILIKE '%Southern Conference%'
  OR name ILIKE '%Southland%'
  OR name ILIKE '%Summit League%'
  OR name ILIKE '%Sun Belt%'
  OR name ILIKE '%SWAC%'
  OR name ILIKE '%Southwestern Athletic%'
  OR name ILIKE '%WAC Indoor%'
  OR name ILIKE '%Western Athletic%'
  OR name ILIKE '%America East%'
);

-- Backfill XC events: Sun Belt = D1, Gulf South = D2, ACCC = D2
-- (XC events from Fall 2025 already in DB)
UPDATE events SET division = 'D1' WHERE division IS NULL AND season = 'xc' AND name ILIKE '%Sun Belt%';
UPDATE events SET division = 'D2' WHERE division IS NULL AND season = 'xc' AND (
  name ILIKE '%Gulf South%' OR name ILIKE '%ACCC%'
);

-- NOTE: MEAC is classified as D1 (its official NCAA classification).
-- The D2 conference URLs doc listed it as "D2 members" but MEAC is a D1 conference.
-- If any MEAC events were ingested from the D2 batch, they'll still be marked D1 here.
-- Verify with: SELECT id, name, division FROM events WHERE name ILIKE '%MEAC%';

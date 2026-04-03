-- Conferences and alias system for conference-based search and filtering

-- Conferences
CREATE TABLE conferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  short_name text,
  division text NOT NULL CHECK (division IN ('D1', 'D2', 'D3')),
  created_at timestamptz DEFAULT now()
);

-- Conference aliases (canonical name, short name, and alternate spellings)
CREATE TABLE conference_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conference_id uuid NOT NULL REFERENCES conferences(id) ON DELETE CASCADE,
  alias text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX idx_conference_aliases_alias ON conference_aliases USING gin(alias gin_trgm_ops);
CREATE INDEX idx_conferences_division ON conferences(division);

-- Add conference_id to events
ALTER TABLE events ADD COLUMN IF NOT EXISTS conference_id uuid REFERENCES conferences(id);
CREATE INDEX idx_events_conference ON events(conference_id);

-- RLS
ALTER TABLE conferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE conference_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read" ON conferences FOR SELECT USING (true);
CREATE POLICY "Public read" ON conference_aliases FOR SELECT USING (true);

-- ============================================================
-- Seed D1 conferences (30)
-- ============================================================
INSERT INTO conferences (name, short_name, division) VALUES
  ('American Athletic Conference',               'AAC',              'D1'),
  ('ASUN Conference',                            'ASUN',             'D1'),
  ('Atlantic 10 Conference',                     'A10',              'D1'),
  ('Atlantic Coast Conference',                  'ACC',              'D1'),
  ('Big East Conference',                        'Big East',         'D1'),
  ('Big Sky Conference',                         'Big Sky',          'D1'),
  ('Big South Conference',                       'Big South',        'D1'),
  ('Big Ten Conference',                         'Big Ten',          'D1'),
  ('Big 12 Conference',                          'Big 12',           'D1'),
  ('Coastal Athletic Association',               'CAA',              'D1'),
  ('Conference USA',                             'CUSA',             'D1'),
  ('Horizon League',                             'Horizon League',   'D1'),
  ('Ivy League',                                 'Ivy League',       'D1'),
  ('Metro Atlantic Athletic Conference',         'MAAC',             'D1'),
  ('Mid-American Conference',                    'MAC',              'D1'),
  ('Mid-Eastern Athletic Conference',            'MEAC',             'D1'),
  ('Missouri Valley Conference',                 'Missouri Valley',  'D1'),
  ('Mountain West Conference',                   'Mountain West',    'D1'),
  ('Northeast Conference',                       'NEC',              'D1'),
  ('Ohio Valley Conference',                     'OVC',              'D1'),
  ('Patriot League',                             'Patriot League',   'D1'),
  ('Southeastern Conference',                    'SEC',              'D1'),
  ('Southern Conference',                        'SoCon',            'D1'),
  ('Southland Conference',                       'Southland',        'D1'),
  ('Summit League',                              'Summit League',    'D1'),
  ('Sun Belt Conference',                        'Sun Belt',         'D1'),
  ('Southwestern Athletic Conference',           'SWAC',             'D1'),
  ('Western Athletic Conference',                'WAC',              'D1'),
  ('America East Conference',                    'America East',     'D1')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Seed D2 conferences (11)
-- ============================================================
INSERT INTO conferences (name, short_name, division) VALUES
  ('Northern Sun Intercollegiate Conference',        'NSIC',                 'D2'),
  ('Great Northwest Athletic Conference',            'GNAC',                 'D2'),
  ('Southern Intercollegiate Athletic Conference',   'SIAC',                 'D2'),
  ('Rocky Mountain Athletic Conference',             'RMAC',                 'D2'),
  ('Conference Carolinas',                           'Conference Carolinas', 'D2'),
  ('Gulf South Conference',                          'Gulf South',           'D2'),
  ('Great Midwest Athletic Conference',              'G-MAC',                'D2'),
  ('Central Intercollegiate Athletic Association',   'CIAA',                 'D2'),
  ('Peach Belt Conference',                          'Peach Belt',           'D2'),
  ('Northeast-10 Conference',                        'NE10',                 'D2'),
  ('Great Lakes Intercollegiate Athletic Conference','GLIAC',                'D2')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- Seed aliases: canonical name per conference
-- ============================================================
INSERT INTO conference_aliases (conference_id, alias)
SELECT c.id, c.name
FROM conferences c
ON CONFLICT (alias) DO NOTHING;

-- Seed aliases: short_name per conference (where different from canonical name)
INSERT INTO conference_aliases (conference_id, alias)
SELECT c.id, c.short_name
FROM conferences c
WHERE c.short_name IS NOT NULL
  AND c.short_name <> c.name
ON CONFLICT (alias) DO NOTHING;

-- Additional aliases
INSERT INTO conference_aliases (conference_id, alias)
SELECT c.id, extra.alias
FROM conferences c
JOIN (VALUES
  ('Big 12 Conference',                        'Big XII'),
  ('Big 12 Conference',                        'Big Twelve'),
  ('Big 12 Conference',                        'B12'),
  ('Southeastern Conference',                  'Southeastern'),
  ('American Athletic Conference',             'AAC Indoor'),
  ('Coastal Athletic Association',             'CAA Indoor'),
  ('Coastal Athletic Association',             'Coastal Athletic'),
  ('Metro Atlantic Athletic Conference',       'MAAC Indoor'),
  ('Mid-American Conference',                  'MAC Indoor'),
  ('Northeast Conference',                     'NEC Indoor'),
  ('Ohio Valley Conference',                   'OVC Indoor'),
  ('Western Athletic Conference',              'WAC Indoor'),
  ('Southeastern Conference',                  'SEC Indoor'),
  ('Atlantic Coast Conference',                'ACC Indoor'),
  ('Atlantic 10 Conference',                   'Atlantic 10'),
  ('Mid-Eastern Athletic Conference',          'Mid-Eastern'),
  ('Missouri Valley Conference',               'MVC'),
  ('Mountain West Conference',                 'MWC'),
  ('Southwestern Athletic Conference',         'Southwestern Athletic'),
  ('Northeast-10 Conference',                  'NE-10'),
  ('Northeast-10 Conference',                  'Northeast-10')
) AS extra(conf_name, alias) ON c.name = extra.conf_name
ON CONFLICT (alias) DO NOTHING;

-- ============================================================
-- Backfill events.conference_id via ILIKE pattern matching
-- (mirrors 004_add_division.sql patterns, mapped to conference rows)
-- ============================================================

-- D1 conferences
UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'American Athletic Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%AAC Indoor%' OR name ILIKE '%American Athletic%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'ASUN Conference')
  WHERE conference_id IS NULL AND name ILIKE '%ASUN%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Atlantic 10 Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%Atlantic 10%' OR name ILIKE '% A10 %');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Atlantic Coast Conference')
  WHERE conference_id IS NULL AND name ILIKE '%ACC Indoor%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Big East Conference')
  WHERE conference_id IS NULL AND name ILIKE '%Big East%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Big Sky Conference')
  WHERE conference_id IS NULL AND name ILIKE '%Big Sky%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Big South Conference')
  WHERE conference_id IS NULL AND name ILIKE '%Big South%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Big Ten Conference')
  WHERE conference_id IS NULL AND name ILIKE '%Big Ten%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Big 12 Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%Big 12%' OR name ILIKE '%Big XII%' OR name ILIKE '%Big Twelve%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Coastal Athletic Association')
  WHERE conference_id IS NULL AND (name ILIKE '%CAA Indoor%' OR name ILIKE '%Coastal Athletic%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Conference USA')
  WHERE conference_id IS NULL AND (name ILIKE '%Conference USA%' OR name ILIKE '% CUSA %');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Horizon League')
  WHERE conference_id IS NULL AND name ILIKE '%Horizon League%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Ivy League')
  WHERE conference_id IS NULL AND name ILIKE '%Ivy League%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Metro Atlantic Athletic Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%MAAC Indoor%' OR name ILIKE '%Metro Atlantic%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Mid-American Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%MAC Indoor%' OR name ILIKE '%Mid-American%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Mid-Eastern Athletic Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%MEAC%' OR name ILIKE '%Mid-Eastern%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Missouri Valley Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%Missouri Valley%' OR name ILIKE '% MVC %');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Mountain West Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%Mountain West%' OR name ILIKE '% MWC %');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Northeast Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%NEC Indoor%' OR name ILIKE '%Northeast Conference%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Ohio Valley Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%OVC Indoor%' OR name ILIKE '%Ohio Valley%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Patriot League')
  WHERE conference_id IS NULL AND name ILIKE '%Patriot League%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Southeastern Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%SEC Indoor%' OR name ILIKE '%Southeastern Conference%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Southern Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%SoCon%' OR name ILIKE '%Southern Conference%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Southland Conference')
  WHERE conference_id IS NULL AND name ILIKE '%Southland%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Summit League')
  WHERE conference_id IS NULL AND name ILIKE '%Summit League%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Sun Belt Conference')
  WHERE conference_id IS NULL AND name ILIKE '%Sun Belt%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Southwestern Athletic Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%SWAC%' OR name ILIKE '%Southwestern Athletic%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Western Athletic Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%WAC Indoor%' OR name ILIKE '%Western Athletic%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'America East Conference')
  WHERE conference_id IS NULL AND name ILIKE '%America East%';

-- D2 conferences
UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Northern Sun Intercollegiate Conference')
  WHERE conference_id IS NULL AND name ILIKE '%NSIC%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Great Northwest Athletic Conference')
  WHERE conference_id IS NULL AND name ILIKE '%GNAC%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Southern Intercollegiate Athletic Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%SIAC %' OR name ILIKE '%SIAC%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Rocky Mountain Athletic Conference')
  WHERE conference_id IS NULL AND name ILIKE '%RMAC%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Conference Carolinas')
  WHERE conference_id IS NULL AND name ILIKE '%Conference Carolinas%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Gulf South Conference')
  WHERE conference_id IS NULL AND name ILIKE '%Gulf South%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Great Midwest Athletic Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%G-MAC%' OR name ILIKE '%Great Midwest%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Central Intercollegiate Athletic Association')
  WHERE conference_id IS NULL AND name ILIKE '%CIAA%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Peach Belt Conference')
  WHERE conference_id IS NULL AND name ILIKE '%Peach Belt%';

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Northeast-10 Conference')
  WHERE conference_id IS NULL AND (name ILIKE '%NE10%' OR name ILIKE '%Northeast-10%' OR name ILIKE '%NE-10%');

UPDATE events SET conference_id = (SELECT id FROM conferences WHERE name = 'Great Lakes Intercollegiate Athletic Conference')
  WHERE conference_id IS NULL AND name ILIKE '%GLIAC%';

-- Normalize distance strings to canonical forms
-- Track: 800m, 1500m, Mile, 3000m, 5000m, 10,000m
-- XC: 5K, 8K, 10K
-- Relays: DMR, 4xMile

-- Fix case variations
UPDATE events SET distance = 'Mile' WHERE lower(distance) = 'mile' AND distance != 'Mile';
UPDATE events SET distance = '800m' WHERE distance IN ('800', '800M');
UPDATE events SET distance = '1500m' WHERE distance IN ('1500', '1500M');
UPDATE events SET distance = '3000m' WHERE distance IN ('3000', '3000M');
UPDATE events SET distance = '5000m' WHERE distance IN ('5000', '5,000', '5000M');
UPDATE events SET distance = '10,000m' WHERE distance IN ('10000', '10,000', '10000m', '10000M');
UPDATE events SET distance = '5K' WHERE distance = '5k';
UPDATE events SET distance = '8K' WHERE distance = '8k';
UPDATE events SET distance = '10K' WHERE distance = '10k';

-- Delete out-of-scope events (cascades to results → splits via FK)
DELETE FROM events
WHERE distance NOT IN (
  '800m', '1500m', 'Mile', '3000m', '5000m', '10,000m',
  '5K', '8K', '10K',
  'DMR', '4xMile'
);

-- Add check constraint to prevent future out-of-scope inserts
ALTER TABLE events ADD CONSTRAINT chk_allowed_distance
  CHECK (distance IN (
    '800m', '1500m', 'Mile', '3000m', '5000m', '10,000m',
    '5K', '8K', '10K',
    'DMR', '4xMile'
  ));

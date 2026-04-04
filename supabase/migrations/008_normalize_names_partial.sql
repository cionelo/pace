-- Normalize athlete names where parts of the name are still ALL-CAPS
-- Migration 007 handled names that were entirely uppercase.
-- This handles mixed cases like "SMITH Jane" or "Jane SMITH" or "FIRSTNAME LASTNAME"
-- where individual words are all uppercase but the full name is not (case-insensitive).

-- Step 1: Update names where any individual word is all-uppercase (len >= 2)
-- and the full name is NOT already all-lowercase or title-cased.
-- We use a word-boundary regex: split on spaces, check if any word is all-caps.

-- First identify and merge duplicates that would result from title-casing:
-- If "JANE Smith" normalizes to "Jane Smith" and "Jane Smith" already exists,
-- we must re-point results before deleting the duplicate.

DO $$
DECLARE
  dup RECORD;
BEGIN
  FOR dup IN
    SELECT d.id AS dup_id, k.id AS keeper_id
    FROM athletes d
    JOIN athletes k
      ON initcap(d.name) = k.name
      AND d.team_id IS NOT DISTINCT FROM k.team_id
      AND k.id != d.id
    -- Catch names that aren't all-caps (handled by 007) but have all-caps words
    WHERE d.name ~ '[A-Z]{2,}'         -- contains a run of 2+ uppercase letters
      AND d.name != upper(d.name)      -- not already all-caps (007 handled those)
      AND d.name != initcap(d.name)    -- not already title-cased
  LOOP
    -- Re-point results that won't create a uniqueness conflict
    UPDATE results SET athlete_id = dup.keeper_id
    WHERE athlete_id = dup.dup_id
      AND NOT EXISTS (
        SELECT 1 FROM results r2
        WHERE r2.athlete_id = dup.keeper_id
          AND r2.event_id = results.event_id
      );

    -- Drop remaining results (keeper already has one for this event)
    DELETE FROM results WHERE athlete_id = dup.dup_id;

    -- Delete the orphaned duplicate athlete
    DELETE FROM athletes WHERE id = dup.dup_id;
  END LOOP;
END $$;

-- Step 2: Title-case remaining names that have all-caps words
-- but are not pure all-caps (those were handled by 007)
UPDATE athletes
SET name = initcap(name)
WHERE name ~ '[A-Z]{2,}'          -- contains a run of 2+ uppercase letters
  AND name != upper(name)         -- not already all-caps
  AND name != initcap(name);      -- not already title-cased

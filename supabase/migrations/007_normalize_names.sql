-- Title-case athlete names that are ALL CAPS
-- initcap() converts "JOHN SMITH" → "John Smith"
--
-- Edge case: "UTAH" (team X) and "Utah" (team X) both exist.
-- Must merge results before deleting the duplicate, and handle
-- cases where both have results for the same event.

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
    WHERE d.name = upper(d.name)
      AND d.name != initcap(d.name)
  LOOP
    -- Re-point results that won't conflict
    UPDATE results SET athlete_id = dup.keeper_id
    WHERE athlete_id = dup.dup_id
      AND NOT EXISTS (
        SELECT 1 FROM results r2
        WHERE r2.athlete_id = dup.keeper_id
          AND r2.event_id = results.event_id
      );

    -- Delete remaining results (keeper already has one for that event)
    DELETE FROM results WHERE athlete_id = dup.dup_id;

    -- Delete the orphaned duplicate athlete
    DELETE FROM athletes WHERE id = dup.dup_id;
  END LOOP;
END $$;

-- Now safely rename remaining ALL-CAPS names (no collisions possible)
UPDATE athletes
SET name = initcap(name)
WHERE name = upper(name)
  AND name != initcap(name);

-- Normalize event name whitespace (collapse double spaces, trim)
UPDATE events
SET name = regexp_replace(trim(name), '\s+', ' ', 'g')
WHERE name != regexp_replace(trim(name), '\s+', ' ', 'g');

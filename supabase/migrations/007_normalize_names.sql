-- Title-case athlete names that are ALL CAPS
-- initcap() converts "JOHN SMITH" → "John Smith"
-- Only apply to names where EVERY letter is uppercase (avoid touching "Jane McSmith")
UPDATE athletes
SET name = initcap(name)
WHERE name = upper(name)
  AND name != initcap(name);

-- Normalize event name whitespace (collapse double spaces, trim)
UPDATE events
SET name = regexp_replace(trim(name), '\s+', ' ', 'g')
WHERE name != regexp_replace(trim(name), '\s+', ' ', 'g');

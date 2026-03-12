-- Add source_url to events (link back to the timing system results page)
ALTER TABLE events ADD COLUMN IF NOT EXISTS source_url text;

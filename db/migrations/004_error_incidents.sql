ALTER TABLE events ADD COLUMN occurrence_count INTEGER NOT NULL DEFAULT 1
  CHECK (occurrence_count >= 1);

ALTER TABLE events ADD COLUMN last_occurred_at TEXT;

UPDATE events
SET last_occurred_at = created_at
WHERE last_occurred_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_events_open_incident
  ON events(event_type, source, resolved_at, last_occurred_at DESC);

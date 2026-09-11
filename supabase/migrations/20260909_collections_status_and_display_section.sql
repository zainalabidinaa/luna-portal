-- Add publish-gate and rows/hub display fields to collections.
-- Referenced by src/types/index.ts (Collection.status / display_section)
-- and the home-organizer edge function, but the migration that created
-- these columns was never committed — this backfills the tracked schema
-- to match what's already live. Written defensively (IF NOT EXISTS / guarded
-- constraint adds) since the columns may already exist in the live database
-- from the untracked change; no data is touched here.
ALTER TABLE collections ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE collections ADD COLUMN IF NOT EXISTS display_section TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collections_status_check'
  ) THEN
    ALTER TABLE collections ADD CONSTRAINT collections_status_check CHECK (status IN ('draft', 'published'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'collections_display_section_check'
  ) THEN
    ALTER TABLE collections ADD CONSTRAINT collections_display_section_check CHECK (display_section IS NULL OR display_section IN ('rows', 'hub'));
  END IF;
END $$;

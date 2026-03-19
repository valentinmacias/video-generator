-- ============================================================
-- Symphony Video Creator — Supabase Migration 001
-- Run this in the Supabase SQL Editor (Project → SQL Editor → New Query).
-- Safe to run multiple times (IF NOT EXISTS / DO blocks guard every change).
-- ============================================================

-- ── avatars table additions ────────────────────────────────────────────────

-- Store the Nano Banana reference image for the avatar
ALTER TABLE avatars
  ADD COLUMN IF NOT EXISTS nano_reference_image TEXT;

COMMENT ON COLUMN avatars.nano_reference_image IS
  'HTTPS URL of the Nano Banana edited reference image for this avatar';

-- ── videos table additions ─────────────────────────────────────────────────

-- External provider job ID (Runway task ID or Veo operation name)
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS symphony_job_id TEXT;

COMMENT ON COLUMN videos.symphony_job_id IS
  'Symphony provider job ID — "runway:taskId" or Veo operation name';

-- Which AI model was used for this Symphony generation
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS model_used TEXT;

COMMENT ON COLUMN videos.model_used IS
  'Model used for generation: "runway" | "veo" | "kling" | "imagen" etc.';

-- URL of the Nano Banana edited reference image used as conditioning frame
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS nano_reference_url TEXT;

COMMENT ON COLUMN videos.nano_reference_url IS
  'GCS / HTTPS URL of the Nano Banana edited image used as the video start frame';

-- ── mode column (backfill existing rows) ──────────────────────────────────
-- Add mode column if it doesn't exist (some deployments may be missing it)
ALTER TABLE videos
  ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'video';

-- Backfill: rows that already exist and have a video_url are videos
UPDATE videos SET mode = 'video' WHERE mode IS NULL;

-- ── indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS videos_model_used_idx
  ON videos (model_used)
  WHERE model_used IS NOT NULL;

CREATE INDEX IF NOT EXISTS videos_symphony_job_id_idx
  ON videos (symphony_job_id)
  WHERE symphony_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS avatars_nano_reference_idx
  ON avatars (nano_reference_image)
  WHERE nano_reference_image IS NOT NULL;

-- ── Verify ─────────────────────────────────────────────────────────────────
-- Run this SELECT to confirm the columns were added successfully:
--
-- SELECT column_name, data_type, is_nullable
-- FROM   information_schema.columns
-- WHERE  table_name IN ('videos', 'avatars')
--   AND  column_name IN (
--          'symphony_job_id', 'model_used', 'nano_reference_url',
--          'nano_reference_image', 'mode'
--        )
-- ORDER BY table_name, column_name;

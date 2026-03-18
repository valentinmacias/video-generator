-- ============================================================
-- Video Brand Generator — Supabase Schema
-- Run this in the Supabase SQL Editor to set up your database.
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── brands ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS brands (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    name             TEXT        NOT NULL,
    style_guide      TEXT,
    reference_images TEXT[]      NOT NULL DEFAULT '{}',
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── videos ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS videos (
    id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id         UUID        REFERENCES brands(id) ON DELETE SET NULL,
    user_prompt      TEXT        NOT NULL,
    enhanced_prompt  TEXT,
    operation_id     TEXT,                                   -- Google LRO name
    status           TEXT        NOT NULL DEFAULT 'PENDING'
                                 CHECK (status IN ('PENDING','PROCESSING','COMPLETED','FAILED')),
    video_url        TEXT,                                   -- GCS URI (gs://)
    thumbnail_url    TEXT,
    error_message    TEXT,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── Auto-update updated_at ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER videos_updated_at
    BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Indexes ────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS videos_brand_id_idx     ON videos (brand_id);
CREATE INDEX IF NOT EXISTS videos_status_idx       ON videos (status);
CREATE INDEX IF NOT EXISTS videos_operation_id_idx ON videos (operation_id) WHERE operation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS videos_created_at_idx   ON videos (created_at DESC);

-- ── avatars ───────────────────────────────────────────────────────────────────
-- Stores both curated library avatars and custom-trained AI Creators.

CREATE TABLE IF NOT EXISTS avatars (
    id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
    name                TEXT        NOT NULL,
    description         TEXT,
    image_url           TEXT,
    status              TEXT        NOT NULL DEFAULT 'TRAINING'
                                    CHECK (status IN ('TRAINING','READY','FAILED')),
    training_progress   INT         NOT NULL DEFAULT 0,
    model_provider      TEXT        NOT NULL DEFAULT 'runway',
    character_id        TEXT,       -- Runway Character ID
    custom_model_id     TEXT,       -- Runway fine-tuned Gen-4.5 model ID
    training_job_id     TEXT,       -- Runway training job ID (for polling)
    voice_clone_enabled BOOLEAN     NOT NULL DEFAULT FALSE,
    product_locked      BOOLEAN     NOT NULL DEFAULT FALSE,
    tags                TEXT[]      NOT NULL DEFAULT '{}',
    gender              TEXT,
    age                 TEXT,
    gesture             TEXT,
    background          TEXT,
    is_custom           BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ DEFAULT NOW(),
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER avatars_updated_at
    BEFORE UPDATE ON avatars
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE INDEX IF NOT EXISTS avatars_status_idx      ON avatars (status);
CREATE INDEX IF NOT EXISTS avatars_is_custom_idx   ON avatars (is_custom);
CREATE INDEX IF NOT EXISTS avatars_created_at_idx  ON avatars (created_at DESC);

-- ── Row Level Security (optional, enable for multi-tenant) ─────────────────
-- ALTER TABLE brands ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE videos ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE avatars ENABLE ROW LEVEL SECURITY;

-- Design Validation Module — Database Schema
-- Run this against your PostgreSQL database to create the required tables.
-- Safe to re-run: uses IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS design_validations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    figma_url VARCHAR(1000) DEFAULT '',
    app_url VARCHAR(1000) DEFAULT '',
    status VARCHAR(50) DEFAULT 'pending',
    overall_score FLOAT,
    summary TEXT DEFAULT '',
    figma_video_path VARCHAR(500) DEFAULT '',
    app_video_path VARCHAR(500) DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS validation_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    validation_id UUID NOT NULL REFERENCES design_validations(id) ON DELETE CASCADE,
    page_name VARCHAR(255) NOT NULL,
    figma_image_path VARCHAR(500) DEFAULT '',
    app_image_path VARCHAR(500) DEFAULT '',
    compliance_score FLOAT,
    findings TEXT DEFAULT '',
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration: add video columns if upgrading from older version
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'design_validations' AND column_name = 'figma_video_path'
    ) THEN
        ALTER TABLE design_validations ADD COLUMN figma_video_path VARCHAR(500) DEFAULT '';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'design_validations' AND column_name = 'app_video_path'
    ) THEN
        ALTER TABLE design_validations ADD COLUMN app_video_path VARCHAR(500) DEFAULT '';
    END IF;
END $$;

-- Migration 007: Hosted Exit Forms, Versioning, and Company Onboarding
-- Expands company profiles with branding & onboarding progress,
-- introduces template version history, and prepares native hosted feedback responses.

-- 1. Expand hr_company_profiles for comprehensive company onboarding & dynamic branding
ALTER TABLE hr_company_profiles
  ADD COLUMN IF NOT EXISTS industry VARCHAR(100),
  ADD COLUMN IF NOT EXISTS company_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS company_phone VARCHAR(50),
  ADD COLUMN IF NOT EXISTS country VARCHAR(100),
  ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS brand_primary_color VARCHAR(50) DEFAULT '#59424f',
  ADD COLUMN IF NOT EXISTS display_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS setup_completed BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS setup_step INTEGER DEFAULT 1;

-- 2. Create hr_exit_interview_template_versions for immutable published version snapshots
CREATE TABLE IF NOT EXISTS hr_exit_interview_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES hr_exit_interview_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  schema_json JSONB NOT NULL,
  change_summary TEXT,
  published_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  published_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_exit_template_version UNIQUE(template_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_exit_template_versions_template 
  ON hr_exit_interview_template_versions(template_id, version_number DESC);

-- 3. Link invitations to specific immutable template versions
ALTER TABLE hr_exit_interviews
  ADD COLUMN IF NOT EXISTS template_version_id UUID REFERENCES hr_exit_interview_template_versions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_exit_interviews_template_version 
  ON hr_exit_interviews(template_version_id);

-- 4. Enrich hr_exit_interview_responses with complete answers JSON and submission metadata
ALTER TABLE hr_exit_interview_responses
  ADD COLUMN IF NOT EXISTS answers_json JSONB,
  ADD COLUMN IF NOT EXISTS submission_metadata JSONB;

-- 5. Backfill template versions for any existing templates without version records
DO $$
DECLARE
  tmpl RECORD;
  ver_count INT;
BEGIN
  FOR tmpl IN SELECT id, version, schema_json, updated_at FROM hr_exit_interview_templates LOOP
    SELECT COUNT(*) INTO ver_count FROM hr_exit_interview_template_versions WHERE template_id = tmpl.id;
    IF ver_count = 0 THEN
      INSERT INTO hr_exit_interview_template_versions (template_id, version_number, schema_json, published_at, created_at)
      VALUES (tmpl.id, tmpl.version, tmpl.schema_json, tmpl.updated_at, tmpl.updated_at)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;


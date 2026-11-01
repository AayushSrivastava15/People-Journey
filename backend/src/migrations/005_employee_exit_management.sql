-- Employee exit interviews. This migration is intentionally not applied automatically.
ALTER TABLE hr_company_profiles ADD COLUMN IF NOT EXISTS logo_url TEXT;

CREATE TABLE IF NOT EXISTS hr_exit_interview_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  schema_json JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_system_template BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((is_system_template AND owner_user_id IS NULL) OR (NOT is_system_template AND owner_user_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_exit_templates_owner_active ON hr_exit_interview_templates(owner_user_id, is_active);
CREATE UNIQUE INDEX IF NOT EXISTS idx_exit_templates_system_name ON hr_exit_interview_templates(name) WHERE is_system_template;
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_employees_id_owner ON hr_employees(employee_id, owner_user_id);

CREATE TABLE IF NOT EXISTS hr_exit_interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  employee_id INTEGER NOT NULL REFERENCES hr_employees(employee_id) ON DELETE CASCADE,
  offboarding_id INTEGER REFERENCES hr_offboarding(offboarding_id) ON DELETE SET NULL,
  template_id UUID NOT NULL REFERENCES hr_exit_interview_templates(id) ON DELETE RESTRICT,
  template_snapshot JSONB NOT NULL,
  template_version INTEGER NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','OPENED','COMPLETED','REVOKED')),
  expires_at TIMESTAMPTZ NOT NULL,
  invitation_status VARCHAR(30) NOT NULL DEFAULT 'NOT_PREPARED' CHECK (invitation_status IN ('NOT_PREPARED','PREPARED','GMAIL_OPENED','SENT_UNCONFIRMED')),
  completed_at TIMESTAMPTZ,
  reopened_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  reopened_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_exit_employee_owner FOREIGN KEY(employee_id, owner_user_id) REFERENCES hr_employees(employee_id, owner_user_id) DEFERRABLE INITIALLY DEFERRED
);
CREATE INDEX IF NOT EXISTS idx_exit_interviews_owner_created ON hr_exit_interviews(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_exit_interviews_owner_employee ON hr_exit_interviews(owner_user_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_exit_interviews_expiry ON hr_exit_interviews(expires_at) WHERE status IN ('PENDING','OPENED');

CREATE TABLE IF NOT EXISTS hr_exit_interview_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  interview_id UUID NOT NULL REFERENCES hr_exit_interviews(id) ON DELETE CASCADE,
  submission_id UUID NOT NULL,
  question_id VARCHAR(200) NOT NULL,
  answer JSONB NOT NULL,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(submission_id, question_id)
);
CREATE INDEX IF NOT EXISTS idx_exit_responses_interview ON hr_exit_interview_responses(interview_id, submitted_at DESC);

CREATE TABLE IF NOT EXISTS hr_exit_interview_evaluations (
  interview_id UUID PRIMARY KEY REFERENCES hr_exit_interviews(id) ON DELETE CASCADE,
  interviewer_name VARCHAR(255),
  interview_date TIMESTAMPTZ,
  interview_mode VARCHAR(40),
  reason_category VARCHAR(100),
  regrettable_exit BOOLEAN,
  rehire_eligibility VARCHAR(40),
  hr_observations TEXT,
  action_items JSONB NOT NULL DEFAULT '[]'::jsonb,
  hr_signature TEXT,
  updated_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO hr_exit_interview_templates(name, description, version, schema_json, is_active, is_default, is_system_template)
VALUES
('Infravision Exit Interview', 'Comprehensive exit interview covering role, culture, management, and transition.', 1,
 '{"introduction":"Thank you for sharing your experience. Your feedback helps us improve.","sections":[{"id":"experience","title":"Your experience","questions":[{"id":"reason","type":"textarea","label":"What is the primary reason for your departure?","required":true},{"id":"recommend","type":"rating","label":"How likely are you to recommend this company as a place to work?","required":true,"min":1,"max":5},{"id":"improvements","type":"textarea","label":"What could we have done to improve your experience?","required":false}]}]}'::jsonb, TRUE, TRUE, TRUE),
('Quick Pulse', 'A short exit interview for fast, focused feedback.', 1,
 '{"introduction":"Please share a few quick thoughts about your experience.","sections":[{"id":"pulse","title":"Quick feedback","questions":[{"id":"reason","type":"textarea","label":"Why are you leaving?","required":true},{"id":"rating","type":"rating","label":"Overall, how was your experience?","required":true,"min":1,"max":5}]}]}'::jsonb, TRUE, FALSE, TRUE)
ON CONFLICT (name) WHERE is_system_template DO UPDATE SET
  description = EXCLUDED.description,
  version = EXCLUDED.version,
  schema_json = EXCLUDED.schema_json,
  is_active = TRUE,
  is_default = EXCLUDED.is_default,
  updated_at = CURRENT_TIMESTAMP;

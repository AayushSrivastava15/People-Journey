-- Migration 006: Google Forms Exit Feedback Workflow, URL Shortener, and Response Sync
-- Adds short_code, response_due_date, google_form_response_id, and raw_response_payload to hr_exit_interviews.
-- Updates exit interview email templates to feedback collection survey format.

-- 1. Extend hr_exit_interviews for Short URL & Google Forms integration
ALTER TABLE hr_exit_interviews
  ADD COLUMN IF NOT EXISTS short_code VARCHAR(32),
  ADD COLUMN IF NOT EXISTS response_due_date DATE,
  ADD COLUMN IF NOT EXISTS google_form_response_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS raw_response_payload JSONB;

-- 2. Indexes for short_code lookups and idempotent webhook response tracking
CREATE UNIQUE INDEX IF NOT EXISTS idx_exit_interviews_short_code
  ON hr_exit_interviews(short_code) WHERE short_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_exit_interviews_google_response_id
  ON hr_exit_interviews(google_form_response_id) WHERE google_form_response_id IS NOT NULL;

-- 3. Backfill short_code for any existing records lacking one
UPDATE hr_exit_interviews
SET short_code = SUBSTRING(encode(digest(id::text || created_at::text, 'sha256'), 'hex') FROM 1 FOR 8)
WHERE short_code IS NULL;

-- 4. Ensure hr_exit_interview_responses can store long Google Form question titles
ALTER TABLE hr_exit_interview_responses
  ALTER COLUMN question_id TYPE TEXT;

-- 5. Redesign Exit Interview Email Templates (Category: exit_interview)

-- Template 1: Exit Interview Invitation
UPDATE hr_email_templates
SET
  subject_template = 'Exit Feedback Form | {{company_name}}',
  description = 'Invite departing employee to complete the Exit Feedback Form.',
  body_template = E'Dear {{employee_first_name}},\n\nAs part of your offboarding process at {{company_name}}, we would appreciate your feedback about your experience working with us.\n\nYour feedback will help us understand your experience, identify areas for improvement, and make our workplace better for future employees.\n\nPlease take a few minutes to complete the Exit Feedback Form using the link below:\n\n{{exit_interview_link}}\n\nResponse Due Date: {{response_due_date}}\n\nWe genuinely appreciate your time and honest feedback.\n\nBest regards,\n{{hr_contact_name}}\nHR Team\n{{company_name}}\n{{hr_contact_email}}',
  updated_at = CURRENT_TIMESTAMP
WHERE is_system_template = TRUE AND name = 'Exit Interview Invitation';

-- Template 2: Exit Interview Reminder
UPDATE hr_email_templates
SET
  subject_template = 'Reminder: Please Complete Your Exit Feedback Form | {{company_name}}',
  description = 'Gentle reminder to complete the Exit Feedback Form before the due date.',
  body_template = E'Dear {{employee_first_name}},\n\nThis is a gentle reminder to complete your Exit Feedback Form as part of your offboarding process at {{company_name}}.\n\nYour feedback is valuable to us and will help improve the employee experience.\n\nYou can access the form using the link below:\n\n{{exit_interview_link}}\n\nResponse Due Date: {{response_due_date}}\n\nThank you for your time and contribution.\n\nBest regards,\n{{hr_contact_name}}\nHR Team\n{{company_name}}',
  updated_at = CURRENT_TIMESTAMP
WHERE is_system_template = TRUE AND name = 'Exit Interview Reminder';

-- Template 3: Exit Feedback Follow-up (Rename/update 'Thank You Post-Exit Interview' or insert if not present)
UPDATE hr_email_templates
SET
  name = 'Exit Feedback Follow-up',
  description = 'Follow-up regarding completion of the Exit Feedback Form.',
  subject_template = 'Follow-up: Exit Feedback Form | {{company_name}}',
  body_template = E'Dear {{employee_first_name}},\n\nWe would like to follow up on your Exit Feedback Form.\n\nWe would appreciate it if you could share your experience with {{company_name}} by completing the form below.\n\n{{exit_interview_link}}\n\nYour feedback is important to us.\n\nBest regards,\n{{hr_contact_name}}\nHR Team\n{{company_name}}',
  updated_at = CURRENT_TIMESTAMP
WHERE is_system_template = TRUE AND (name = 'Thank You Post-Exit Interview' OR name = 'Exit Feedback Follow-up');

-- Ensure Template 3 exists if neither was found
INSERT INTO hr_email_templates (
  name,
  category,
  description,
  subject_template,
  body_template,
  is_active,
  is_system_template
)
VALUES (
  'Exit Feedback Follow-up',
  'exit_interview',
  'Follow-up regarding completion of the Exit Feedback Form.',
  'Follow-up: Exit Feedback Form | {{company_name}}',
  E'Dear {{employee_first_name}},\n\nWe would like to follow up on your Exit Feedback Form.\n\nWe would appreciate it if you could share your experience with {{company_name}} by completing the form below.\n\n{{exit_interview_link}}\n\nYour feedback is important to us.\n\nBest regards,\n{{hr_contact_name}}\nHR Team\n{{company_name}}',
  TRUE,
  TRUE
)
ON CONFLICT (name) WHERE is_system_template = TRUE DO UPDATE SET
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  subject_template = EXCLUDED.subject_template,
  body_template = EXCLUDED.body_template,
  is_active = TRUE,
  updated_at = CURRENT_TIMESTAMP;


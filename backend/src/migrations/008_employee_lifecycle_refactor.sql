-- Migration 008: Employee Lifecycle Refactor & Dynamic Workflows
-- Adds explicit last_working_day, personal_email, exit_reason, exit_notes to hr_employees
-- Backfills last_working_day for offboarding employees
-- Seeds core lifecycle email templates

-- 1. Extend hr_employees table
ALTER TABLE hr_employees
  ADD COLUMN IF NOT EXISTS last_working_day DATE,
  ADD COLUMN IF NOT EXISTS personal_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS exit_reason VARCHAR(500),
  ADD COLUMN IF NOT EXISTS exit_notes TEXT;

-- 2. Backfill last_working_day for currently offboarding employees
UPDATE hr_employees
SET last_working_day = exit_date
WHERE UPPER(employment_status) = 'OFFBOARDING'
  AND last_working_day IS NULL
  AND exit_date IS NOT NULL;

-- 3. Optimization indexes
CREATE INDEX IF NOT EXISTS idx_hr_employees_owner_status 
  ON hr_employees(owner_user_id, employment_status);

CREATE INDEX IF NOT EXISTS idx_hr_employees_owner_lwd 
  ON hr_employees(owner_user_id, last_working_day);

-- 4. Seed core lifecycle email templates if not already existing
INSERT INTO hr_email_templates (
  name, 
  category, 
  description, 
  subject_template, 
  body_template, 
  is_active, 
  is_system_template
)
VALUES
  (
    'Employee Onboarding / Welcome Email',
    'onboarding',
    'Welcome new hire with key reporting details, first day expectations, and initial orientation plan.',
    'Welcome to {{company_name}}, {{employee_first_name}}!',
    E'Dear {{employee_first_name}},\n\nWelcome to the {{company_name}} family! We are delighted to have you join our {{department_name}} team as {{job_title}}.\n\nYour first day will be {{joining_date}}.\nReporting Location / Format: {{office_location}}\nHR Point of Contact: {{hr_contact_name}} ({{hr_contact_email}})\n\nPlease find your preliminary onboarding schedule and first-week roadmap attached. We have arranged your initial welcome session and team introductions.\n\nIf you have any questions before your start date, please do not hesitate to contact us.\n\nWarm regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Active Employee / Employment Confirmation',
    'lifecycle',
    'Confirmation of active employment standing and organizational placement.',
    'Employment Confirmation: {{employee_first_name}} {{employee_last_name}} - {{company_name}}',
    E'Dear {{employee_first_name}},\n\nThis communication confirms your active employment with {{company_name}} in the role of {{job_title}}, within the {{department_name}} department, effective since {{joining_date}}.\n\nYour employee code is {{employee_code}}. You may reference this communication or reach out to HR at {{hr_contact_email}} should you require employment verification or assistance.\n\nThank you for your ongoing contributions to {{company_name}}.\n\nBest regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Employee Offboarding Notification',
    'offboarding',
    'Official offboarding notification detailing handover steps, asset return, and final working day coordination.',
    'Offboarding Notification & Departure Formalities - {{employee_first_name}} {{employee_last_name}}',
    E'Dear {{employee_first_name}},\n\nThis message outlines the offboarding procedures and key dates regarding your departure from {{company_name}}.\n\nYour scheduled last working day is {{last_working_day}}.\n\nPlease review the following offboarding touchpoints to ensure a seamless transition:\n1. Knowledge handover to your manager ({{manager_name}}) and team.\n2. Return of company-issued equipment and assets before {{last_working_day}}.\n3. IT access revocation and account wrap-up.\n4. Confidential exit feedback session.\n5. Final payroll settlement and formal relieving documentation.\n\nIf you have any questions regarding your transition formalities, please reach out to {{hr_contact_name}} at {{hr_contact_email}}.\n\nWe thank you for your contributions and wish you every success in your future endeavors.\n\nSincerely,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  ),
  (
    'Employee Exit Confirmation',
    'offboarding',
    'Final clearance confirmation following completion of an employee exit.',
    'Relieving and Exit Confirmation - {{employee_first_name}} {{employee_last_name}}',
    E'Dear {{employee_first_name}},\n\nThis confirms that your exit formalities with {{company_name}} have been completed as of {{exit_date}}.\n\nAll departmental clearances, company asset returns, and handover protocols have been verified.\n\nYour final settlement documents and service certificate have been processed. Should you require further correspondence or documentation in the future, you may contact our HR team at {{hr_contact_email}}.\n\nWe appreciate the dedication you showed during your tenure at {{company_name}} and wish you the very best in your career.\n\nWarm regards,\n{{sender_name}}\n{{company_name}}',
    TRUE,
    TRUE
  )
ON CONFLICT DO NOTHING;


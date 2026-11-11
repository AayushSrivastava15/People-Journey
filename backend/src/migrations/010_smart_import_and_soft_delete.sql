-- Migration 010: Smart Employee Import History & Soft Deletion
-- 1. Adds deleted_at to hr_employees for non-destructive soft deletion.
-- 2. Adds saved_import_mappings to hr_company_profiles for workspace-specific column memory.
-- 3. Creates lightweight hr_employee_import_history for tracking import jobs and error summaries.
-- 4. Grants least-privilege DML to runtime role people_journey_app.

-- 1. Employee Soft Deletion
ALTER TABLE hr_employees 
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_hr_employees_owner_deleted 
  ON hr_employees(owner_user_id, deleted_at);

-- 2. Workspace Column Mapping Persistence
ALTER TABLE hr_company_profiles 
  ADD COLUMN IF NOT EXISTS saved_import_mappings JSONB DEFAULT '{}'::jsonb;

-- 3. Lightweight Import History (Metadata only - zero raw file or redundant employee storage)
CREATE TABLE IF NOT EXISTS hr_employee_import_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES app_users(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  uploaded_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
  total_records INTEGER NOT NULL DEFAULT 0,
  imported_records INTEGER NOT NULL DEFAULT 0,
  skipped_records INTEGER NOT NULL DEFAULT 0,
  failed_records INTEGER NOT NULL DEFAULT 0,
  duplicate_records INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(50) NOT NULL DEFAULT 'COMPLETED', -- 'COMPLETED', 'FAILED', 'PARTIAL'
  error_summary JSONB DEFAULT '[]'::jsonb,
  status_breakdown JSONB DEFAULT '{}'::jsonb,
  column_mapping JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_import_history_owner 
  ON hr_employee_import_history(owner_user_id, created_at DESC);

-- 4. Grant runtime role permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE hr_employee_import_history TO people_journey_app;


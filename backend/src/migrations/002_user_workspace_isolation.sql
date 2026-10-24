-- Migration 002: User Workspace Ownership & Data Isolation
-- Adds workspace ownership to employees, departments, designations, and offboarding workflows.

-- 1. hr_employees ownership
ALTER TABLE hr_employees
    ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;

-- If created_by exists, backfill owner_user_id for legacy safety
UPDATE hr_employees
SET owner_user_id = created_by
WHERE owner_user_id IS NULL AND created_by IS NOT NULL;

-- Drop global unique employee_code index and recreate as scoped per workspace owner
ALTER TABLE hr_employees DROP CONSTRAINT IF EXISTS hr_employees_employee_code_key;
DROP INDEX IF EXISTS idx_hr_employees_code;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_employees_owner_code 
    ON hr_employees(owner_user_id, LOWER(employee_code)) 
    WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_hr_employees_owner_user_id 
    ON hr_employees(owner_user_id);

-- 2. hr_offboarding ownership
ALTER TABLE hr_offboarding
    ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;

UPDATE hr_offboarding o
SET owner_user_id = e.owner_user_id
FROM hr_employees e
WHERE o.employee_id = e.employee_id AND o.owner_user_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_hr_offboarding_owner_user_id 
    ON hr_offboarding(owner_user_id);

-- 3. hr_departments user-defined additions (NULL owner_user_id indicates system defaults)
ALTER TABLE hr_departments
    ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_hr_departments_owner_user_id 
    ON hr_departments(owner_user_id);

-- 4. hr_designations user-defined additions (NULL owner_user_id indicates system defaults)
ALTER TABLE hr_designations
    ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES app_users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_hr_designations_owner_user_id 
    ON hr_designations(owner_user_id);

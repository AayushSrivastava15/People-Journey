-- Migration 011: UUID-Based Unique Resource URL System for Employees
-- 1. Adds stable uuid column to hr_employees with default gen_random_uuid().
-- 2. Backfills any existing employees with secure unique UUIDs.
-- 3. Creates unique index on uuid for fast O(1) Lookups.
-- 4. Creates composite index on (owner_user_id, uuid) for tenant-isolated lookups.

-- 1. Add uuid column with default gen_random_uuid()
ALTER TABLE hr_employees 
  ADD COLUMN IF NOT EXISTS uuid UUID DEFAULT gen_random_uuid();

-- 2. Backfill existing records if any have null uuid
UPDATE hr_employees
  SET uuid = gen_random_uuid()
  WHERE uuid IS NULL;

-- 3. Enforce NOT NULL and UNIQUE constraint
ALTER TABLE hr_employees 
  ALTER COLUMN uuid SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_employees_uuid 
  ON hr_employees(uuid);

CREATE INDEX IF NOT EXISTS idx_hr_employees_owner_uuid 
  ON hr_employees(owner_user_id, uuid);

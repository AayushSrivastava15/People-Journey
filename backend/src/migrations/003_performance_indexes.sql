-- Migration 003: Performance Indexes for Personal Workspace & Dashboard Queries
-- Optimizes filtered lookups, sorts, and aggregations scoped by owner_user_id.

-- 1. Optimize filtering by status within an owner's workspace
CREATE INDEX IF NOT EXISTS idx_hr_employees_owner_status 
    ON hr_employees(owner_user_id, employment_status);

-- 2. Optimize default listing sort (created_at DESC) for owner's workspace
CREATE INDEX IF NOT EXISTS idx_hr_employees_owner_created_at 
    ON hr_employees(owner_user_id, created_at DESC);

-- 3. Optimize joining date range queries and monthly aggregations
CREATE INDEX IF NOT EXISTS idx_hr_employees_owner_hire_date 
    ON hr_employees(owner_user_id, hire_date);

-- 4. Optimize exit date range queries (sparse index for departing/exited personnel)
CREATE INDEX IF NOT EXISTS idx_hr_employees_owner_exit_date 
    ON hr_employees(owner_user_id, exit_date) 
    WHERE exit_date IS NOT NULL;

-- 5. Optimize audit logs user queries sorted by timestamp
CREATE INDEX IF NOT EXISTS idx_hr_audit_logs_owner_created 
    ON hr_audit_logs(user_id, created_at DESC);

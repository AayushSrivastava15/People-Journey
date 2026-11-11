-- Migration 009: Production-Ready RLS Infrastructure and Runtime Role Separation
-- Prepares the runtime application role 'people_journey_app', helper context functions,
-- and least-privilege DML permissions in preparation for Row Level Security (RLS).
--
-- STRICT PRODUCTION SAFETY RULES:
-- 1. Does not revoke postgres permissions (maintains backward compatibility until verified cutover).
-- 2. Does not enable strict blocking RLS policies yet (staged for Phase 3B).
-- 3. Isolates schema_migrations from runtime application access.

-- 1. Create or update restricted runtime application role
-- The role is created without a password. Password provisioning is a separate administrative
-- operation performed in staging/production via: ALTER ROLE people_journey_app WITH PASSWORD '...';
--
-- MANAGED POSTGRESQL (SUPABASE) COMPATIBILITY NOTE:
-- In Supabase managed PostgreSQL, the migration runner role ('postgres') has CREATEROLE but is not a
-- physical superuser. Attempting to run ALTER ROLE ... WITH NOBYPASSRLS / NOSUPERUSER will fail with
-- insufficient privilege. Therefore, non-privileged flags (NOSUPERUSER, NOCREATEDB, NOCREATEROLE,
-- NOINHERIT, NOBYPASSRLS) are declared strictly at initial creation and must be verified post-creation
-- via pg_roles inspection rather than runtime ALTER ROLE commands.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'people_journey_app') THEN
    CREATE ROLE people_journey_app WITH LOGIN
      NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
  END IF;
END $$;

-- 2. Grant database connection and public schema usage
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO people_journey_app', current_database());
END $$;

GRANT USAGE ON SCHEMA public TO people_journey_app;

-- 3. Create dedicated schema 'app' for session context helper functions
CREATE SCHEMA IF NOT EXISTS app;
GRANT USAGE ON SCHEMA app TO people_journey_app;

-- Helper: Retrieve current authenticated user UUID
CREATE OR REPLACE FUNCTION app.current_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.current_user_id', true), '')::UUID;
$$;

-- Helper: Retrieve current company/workspace UUID
CREATE OR REPLACE FUNCTION app.current_company_id()
RETURNS UUID
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.current_company_id', true), '')::UUID;
$$;

-- Helper: Retrieve current application role ('user', 'hr_staff', 'hr_admin', 'super_admin', 'anonymous_survey', 'auth_bootstrap')
CREATE OR REPLACE FUNCTION app.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(NULLIF(current_setting('app.current_user_role', true), ''), 'user');
$$;

-- Helper: Retrieve active survey short code for unauthenticated exit interviews
CREATE OR REPLACE FUNCTION app.current_short_code()
RETURNS TEXT
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('app.survey_short_code', true), '');
$$;

-- Helper: Check if current caller is super-admin
CREATE OR REPLACE FUNCTION app.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(current_setting('app.current_user_role', true) = 'super_admin', false);
$$;

GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA app TO people_journey_app;

-- 4. Grant least-privilege DML permissions on 15 application tables
-- Note: schema_migrations is intentionally EXCLUDED to prevent runtime tampering.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  app_users,
  hr_company_profiles,
  hr_departments,
  hr_designations,
  hr_employees,
  hr_offboarding,
  hr_audit_logs,
  user_notifications,
  hr_email_templates,
  hr_email_drafts,
  hr_exit_interview_templates,
  hr_exit_interview_template_versions,
  hr_exit_interviews,
  hr_exit_interview_responses,
  hr_exit_interview_evaluations
TO people_journey_app;

-- Explicitly ensure NO truncate, trigger, or DDL privileges are granted
REVOKE TRUNCATE, TRIGGER ON ALL TABLES IN SCHEMA public FROM people_journey_app;

-- Ensure schema_migrations is completely inaccessible to the application runtime role
REVOKE ALL ON TABLE schema_migrations FROM people_journey_app;

-- 5. Grant minimal sequence privileges for operational serial primary keys
-- Only USAGE and SELECT are granted (required for nextval() and currval() on insert).
-- UPDATE is withheld to prevent arbitrary sequence counter manipulation.
GRANT USAGE, SELECT ON SEQUENCE
  hr_departments_department_id_seq,
  hr_designations_designation_id_seq,
  hr_employees_employee_id_seq,
  hr_offboarding_offboarding_id_seq,
  hr_audit_logs_log_id_seq,
  user_notifications_id_seq
TO people_journey_app;

-- 6. Configure default privileges for future objects created by the migration role (postgres)
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO people_journey_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public 
  GRANT USAGE, SELECT ON SEQUENCES TO people_journey_app;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA app 
  GRANT EXECUTE ON FUNCTIONS TO people_journey_app;


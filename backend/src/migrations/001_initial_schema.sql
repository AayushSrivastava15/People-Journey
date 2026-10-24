-- 001_initial_schema.sql: Supabase PostgreSQL Schema for People Journey HR Portal

-- Extensions for UUID support
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Migration Tracking Table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(100) PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 1. App Users: Authoritative registry for authenticated users
CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    photo_url TEXT,
    role VARCHAR(50) NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'hr_staff', 'hr_admin')),
    account_status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'deactivated', 'suspended')),
    preferences JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_login_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_app_users_firebase_uid ON app_users(firebase_uid);
CREATE INDEX IF NOT EXISTS idx_app_users_email ON app_users(LOWER(email));

-- 2. Master Departments
CREATE TABLE IF NOT EXISTS hr_departments (
    department_id SERIAL PRIMARY KEY,
    department_name VARCHAR(100) UNIQUE NOT NULL,
    description VARCHAR(500),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 3. Master Designations
CREATE TABLE IF NOT EXISTS hr_designations (
    designation_id SERIAL PRIMARY KEY,
    designation_name VARCHAR(100) UNIQUE NOT NULL,
    description VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 4. Employee Profiles
CREATE TABLE IF NOT EXISTS hr_employees (
    employee_id SERIAL PRIMARY KEY,
    employee_code VARCHAR(50) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100),
    work_email VARCHAR(255),
    personal_email VARCHAR(255),
    phone VARCHAR(50),
    department_id INTEGER REFERENCES hr_departments(department_id) ON DELETE SET NULL,
    designation_id INTEGER REFERENCES hr_designations(designation_id) ON DELETE SET NULL,
    employment_status VARCHAR(50) NOT NULL DEFAULT 'ONBOARDING' CHECK (employment_status IN ('ONBOARDING', 'ACTIVE', 'OFFBOARDING', 'EXITED')),
    hire_date DATE NOT NULL,
    exit_date DATE,
    user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_employees_code ON hr_employees(employee_code);
CREATE INDEX IF NOT EXISTS idx_hr_employees_status ON hr_employees(employment_status);
CREATE INDEX IF NOT EXISTS idx_hr_employees_dept ON hr_employees(department_id);
CREATE INDEX IF NOT EXISTS idx_hr_employees_user_id ON hr_employees(user_id);
CREATE INDEX IF NOT EXISTS idx_hr_employees_work_email ON hr_employees(LOWER(work_email));

-- 5. Offboarding Workflow Records
CREATE TABLE IF NOT EXISTS hr_offboarding (
    offboarding_id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES hr_employees(employee_id) ON DELETE CASCADE,
    notice_date DATE NOT NULL,
    planned_exit_date DATE NOT NULL,
    exit_reason VARCHAR(500),
    clearance_status VARCHAR(50) NOT NULL DEFAULT 'PENDING' CHECK (clearance_status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    notes TEXT,
    contact_email VARCHAR(255),
    created_by UUID REFERENCES app_users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_offboarding_emp ON hr_offboarding(employee_id);

-- 6. Audit Trail
CREATE TABLE IF NOT EXISTS hr_audit_logs (
    log_id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES app_users(id) ON DELETE SET NULL,
    action_type VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_hr_audit_logs_user ON hr_audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_hr_audit_logs_created ON hr_audit_logs(created_at DESC);

-- 7. Personal User Notifications & Activities
CREATE TABLE IF NOT EXISTS user_notifications (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(50) NOT NULL DEFAULT 'info',
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_notifications_user ON user_notifications(user_id, is_read);

-- Seed Initial Default Departments if empty
INSERT INTO hr_departments (department_name, description, is_active)
VALUES
    ('Product', 'Product Strategy & Management', TRUE),
    ('Engineering', 'Software & Infrastructure Engineering', TRUE),
    ('Design', 'Product & User Experience Design', TRUE),
    ('People', 'Human Resources & Talent Management', TRUE),
    ('Operations', 'Business & Office Operations', TRUE)
ON CONFLICT (department_name) DO NOTHING;

-- Seed Initial Default Designations if empty
INSERT INTO hr_designations (designation_name, description)
VALUES
    ('Software Engineer', 'Full-stack software engineering'),
    ('Senior Software Engineer', 'Senior software engineering & architecture'),
    ('Product Manager', 'Product leadership and roadmap execution'),
    ('Product Designer', 'UI/UX interface and interaction design'),
    ('HR Specialist', 'People operations & lifecycle specialist'),
    ('Operations Lead', 'Cross-functional operational coordination')
ON CONFLICT (designation_name) DO NOTHING;

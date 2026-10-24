# People Journey Backend API

Production-ready Node.js + Express 5 + TypeScript REST API integrated with **Supabase PostgreSQL** and **Firebase Authentication**.

## Architecture & Technology Stack

- **Runtime & Framework**: Node.js (ES Modules) with Express 5.2.1 and TypeScript 5.9.
- **Database Engine**: Supabase-hosted PostgreSQL 15+ (`ap-northeast-1`, AWS Tokyo).
- **Database Client**: `pg` (node-postgres 8.23) with SSL enabled and bounded connection pooling.
- **Connection Modes**:
  - `DATABASE_URL` (Port 6543): Transaction-mode PgBouncer pooler for high-throughput REST queries.
  - `DIRECT_URL` (Port 5432): Session-mode direct pooler for DDL migrations and schema setup.
- **Authentication**: Firebase Admin SDK (token verification with project `peoplejourney-4d586`) + PostgreSQL `app_users` automatic registration.
- **Access Model**: Single role (`user`). Every user possesses full access to all HR features within their own private workspace.
- **Data Isolation**: Strict server-enforced workspace boundary (`owner_user_id` foreign key referencing `app_users.id`). No user can view or modify records belonging to other users.
- **Validation & Logging**: Zod schemas and Pino structured logger.

```
backend/
├── src/
│   ├── config/          # PostgreSQL connection pool (pg.Pool), env validation, Firebase Admin
│   ├── controllers/     # Request handlers (auth, employees, master, dashboard, health)
│   ├── middleware/      # Firebase auth verification, workspace authentication, Pino HTTP logging, error handling
│   ├── migrations/      # 001_initial_schema.sql, 002_user_workspace_isolation.sql (PostgreSQL DDL)
│   ├── models/          # Zod validation schemas & TypeScript types
│   ├── routes/          # Express route definitions (/auth, /dashboard, /employees, /master)
│   ├── services/        # Business logic layer (audit, dashboard, employee, master, user)
│   ├── utils/           # Pino logger configuration
│   ├── app.ts           # Express application setup & middleware stack
│   └── server.ts        # Server bootstrap & graceful shutdown hooks
├── scripts/
│   ├── migrate.ts       # Migration runner executing schema migrations via DIRECT_URL
│   └── provision-admin.ts # Deprecated (Single-role workspace)
├── tests/
│   ├── unit/            # Unit tests (auth, schemas, health, pool helpers)
│   └── integration/     # Integration tests (PostgreSQL multi-tenant data isolation, transactions)
├── .env.example         # Environment template
├── package.json
└── tsconfig.json
```

## Supabase PostgreSQL Schema & Workspace Isolation

1. `app_users`: Registered application identities (UUID primary key, `firebase_uid` unique, email, `display_name`, `photo_url`, `role = 'user'`, `account_status`, timestamps).
2. `hr_departments`: Workspace-scoped department list (`owner_user_id` + system defaults).
3. `hr_designations`: Workspace-scoped job roles and designations (`owner_user_id` + system defaults).
4. `hr_employees`: Workspace-scoped master employee records (`owner_user_id` foreign key, scoped unique code `(owner_user_id, LOWER(employee_code))`).
5. `hr_offboarding`: Workspace-scoped offboarding schedules, exit dates, contact email, and transition notes.
6. `hr_audit_logs`: Immutable audit trail recording user, action, entity, and JSONB details.
7. `user_notifications`: User-scoped alerts, checklist items, and touchpoint notifications.
8. `schema_migrations`: Version-controlled schema migration tracking.

## Environment Configuration

Create a `.env` file in `backend/` based on `.env.example`:

```ini
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Supabase PostgreSQL Connection Strings
# Transaction pooler (Port 6543) for application queries
DATABASE_URL=postgresql://postgres.qvoebbqpnqzjktnwaoke:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true

# Session pooler (Port 5432) for schema migrations
DIRECT_URL=postgresql://postgres.qvoebbqpnqzjktnwaoke:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres

# Connection Pool Tuning
DB_POOL_MIN=2
DB_POOL_MAX=10
DB_TIMEOUT_MS=30000

# Firebase Authentication
FIREBASE_PROJECT_ID=peoplejourney-4d586
# Optional: FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
```

## Database Migrations

Apply database migrations to Supabase:

```bash
npm run db:migrate
```

## Running the Backend

```bash
# Start development server with live watch (hot-reload):
npm run dev

# Run type check:
npm run typecheck

# Run unit and integration tests:
npm run test
```

## Key API Endpoints (All Workspace Scoped)

- `POST /api/auth/google` — Authenticate Firebase ID token, auto-register profile in `app_users`, and return workspace session.
- `GET /api/auth/session` — Retrieve current authenticated profile and workspace status.
- `GET /api/users/me` — Retrieve current user's profile.
- `PATCH /api/users/me` — Update allowed profile fields (displayName, photoUrl, preferences).
- `GET /api/dashboard/me` — Retrieve personal touchpoints, checklist items, and workspace summaries.
- `GET /api/dashboard/stats` — Workspace metrics, employee status distributions, and monthly activity aggregates scoped to authenticated user.
- `GET /api/employees` — Paginated, searchable employee directory scoped to authenticated user's workspace.
- `POST /api/employees` — Onboard new employee into authenticated user's workspace.
- `GET /api/employees/:id` — Employee profile with onboarding and offboarding histories (verifies `owner_user_id`).
- `PATCH /api/employees/:id` — Update employee demographic and role attributes (verifies `owner_user_id`).
- `POST /api/employees/:id/offboard` — Schedule employee exit and trigger offboarding workflow (verifies `owner_user_id`).
- `GET /api/departments` — List active departments (system defaults + user's workspace departments).
- `POST /api/departments` — Create new workspace department.
- `GET /api/designations` — List active designations (system defaults + user's workspace designations).
- `POST /api/designations` — Create new workspace designation.
- `GET /api/healthz` — Live service health and PostgreSQL connection check.


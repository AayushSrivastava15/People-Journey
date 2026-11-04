# People Journey — HR Portal

A human-centric employee lifecycle management workspace for onboarding, offboarding, milestone communications, and exit interviews.

**Live application:** https://people-journey-frontend.onrender.com/

Built with a clean separation of concerns:
- **`frontend/`**: Standalone React 19 + TypeScript web application powered by Vite, Tailwind CSS, shadcn/ui, Motion, Firebase Authentication (Google Sign-In), and TanStack Query.
- **`backend/`**: Express 5 + TypeScript REST API integrated with **Supabase PostgreSQL** (transaction pooler on port 6543) and **Firebase Admin SDK** for single-role personal workspace HR management and strict data isolation.
- **`docs/`**: Architectural specifications, OpenAPI contract definitions, and roadmap documentation.

---

## Project Structure

```
People-Journey-HR-Portal/
├── frontend/
│   ├── public/                 # Static assets (favicons, robots.txt)
│   ├── src/
│   │   ├── api/                # Client API integration & React Query hooks
│   │   ├── assets/             # Brand graphics & icons
│   │   ├── components/
│   │   │   ├── layout/         # Shell, ProtectedRoute, ErrorBoundary
│   │   │   └── ui/             # shadcn/ui components (55 primitives)
│   │   ├── context/            # Firebase & PostgreSQL synchronized AuthContext
│   │   ├── data/               # Lifecycle & employee demo data
│   │   ├── hooks/              # Custom React hooks (use-toast, use-mobile)
│   │   ├── pages/              # Landing page, personal & HR dashboards, login
│   │   ├── services/           # Firebase client authentication services
│   │   ├── types/              # Domain TypeScript types
│   │   ├── utils/              # Helper utilities (cn class merge)
│   │   ├── App.tsx             # Root application router with role guards
│   │   ├── index.css           # Design tokens, typography & Tailwind setup
│   │   └── main.tsx            # React DOM mounting
│   ├── .env.example            # Frontend environment template
│   ├── .gitignore              # Frontend gitignore
│   ├── components.json         # shadcn/ui configuration
│   ├── index.html              # HTML entry point
│   ├── package.json            # Frontend package manifest
│   ├── tsconfig.json           # Frontend TypeScript configuration
│   └── vite.config.ts          # Vite 7 configuration
│
├── backend/
│   ├── src/
│   │   ├── config/             # Supabase PostgreSQL pool, env validation, Firebase Admin
│   │   ├── controllers/        # Request handlers (auth, employees, master, dashboard, health)
│   │   ├── middleware/         # Firebase auth verification, role guards, Pino logging, error handling
│   │   ├── migrations/         # Repeatable PostgreSQL schema migrations (001_initial_schema.sql)
│   │   ├── models/             # Zod validation schemas
│   │   ├── routes/             # REST route definitions
│   │   ├── services/           # Business logic layer (audit, dashboard, employee, master, user)
│   │   ├── utils/              # Pino logger
│   │   ├── app.ts              # Express application setup
│   │   └── server.ts           # Server bootstrap
│   ├── scripts/
│   │   ├── migrate.ts          # Session-pooler migration runner (port 5432)
│   │   └── provision-admin.ts  # CLI utility to provision HR administrators in PostgreSQL
│   ├── tests/
│   │   ├── unit/               # Unit tests (auth, schemas, health, pool helpers)
│   │   └── integration/        # Integration tests (PostgreSQL transactions, audit logging)
│   ├── .env.example            # Backend environment template
│   ├── .gitignore              # Backend gitignore
│   ├── package.json            # Backend package manifest
│   ├── README.md               # Backend architecture & Supabase setup instructions
│   └── tsconfig.json           # Backend TypeScript configuration
│
├── docs/
│   ├── architecture.md         # Comprehensive architectural specification
│   ├── openapi.yaml            # OpenAPI 3.1 specification
│   └── specifications/         # UI/UX design specifications
│
├── .env.example                # Root environment template
├── .gitignore                  # Root version control exclusions
├── package.json                # Root development scripts
└── README.md
```

---

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Database & Environment

In `backend/.env`:
```ini
DATABASE_URL=postgresql://postgres.qvoebbqpnqzjktnwaoke:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true
DIRECT_URL=postgresql://postgres.qvoebbqpnqzjktnwaoke:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres
FIREBASE_PROJECT_ID=peoplejourney-4d586
```

Apply database migrations:
```bash
npm run db:migrate --prefix backend
```

### 3. Run the Frontend (People Journey Web App)

```bash
npm run dev
# or
npm run dev:frontend
```
The application will start on **`http://localhost:3000`**.

### 4. Run the Backend API Server

```bash
npm run dev:backend
```
The API server will listen on **`http://localhost:5000`** (Health check: `http://localhost:5000/api/healthz`).

### 5. Build for Production

```bash
# Build both frontend and backend
npm run build

# Build frontend only
npm run build:frontend

# Build backend only
npm run build:backend
```

### 6. Typecheck & Tests

```bash
# Run TypeScript compilation checks
npm run typecheck

# Run backend test suite
npm run test --prefix backend
```

---

## Database & Authentication Architecture

- **Primary Database**: **Supabase PostgreSQL** (`ap-northeast-1`, AWS Tokyo).
  - Normal runtime queries utilize `DATABASE_URL` (Transaction pooler, Port 6543).
  - DDL Migrations utilize `DIRECT_URL` (Session pooler, Port 5432).
  - Tables: `app_users`, `hr_departments`, `hr_designations`, `hr_employees`, `hr_offboarding`, `hr_audit_logs`, `user_notifications`, `schema_migrations`.
- **Identity Provider**: **Firebase Authentication** with genuine Google Sign-In.
  - Backend verifies ID tokens using Firebase Admin SDK.
  - Open registration: any person with a valid Google account can sign in without domain restriction or approval.
  - First-time Google logins automatically register into `app_users` with the default role `user`.
  - Every authenticated user receives full feature permissions within their own isolated workspace.
  - Server-enforced per-user data isolation: all employee and offboarding queries are strictly scoped to the authenticated owner's `app_users.id`. Users cannot view or modify other users' records.

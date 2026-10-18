# People Journey Backend API

Production-ready Node.js + Express 5 + TypeScript REST API integrated with **Oracle Database Free** and **Firebase Authentication**.

## Architecture & Technology Stack

- **Runtime & Framework**: Node.js (ES Modules) with Express 5.2.1 and TypeScript 5.9.
- **Database Driver**: `oracledb` 26.0.0 in **Thin mode** (pure JavaScript/TypeScript, requires no Oracle Instant Client binary).
- **Database Engine**: Oracle Database Free 23c running on Debian Home Server (`FREEPDB1`).
- **Schema**: Dedicated application user `PEOPLE_JOURNEY`.
- **Authentication**: Firebase Admin SDK (token verification with project `peoplejourney-4d586`) + Oracle `HR_USERS` role authorization (`hr_admin`, `hr_staff`).
- **Validation & Logging**: Zod schemas and Pino structured logger.

```
backend/
├── src/
│   ├── config/          # Oracle connection pool (Thin mode), env validation, Firebase Admin
│   ├── controllers/     # Request handlers (auth, employees, master, dashboard, health)
│   ├── middleware/      # Firebase auth verification, role guards, Pino HTTP logging, error handling
│   ├── models/          # Zod validation schemas & TypeScript types
│   ├── routes/          # Express route definitions
│   ├── services/        # Business logic layer (audit, dashboard, employee, master, user)
│   ├── utils/           # Pino logger configuration
│   ├── app.ts           # Express application setup & middleware stack
│   └── server.ts        # Server entry point & graceful shutdown hooks
├── scripts/
│   └── provision-admin.ts # CLI utility to provision HR administrators in Oracle
├── tests/
│   ├── unit/            # Unit tests (auth, schemas, health, pool helpers)
│   └── integration/     # Integration tests (live Oracle rollback, audit logging, master queries)
├── .env.example         # Environment template
├── package.json
└── tsconfig.json
```

## Oracle Schema (7 Tables in `PEOPLE_JOURNEY`)

1. `HR_DEPARTMENTS`: Department master list with active status and descriptions.
2. `HR_DESIGNATIONS`: Job roles and designations.
3. `HR_USERS`: Authorized HR portal operators (`hr_admin`, `hr_staff`) linked to Firebase UIDs.
4. `HR_EMPLOYEES`: Master employee records with lifecycle status (`ONBOARDING`, `ACTIVE`, `OFFBOARDING`, `EXITED`).
5. `HR_ONBOARDING`: Onboarding workflows, milestones, and checklist tasks.
6. `HR_OFFBOARDING`: Offboarding schedules, exit dates, asset returns, and handovers.
7. `HR_AUDIT_LOGS`: Immutable audit trail recording user, action, entity, and JSON details.

## Network Prerequisites

The Oracle Database Free instance runs on a private Debian home server at `100.94.73.89:1521/FREEPDB1`.
- Ensure your machine is connected to the **Tailscale/VPN network** before starting the server.
- The Oracle listener port 1521 remains private to the home network/VPN mesh.

## Environment Configuration

Create a `.env` file in `backend/` based on `.env.example`:

```ini
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Oracle Database Free Configuration (Thin Mode)
ORACLE_USER=PEOPLE_JOURNEY
ORACLE_PASSWORD=your_secure_password
ORACLE_CONNECT_STRING=100.94.73.89:1521/FREEPDB1
ORACLE_POOL_MIN=2
ORACLE_POOL_MAX=10
ORACLE_POOL_INCREMENT=2
ORACLE_POOL_TIMEOUT=60

# Firebase Authentication
FIREBASE_PROJECT_ID=peoplejourney-4d586
# Optional service account path or inline JSON:
# FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
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

## Provisioning HR Administrators

To grant an HR user access to the portal:

```bash
npm run provision:admin -- user@example.com "Full Name" hr_admin
```

## API Endpoints

- `GET /api/healthz` — Live service health and Oracle DB connection latency check.
- `GET /api/auth/me` — Authenticated HR user profile and assigned permissions.
- `GET /api/dashboard/stats` — Real-time KPI metrics, status distributions, and monthly activity aggregates.
- `GET /api/employees` — Paginated, searchable, and sortable employee list.
- `POST /api/employees` — Onboard new employee (auto-generates `EMP-XXXXXX` code and starts onboarding).
- `GET /api/employees/:id` — Detailed employee profile with onboarding and offboarding histories.
- `PATCH /api/employees/:id` — Update employee demographic and role attributes.
- `POST /api/employees/:id/offboard` — Schedule employee exit and trigger offboarding workflow.
- `GET /api/departments` — List active departments.
- `POST /api/departments` — Create department.
- `GET /api/designations` — List active designations.
- `POST /api/designations` — Create designation.

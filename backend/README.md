# People Journey Backend API

## Current Status: Development API Server (Node.js + Express + TypeScript)

This service provides the development API endpoints for the People Journey HR Portal.

> **Note on Target Architecture**:
> As specified in `docs/architecture.md`, the production target backend is **Java with Spring Boot**, **Firebase Authentication**, and **PostgreSQL**.
> This Node.js/Express service serves as the current development API to power local development and API contracts until the Spring Boot service (`services/hr-api`) is initialized.

## Architecture

```
backend/
├── src/
│   ├── config/          # Environment & database connection
│   ├── controllers/     # Request handlers
│   ├── middleware/      # Logging, error handling
│   ├── models/          # Zod validation schemas & types
│   ├── routes/          # Express route definitions
│   ├── services/        # Business logic layer
│   ├── utils/           # Logger and helpers
│   ├── app.ts           # Express app setup
│   └── server.ts        # Server entry point
├── tests/
│   ├── unit/            # Unit tests
│   └── integration/     # Integration tests
├── .env.example
├── package.json
└── tsconfig.json
```

## Running the Backend

```bash
# From repository root:
npm run dev:backend

# Or from backend/ directory:
cd backend
npm run dev
```

The server listens on `http://localhost:5000` (Health check: `http://localhost:5000/api/healthz`).

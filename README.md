# People Journey — HR Portal

A human-centric employee lifecycle management workspace for onboarding, offboarding, milestone communications, and exit interviews.

Built with a clean separation of concerns:
- **`frontend/`**: Standalone React 19 + TypeScript web application powered by Vite, Tailwind CSS, shadcn/ui, and Motion (framer-motion).
- **`backend/`**: Node.js + Express 5 development API server providing REST endpoints, Zod schema validation, and database connection scaffolding.
- **`docs/`**: Architectural specifications, OpenAPI contract definitions, and roadmap documentation.

---

## Project Structure

```
People-Journey-HR-Portal/
├── frontend/
│   ├── public/                 # Static assets (favicons, robots.txt)
│   ├── src/
│   │   ├── api/                # Client API integration
│   │   ├── assets/             # Brand graphics & icons
│   │   ├── components/
│   │   │   ├── layout/         # Shell & error boundaries
│   │   │   └── ui/             # shadcn/ui components (55 primitives)
│   │   ├── context/            # Application state contexts
│   │   ├── data/               # Lifecycle & employee demo data
│   │   ├── hooks/              # Custom React hooks (use-toast, use-mobile)
│   │   ├── pages/              # Landing page, dashboard, login placeholder
│   │   ├── services/           # Business-facing client services
│   │   ├── types/              # Domain TypeScript types
│   │   ├── utils/              # Helper utilities (cn class merge)
│   │   ├── App.tsx             # Root application router
│   │   ├── index.css           # Design tokens, typography & Tailwind setup
│   │   └── main.tsx            # React DOM mounting
│   ├── .env.example            # Frontend environment template
│   ├── .gitignore              # Frontend gitignore
│   ├── components.json         # shadcn/ui configuration
│   ├── index.html              # HTML entry point
│   ├── package.json            # Frontend package manifest
│   ├── tsconfig.json           # Frontend TypeScript configuration
│   └── vite.config.ts          # Clean Vite configuration
│
├── backend/
│   ├── src/
│   │   ├── config/             # Environment & PostgreSQL connection
│   │   ├── controllers/        # Request handlers
│   │   ├── middleware/         # Logging & error handling
│   │   ├── models/             # Zod validation schemas
│   │   ├── routes/             # REST route definitions
│   │   ├── services/           # Business logic layer
│   │   ├── utils/              # Pino logger
│   │   ├── app.ts              # Express application setup
│   │   └── server.ts           # Server bootstrap
│   ├── tests/
│   │   ├── unit/               # Unit tests
│   │   └── integration/        # Integration tests
│   ├── .env.example            # Backend environment template
│   ├── .gitignore              # Backend gitignore
│   ├── package.json            # Backend package manifest
│   ├── README.md               # Backend architecture & Spring Boot roadmap
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

You can install all dependencies from the root:
```bash
npm install
# or
pnpm install
```

### 2. Run the Frontend (People Journey Web App)

```bash
npm run dev
# or
npm run dev:frontend
```
The application will start on **`http://localhost:3000`**.

### 3. Run the Backend API Server

```bash
npm run dev:backend
```
The API server will listen on **`http://localhost:5000`** (Health check endpoint: `http://localhost:5000/api/healthz`).

### 4. Build for Production

```bash
# Build both frontend and backend
npm run build

# Build frontend only
npm run build:frontend

# Build backend only
npm run build:backend
```

### 5. Typecheck

```bash
npm run typecheck
```

---

## Design System & Palette

- **Main Background**: `#FFFBF7` (Soft cream)
- **Secondary Background**: `#FFF4E8`
- **Primary Accent**: `#EFB7C8` (Blush pink)
- **Soft Peach**: `#FFE2D0`
- **Lavender**: `#EAE4FA`
- **Primary Text**: `#443942` (Charcoal brown)
- **Secondary Text**: `#81747D`
- **Typography**: `DM Sans` (Headings & UI) and `DM Serif Display` (Editorial accents)

---

## Backend Roadmap

The current Node.js/Express service in `backend/` serves as the development API. The long-term production target is a **Java + Spring Boot REST API** with **Firebase Authentication** and **PostgreSQL**, fully documented in [`docs/architecture.md`](docs/architecture.md).

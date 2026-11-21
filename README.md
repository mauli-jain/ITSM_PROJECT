# Intelligent IT Service Management (I-ITSM) Platform

An autonomous, enterprise-grade IT Service Management and Incident Lifecycle Governance system engineered with Object-Oriented Programming (OOP) design patterns, persistent SQLite repository storage, role-based access control (RBAC), and server-sent real-time event distribution.

---

## Architecture & Design Patterns

1. **State Pattern (`src/domain/IncidentState.ts`, `IncidentEntity.ts`)**:
   - 9 discrete lifecycle phases: `NEW`, `CLASSIFIED`, `ASSIGNED`, `ACKNOWLEDGED`, `IN_PROGRESS`, `NEEDS_INFO`, `RESOLVED`, `VERIFIED`, `CLOSED`.
   - Programmatically guards invalid state transitions with `InvalidStateTransitionException` (409 Conflict).
2. **Strategy Pattern (`src/domain/AssignmentStrategy.ts`)**:
   - Dynamic technician dispatch algorithms switchable at runtime:
     - `SkillBasedAssignmentStrategy`: Jaccard & keyword skill matching against category and service requirements.
     - `LoadBasedAssignmentStrategy`: Assigns available operators with lowest active workload ratio.
     - `RoundRobinAssignmentStrategy`: Deterministic rotation across active operators.
     - `ExperienceBasedAssignmentStrategy`: Prioritizes veteran engineers for critical issues.
     - Workload capacity limits enforce `WorkloadOverflowException`.
3. **Observer Pattern (`src/domain/IncidentObserver.ts`)**:
   - `IncidentEventBus` dispatches events to multiple adapters:
     - `InAppNotificationObserver`: In-app reactive notifications.
     - `EmailNotificationAdapter`: Formatted RFC-compliant email dispatches.
     - `SmsNotificationAdapter`: Emergency SMS pager for high-urgency incidents.
     - `AuditObserver`: Append-only immutable audit trail with actor stamps.
4. **Repository Pattern (`src/domain/Repositories.ts`, `src/domain/SqliteRepositories.ts`)**:
   - Generic abstract `Repository<T>` interfaces implemented by persistent SQLite repositories writing to `data/iitsm.db`.
5. **Real Authentication & RBAC (`src/server.ts`)**:
   - `bcryptjs` password hashing (cost factor 10).
   - Signed JSON Web Tokens (8-hour expiry).
   - Server-enforced role authorization: `ROLE_EMPLOYEE`, `ROLE_TECHNICIAN`, `ROLE_ADMIN`.

---

## Team and demo login credentials
All accounts are pre-seeded with securely hashed credentials.

| Name | Username | Default password | Role |
|---|---|---|---|
| Mauli Jain | `mauli` | `admin123` | Administrator (`ROLE_ADMIN`) |
| Shambhavi Chaturvedi | `shambhavi` | `password` | Technician (`ROLE_TECHNICIAN`) |
| Tulika Devale | `tulika` | `password` | Technician (`ROLE_TECHNICIAN`) |
| Simran Misra | `simran` | `password` | Technician (`ROLE_TECHNICIAN`) |
| Avani Pandit | `avanip` | `password` | Employee (`ROLE_TECHNICIAN`) | (not presnt as demo account - created a sample one in user directory)

## Environment Variables

Configure environment variables in `.env` (see `.env.example`):

```bash
# JWT Secret Key (required, minimum 32 characters)
JWT_SECRET="super-secret-jwt-key-minimum-32-chars-long-iitsm-platform"

# Port (defaults to 3000)
PORT=3000

# Environment mode
NODE_ENV=development

# Optional Gemini API Key for server-side AI suggestions (falls back to rule-based engine if omitted)
GEMINI_API_KEY="your-gemini-api-key"
```

---

## Scripts & CLI

```bash
# Start development server with Vite middleware on port 3000
npm run dev

# Build production bundle to dist/
npm run build

# Start production server
npm start

# Run comprehensive test suite (51 tests: 21 domain OOP + 30 API integration)
npm test

# Run tests with code coverage report (v8 engine)
npm run test:coverage

# Run TypeScript typecheck (zero diagnostics)
npm run lint

# Clean build artifacts
npm run clean
```

---

## DevOps & Containerization

### 1. Docker Multi-Stage Build
The application includes an optimized multi-stage `Dockerfile`:
- **Builder stage:** Compiles the frontend SPA with Vite and compiles TypeScript.
- **Runner stage:** Runs as unprivileged `node` user on Alpine Linux, serving on port 3000.

```bash
# Build the Docker image
docker build -t iitsm-platform:latest .

# Run container with persistent data volume
docker run -d \
  -p 3000:3000 \
  -e JWT_SECRET="super-secret-jwt-key-minimum-32-chars-long-iitsm-platform" \
  -v $(pwd)/data:/app/data \
  --name iitsm-container \
  iitsm-platform:latest
```

### 2. Docker Compose
A production-ready `docker-compose.yml` mounts the persistent SQLite volume and reads environment variables from `.env`:

```bash
# Start container with Docker Compose
docker compose up -d

# Stop container
docker compose down
```

### 3. Continuous Integration (GitHub Actions)
The workflow in `.github/workflows/ci.yml` runs on every push and pull request:
1. `npm ci`: Clean reproducible dependency installation.
2. `npm run lint`: TypeScript compiler check (`tsc --noEmit`).
3. `npm test`: Automated execution of all 51 Vitest unit & integration tests.
4. `npm run build`: Production client compilation with Vite.

---

## AI Capabilities (Server-Side Strategy/Adapter)

The platform integrates Gemini AI via `src/services/GeminiService.ts`:
- **Architecture:** Implements the `AIProvider` interface (Strategy/Adapter pattern).
- **Gemini Engine:** Uses `@google/genai` with `gemini-3.8-flash` to suggest incident categories and resolution plans.
- **Rule-Based Fallback:** If `GEMINI_API_KEY` is missing, invalid, or hits rate limits, the system automatically falls back to an internal token-overlap heuristic and historical incident index.
- **Security & Privacy:** The API key is kept strictly on the backend and is never exposed to browser clients.
- **Rate Limiting:** AI endpoints (`/api/ai/*`) are throttled to a maximum of 20 requests per user per minute.

---

## Project Structure

```
├── .github/
│   └── workflows/
│       └── ci.yml             # GitHub Actions CI workflow (lint, test, build)
├── docs/                      # Technical reports, UML diagrams, tests catalog
│   ├── architecture.md
│   ├── class-diagram.md
│   ├── coverage.md
│   ├── demo-script.md
│   ├── er-diagram.md
│   ├── problem-analysis.md
│   ├── report-outline.md
│   ├── requirements.md
│   ├── sample-data.md
│   ├── schema.sql
│   ├── security.md
│   ├── state-diagram.md
│   ├── technology-report.md
│   └── TESTS.md
├── src/
│   ├── api/                   # Typed API client
│   ├── components/            # Reactive UI modals and views
│   ├── data/                  # Canonical seed data
│   ├── db/                    # SQLite (sql.js) database & debounced disk persistence
│   ├── domain/                # OOP Domain layer (State, Strategy, Observer, Repositories)
│   ├── services/              # AIProvider & GeminiService with fallback
│   ├── types/                 # Domain & UI TypeScript interfaces
│   ├── utils/                 # Intelligent algorithms (Jaccard similarity, scoring)
│   └── server.ts              # Express API & Vite middleware entrypoint
│   └── main.tsx              
│   └── index.css             
│   └── App.tsx              
├── test/
│   ├── itsm.test.ts           # 21 Domain OOP unit tests
│   └── api.test.ts            # 30 API integration & security tests
├── .env.example
├── .gitignore
├── Dockerfile                 # Multi-stage production container definition
├── docker-compose.yml         # Container orchestration with volume & env
├── index.html
├── metadata.json
├── package-lock.json
├── .dockerignore
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── vite.config.ts
```

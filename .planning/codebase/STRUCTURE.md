# Codebase Structure

**Analysis Date:** 2026-02-02

## Directory Layout

```
dentix-ortho/
├── backend/                    # Express.js API server
│   ├── src/
│   │   ├── server.ts          # Entry point, database init, server startup
│   │   ├── app.ts             # Express app configuration and middleware
│   │   ├── config/            # Configuration modules (cloud9, database, ssh, nodered)
│   │   ├── controllers/       # HTTP request handlers for routes
│   │   ├── routes/            # Express route definitions
│   │   ├── services/          # Business logic and external integrations
│   │   │   ├── cloud9/        # Cloud 9 API client (xmlBuilder, xmlParser, client)
│   │   │   ├── postman/       # Postman collection generator
│   │   │   └── [other services]
│   │   ├── models/            # Data access layer (Patient, Appointment, etc.)
│   │   ├── middleware/        # Express middleware (cors, errorHandler)
│   │   ├── database/          # Database configuration and schema
│   │   ├── types/             # TypeScript type definitions
│   │   └── utils/             # Utilities (logger)
│   ├── package.json           # Backend dependencies
│   └── tsconfig.json          # TypeScript configuration
│
├── frontend/                   # React + Vite application
│   ├── src/
│   │   ├── main.tsx           # React app entry point
│   │   ├── App.tsx            # Root component
│   │   ├── pages/             # Page components (Dashboard, Patients, Appointments, TestMonitor, etc.)
│   │   ├── components/        # React components
│   │   │   ├── layout/        # Layout components (MainLayout, sidebar, header)
│   │   │   ├── features/      # Feature-specific components (appointments, patients, admin, etc.)
│   │   │   ├── ui/            # Reusable UI components
│   │   │   └── forms/         # Form components
│   │   ├── store/             # Redux store configuration
│   │   │   ├── store.ts       # Store initialization
│   │   │   └── slices/        # Redux slices (auth, patients, appointments, testMonitor, etc.)
│   │   ├── services/          # Frontend services
│   │   │   ├── api/           # API client services (patientApi, appointmentApi, testMonitorApi, etc.)
│   │   │   └── utils/         # Utility services
│   │   ├── routes/            # React Router configuration (AppRouter.tsx)
│   │   ├── contexts/          # React contexts (ThemeContext)
│   │   ├── hooks/             # Custom React hooks
│   │   ├── types/             # TypeScript type definitions for frontend
│   │   ├── utils/             # Frontend utilities (constants, helpers)
│   │   └── styles/            # Global and component styles
│   ├── package.json           # Frontend dependencies
│   ├── vite.config.ts         # Vite configuration with dev server proxies
│   └── tsconfig.json          # TypeScript configuration
│
├── test-agent/                # Test execution and monitoring engine
│   ├── src/
│   │   ├── services/          # Test services (goal-test-runner, category-classifier, etc.)
│   │   ├── storage/           # Database access for test results
│   │   └── tests/             # Test case runners
│   ├── scripts/               # Utility scripts for testing and deployment
│   ├── data/                  # Test result database and logs
│   └── package.json
│
├── nodered/                   # Node-RED flow definitions and deployment
│   ├── nodered_Cloud9_flows.json  # Production flow configuration
│   ├── bk_up/                 # Flow backups
│   └── [other flow files]
│
├── docs/                      # Documentation and API reference
│   ├── v1/                    # Canonical V1 production files
│   │   ├── Chord_Cloud9_SystemPrompt.md
│   │   ├── nodered_Cloud9_flows.json
│   │   ├── chord_dso_patient_Tool.json
│   │   ├── schedule_appointment_dso_Tool.json
│   │   └── [other tool/prompt files]
│   ├── archive/               # Archived documentation
│   └── [other docs]
│
├── .planning/                 # GSD planning directory
│   └── codebase/             # Codebase analysis documents (this file, ARCHITECTURE.md, etc.)
│
├── CLAUDE.md                  # Project instructions for Claude
├── .env.example               # Environment variable template
└── [root config files]        # .gitignore, tsconfig.json, etc.
```

## Directory Purposes

**backend/src/config:**
- Purpose: Centralized configuration for external services and runtime settings
- Contains: Cloud 9 credentials and endpoints (cloud9.ts), database path and connection (database.ts), SSH config (ssh.ts), Node-RED URLs (nodered.ts)
- Key files:
  - `cloud9.ts`: Exports `getCredentials()`, `getEndpoint()`, `isValidEnvironment()`, `Environment` type
  - `database.ts`: Exports singleton `getDatabase()` function and `closeDatabase()`

**backend/src/controllers:**
- Purpose: HTTP request handlers that orchestrate services and return responses
- Contains: One controller file per route domain (appointmentController, patientController, authController, testMonitorController, etc.)
- Key files:
  - `appointmentController.ts`: Handles GET/POST/PUT for appointments
  - `patientController.ts`: Handles patient operations
  - `testMonitorController.ts`: Handles test execution, monitoring, and streaming

**backend/src/routes:**
- Purpose: Define Express route definitions that map HTTP verbs to controller functions
- Contains: One router file per domain; each file creates Express Router and defines endpoints
- Key files:
  - `appointments.ts`: `/api/appointments/*` routes
  - `patients.ts`: `/api/patients/*` routes
  - `testMonitor.ts`: `/api/test-monitor/*` routes for test execution
  - `auth.ts`: `/api/auth/*` routes for login/logout
  - `admin.ts`: `/api/admin/*` routes for user management

**backend/src/services:**
- Purpose: Business logic, API client implementations, data transformations
- Contains: Service classes and utility functions organized by domain
- Key subdirectories:
  - `cloud9/`: Cloud 9 API integration (client.ts, xmlBuilder.ts, xmlParser.ts, procedures.ts)
  - `postman/`: Postman collection generator
- Key files:
  - `authService.ts`: User authentication, JWT, master admin seeding
  - `cacheService.ts`: Reference data caching (when enabled)
  - `goalTestService.ts`: Test execution orchestration
  - `langfuseTraceService.ts`: Langfuse trace retrieval and analysis
  - `noderedDeployService.ts`: Node-RED deployment via API
  - `slackNotifier.ts`: Slack notifications

**backend/src/models:**
- Purpose: Data access layer with CRUD operations on SQLite database
- Contains: One model class per entity; each provides query/upsert/delete methods
- Key files:
  - `Patient.ts`: Patient CRUD operations
  - `Appointment.ts`: Appointment CRUD operations
  - `User.ts`: User CRUD operations
  - `Location.ts`, `Provider.ts`, `AppointmentType.ts`: Reference data models

**backend/src/middleware:**
- Purpose: Express middleware functions for cross-cutting concerns
- Contains: Error handling, CORS setup, authentication (if added)
- Key files:
  - `errorHandler.ts`: Custom AppError class, global error handler, asyncHandler wrapper
  - `cors.ts`: CORS configuration

**backend/src/database:**
- Purpose: Database connection, schema, initialization
- Contains: SQLite setup, schema definition in SQL, initialization script
- Key files:
  - `schema.sql`: SQLite table definitions (users, patients, appointments, etc.)
  - `init.ts`: Database initialization and schema setup
  - `cloud9.db`, `test-results.db`: SQLite database files

**backend/src/types:**
- Purpose: TypeScript type definitions for external APIs and internal data structures
- Key files:
  - `cloud9.ts`: Cloud9Patient, Cloud9Appointment, Cloud9Location, Cloud9Response types
  - `database.ts`: Database-related types
  - `alerts.ts`: Alert event types

**frontend/src/pages:**
- Purpose: Full page components for different routes
- Contains: One directory per page/feature (Auth, Patients, Appointments, TestMonitor, Admin, etc.)
- Key files:
  - `Auth/LoginPage.tsx`: Login form
  - `Patients/PatientList.tsx`, `PatientDetail.tsx`: Patient management pages
  - `Appointments/AppointmentList.tsx`, `AppointmentCalendar.tsx`: Appointment pages
  - `TestMonitor/*`: 10+ pages for test execution, results, analysis, A/B testing, prompts, etc.
  - `Dashboard.tsx`: Main dashboard landing page

**frontend/src/components:**
- Purpose: Reusable React components organized by purpose
- Key subdirectories:
  - `features/`: Feature-specific components (appointments, patients, admin, auth, testMonitor, etc.)
  - `layout/`: Layout components (MainLayout with sidebar and header)
  - `ui/`: Reusable UI primitives (buttons, modals, cards, etc.)
  - `forms/`: Form components

**frontend/src/store/slices:**
- Purpose: Redux slice creators for domain state
- Contains: One slice file per domain; each slice defines reducers and async thunks
- Key files:
  - `authSlice.ts`: User auth state and login/logout
  - `patientSlice.ts`: Patient list and detail state
  - `appointmentSlice.ts`: Appointment data state
  - `testMonitorSlice.ts`: Test run results and history
  - `testExecutionSlice.ts`: Real-time test execution state with SSE
  - `goalTestCasesSlice.ts`: Goal test case library state

**frontend/src/services/api:**
- Purpose: API client functions for backend endpoints
- Contains: One service file per backend route domain
- Key files:
  - `client.ts`: Axios client base with JWT token injection
  - `patientApi.ts`: Patient endpoints (getPatients, getPatient, createPatient, updatePatient)
  - `appointmentApi.ts`: Appointment endpoints (createAppointment, getAvailable, cancel, confirm)
  - `testMonitorApi.ts`: Test monitor endpoints (startExecution, getTestRuns, subscribeToExecution, etc.)
  - `authApi.ts`: Authentication endpoints (login, logout, checkAuth)

**frontend/src/routes:**
- Purpose: React Router configuration
- Key files:
  - `AppRouter.tsx`: Main router component with nested routes and protected route guards
  - `index.ts`: Exports AppRouter

**frontend/src/types:**
- Purpose: TypeScript type definitions for frontend domain models
- Key files:
  - `testMonitor.types.ts`: Large type file for test execution, runs, results, traces, sessions
  - `patients.ts`, `appointments.ts`: Patient and appointment types

**test-agent/:**
- Purpose: Separate Node.js project for test execution and tracking
- Key subdirectories:
  - `src/tests/`: Test runner implementations
  - `src/services/`: Goal classification, response strategy, test logic
  - `src/storage/`: Database access for test-results.db
  - `scripts/`: Utility scripts for deployment, analysis, testing
  - `data/`: test-results.db (SQLite database for test history and results)

## Key File Locations

**Entry Points:**

- `backend/src/server.ts`: Backend API server startup
- `frontend/src/main.tsx`: Frontend React app startup
- `backend/src/app.ts`: Express application configuration
- `frontend/src/routes/AppRouter.tsx`: React Router configuration

**Configuration:**

- `backend/src/config/cloud9.ts`: Cloud 9 API credentials and endpoints
- `backend/src/config/database.ts`: SQLite database connection
- `frontend/vite.config.ts`: Vite dev server, proxies, build config
- `.env` (not committed): Environment variables for API keys, database path, feature flags

**Core Logic:**

- `backend/src/services/cloud9/client.ts`: Cloud 9 API client
- `backend/src/services/goalTestService.ts`: Test execution orchestration
- `frontend/src/store/store.ts`: Redux store configuration
- `frontend/src/services/api/client.ts`: Frontend axios client with auth

**Testing:**

- `test-agent/src/tests/goal-test-runner.ts`: Goal test execution engine
- `test-agent/data/test-results.db`: SQLite database for test history
- `backend/src/controllers/testMonitorController.ts`: Test monitoring API

## Naming Conventions

**Files:**

- Controllers: `[domain]Controller.ts` (appointmentController.ts, patientController.ts)
- Routes: `[domain].ts` (appointments.ts, patients.ts)
- Services: `[feature]Service.ts` (authService.ts, cacheService.ts, goalTestService.ts)
- Models: `[Entity].ts` (Patient.ts, Appointment.ts, User.ts)
- API Services: `[domain]Api.ts` (patientApi.ts, appointmentApi.ts)
- Redux Slices: `[domain]Slice.ts` (authSlice.ts, patientSlice.ts)
- Pages: `[PageName].tsx` or `[Feature]/[PageName].tsx`
- Components: `[ComponentName].tsx` or `[Feature]/[ComponentName].tsx`
- Types: `[domain].ts` or `[domain].types.ts`

**Directories:**

- Feature-based: `components/features/[feature]/`
- Domain-based: `services/[domain]/`
- By type: `models/`, `routes/`, `controllers/`, `utils/`
- Page-based: `pages/[Feature]/`

**Functions & Variables:**

- Controllers & Services: camelCase (getPatient, createAppointment, updateUser)
- Redux actions: camelCase thunks (fetchPatients, createAppointment), verb-noun pattern
- Types: PascalCase (Patient, Cloud9Appointment, TestRun)
- Constants: UPPER_SNAKE_CASE (API_BASE_URL, CACHE_TTL_MS)

**React Components:**

- PascalCase filenames (AppointmentCard.tsx, PatientList.tsx)
- Export named component matching filename

## Where to Add New Code

**New Feature (e.g., Insurance Management):**
- API Endpoint: `backend/src/routes/insurance.ts` + `backend/src/controllers/insuranceController.ts`
- Business Logic: `backend/src/services/insuranceService.ts`
- Database: `backend/src/models/Insurance.ts`, add tables to `backend/src/database/schema.sql`
- Frontend Page: `frontend/src/pages/Insurance/InsuranceList.tsx`, `InsuranceDetail.tsx`
- Frontend Components: `frontend/src/components/features/insurance/InsuranceCard.tsx`, etc.
- Redux State: `frontend/src/store/slices/insuranceSlice.ts`
- API Client: `frontend/src/services/api/insuranceApi.ts`
- Types: `backend/src/types/insurance.ts`, `frontend/src/types/insurance.ts`

**New Component/Module (e.g., Reusable Modal):**
- Implementation: `frontend/src/components/ui/Modal.tsx` (if generic) or `frontend/src/components/features/[domain]/[Component].tsx` (if domain-specific)
- Export from: `frontend/src/components/ui/index.ts` or feature directory
- Usage: Import in pages or other components that need it

**Utilities & Helpers:**
- Shared frontend helpers: `frontend/src/utils/`
- Shared backend utilities: `backend/src/utils/logger.ts`, add new utility files as needed
- Services (not tied to routes): `backend/src/services/[name]Service.ts`

**New Test Case:**
- Implementation: `test-agent/src/tests/` with unique test file
- Registration: Add to test registry for execution
- Results: Stored in `test-agent/data/test-results.db`
- Monitoring: Create page in `frontend/src/pages/TestMonitor/` if needed

## Special Directories

**backend/src/database/migrations/:**
- Purpose: Database schema migrations (if using migration system)
- Generated: No (manually managed)
- Committed: Yes (schema changes tracked)

**frontend/src/store/slices/:**
- Purpose: Redux state slices
- Generated: No (manually created)
- Committed: Yes

**test-agent/data/:**
- Purpose: SQLite database and test artifacts
- Generated: Yes (test execution creates records)
- Committed: No (excluded in .gitignore)

**docs/v1/:**
- Purpose: Canonical production source files (prompts, flows, tools)
- Generated: No (manually managed)
- Committed: Yes (source of truth)

**docs/archive/:**
- Purpose: Historical documentation and old versions
- Generated: No (manually archived)
- Committed: Yes (for historical reference)

**nodered/bk_up/:**
- Purpose: Node-RED flow backups created before deployment
- Generated: Yes (deployment service creates)
- Committed: No (backup artifacts)

---

*Structure analysis: 2026-02-02*

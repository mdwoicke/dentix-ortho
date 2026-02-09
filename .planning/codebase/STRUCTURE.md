# Codebase Structure

**Analysis Date:** 2026-02-09

## Directory Layout

```
dentix-ortho/
├── backend/                    # Express API server
│   ├── src/
│   │   ├── config/            # Configuration (database, cloud9, nodered, ssh)
│   │   ├── controllers/       # HTTP request handlers (8 controllers)
│   │   ├── database/          # Database schema and migrations
│   │   ├── middleware/        # CORS, error handling, tenant context
│   │   ├── models/            # Static model classes (Patient, Appointment, User, Tenant)
│   │   ├── routes/            # Express route definitions (11 route files)
│   │   ├── services/          # Business logic (37+ services)
│   │   ├── types/             # TypeScript type definitions
│   │   ├── utils/             # Logger, helpers
│   │   ├── app.ts             # Express app configuration
│   │   └── server.ts          # Server entry point
│   ├── logs/                  # Application logs (rate-limit-errors.md, etc.)
│   ├── dentix.db              # Main application database
│   └── package.json
├── frontend/                   # React SPA
│   ├── src/
│   │   ├── components/        # React components
│   │   │   ├── features/     # Domain-specific components (20+ feature dirs)
│   │   │   ├── forms/        # Reusable form components
│   │   │   └── layout/       # Layout components (Navbar, Sidebar, MainLayout)
│   │   ├── pages/            # Page components (Dashboard, Admin, TestMonitor)
│   │   ├── routes/           # Routing configuration
│   │   ├── services/         # API clients
│   │   │   └── api/          # API service modules (client, patientApi, etc.)
│   │   ├── store/            # Redux store
│   │   │   └── slices/       # Redux slices (10+ slices)
│   │   ├── styles/           # Global CSS
│   │   ├── types/            # TypeScript types
│   │   ├── utils/            # Constants, helpers
│   │   ├── App.tsx           # Root component
│   │   └── main.tsx          # React entry point
│   └── package.json
├── test-agent/                # E2E testing CLI
│   ├── src/
│   │   ├── analysis/         # Test result analyzers
│   │   ├── config/           # Test configuration
│   │   ├── core/             # Agent, Flowise client, test executor
│   │   ├── debug/            # Debugging utilities
│   │   ├── parallel/         # Parallel test execution
│   │   ├── reporters/        # Console and markdown reporters
│   │   ├── schemas/          # Zod validation schemas
│   │   ├── services/         # Intent detector, LLM services
│   │   ├── storage/          # Database client for test results
│   │   ├── tests/            # Test scenarios and goal definitions
│   │   ├── utils/            # Utilities
│   │   └── index.ts          # CLI entry point
│   ├── data/                 # Test data and results
│   │   ├── test-results.db   # Test results database
│   │   ├── reports/          # Generated test reports
│   │   └── transcripts/      # Conversation transcripts
│   ├── scripts/              # 200+ utility scripts for deployment, debugging, analysis
│   └── package.json
├── shared/                    # Shared code across backend/frontend/test-agent
│   ├── config/               # Shared configuration
│   ├── services/             # Shared services (Langfuse, LLM, Claude CLI)
│   └── types/                # Shared TypeScript types
├── docs/                      # Documentation
│   ├── v1/                   # V1 production files (canonical source)
│   │   ├── Chord_Cloud9_SystemPrompt.md
│   │   ├── nodered_Cloud9_flows.json
│   │   ├── chord_dso_patient_Tool.json
│   │   ├── schedule_appointment_dso_Tool.json
│   │   ├── patient_tool_func.js
│   │   └── scheduling_tool_func.js
│   ├── archive/              # Archived old files
│   ├── prompts/              # Prompt engineering docs
│   └── tests/                # Test documentation
├── nodered/                   # Node-RED flow definitions (default tenant)
│   └── bk_up/                # Node-RED backups
├── tenants/                   # Tenant-specific files
│   ├── dominos-pizza/
│   │   ├── v1/               # Tenant V1 files
│   │   └── nodered/          # Tenant Node-RED flows
│   └── e2e-test-tenant/
│       ├── v1/
│       └── nodered/
├── .planning/                 # GSD planning artifacts
│   ├── codebase/             # Codebase analysis documents
│   ├── milestones/           # Milestone definitions
│   └── phases/               # Phase implementation plans
├── scripts/                   # Root-level utility scripts
├── .claude/                   # Claude Code configuration
│   ├── agents/               # GSD agents
│   ├── hooks/                # Git hooks for V1 file sync
│   └── skills/               # Reusable skills
└── package.json              # Root package.json
```

## Directory Purposes

**backend/src/controllers:**
- Purpose: HTTP request handlers, inline auth validation
- Contains: TypeScript controller files with async route handlers
- Key files: `authController.ts` (login), `patientController.ts` (CRUD), `testMonitorController.ts` (test orchestration)

**backend/src/services:**
- Purpose: Business logic, external integrations, AI enhancement
- Contains: 37 service files including Cloud9, Flowise, Langfuse, alert engine, expert agents
- Key files: `cloud9/client.ts`, `authService.ts`, `langfuseTraceService.ts`, `expertAgentService.ts`

**backend/src/models:**
- Purpose: Database access via static methods
- Contains: Model classes for each table (Patient, Appointment, User, Tenant, etc.)
- Key files: `Patient.ts`, `Tenant.ts`, `User.ts`

**backend/src/database:**
- Purpose: Database initialization and migrations
- Contains: `schema.sql`, migration scripts, database files
- Key files: `init.ts`, `migrations/001_add_multi_tenancy.ts`

**frontend/src/components/features:**
- Purpose: Domain-specific React components
- Contains: 20+ feature directories (auth, patients, appointments, test-monitor, goalTestCases, etc.)
- Key files: `auth/ProtectedRoute.tsx`, `test-monitor/TestMonitorLayout.tsx`, `goalTestWizard/CreateGoalTestWizard.tsx`

**frontend/src/pages:**
- Purpose: Top-level page components mapped to routes
- Contains: Page components exported from feature directories
- Key files: `Dashboard/index.tsx`, `TestMonitor/index.tsx`, `Admin/AdminPage.tsx`

**frontend/src/store/slices:**
- Purpose: Redux state slices with actions and reducers
- Contains: 10+ slice files (auth, tenant, ui, testMonitor, goalTestCases, etc.)
- Key files: `authSlice.ts`, `tenantSlice.ts`, `testMonitorSlice.ts`

**test-agent/src/tests:**
- Purpose: Test scenario definitions and goal-oriented test cases
- Contains: TypeScript test scenarios, goal definitions
- Key files: `scenarios/goal-happy-path.ts`, `types/goal-test.ts`

**test-agent/scripts:**
- Purpose: 200+ utility scripts for debugging, deployment, data manipulation
- Contains: Scripts for Node-RED deployment, Langfuse analysis, booking simulation, cache testing
- Key files: `deploy-nodered.js`, `update-prompt-version.js`, `analyze-session.js`

**docs/v1:**
- Purpose: Canonical source for V1 production prompts and tools
- Contains: System prompt, Node-RED flows, Flowise tool definitions, extracted JavaScript functions
- Key files: `Chord_Cloud9_SystemPrompt.md`, `nodered_Cloud9_flows.json`, `patient_tool_func.js`, `scheduling_tool_func.js`

**tenants/{slug}:**
- Purpose: Tenant-specific configuration files
- Contains: v1/ (tenant prompts/tools), nodered/ (tenant flows)
- Key files: Tenant-specific overrides of default V1 files

**shared/services:**
- Purpose: Shared service implementations used across applications
- Contains: Langfuse service, LLM provider, Claude CLI service
- Key files: `langfuse-service.ts`, `langfuse-context.ts`, `llm-provider.ts`

## Key File Locations

**Entry Points:**
- `backend/src/server.ts`: Backend server initialization
- `frontend/src/main.tsx`: Frontend React app mount
- `test-agent/src/index.ts`: CLI entry point for test agent

**Configuration:**
- `backend/src/config/database.ts`: Database connection factory
- `backend/src/config/cloud9.ts`: Cloud9 API credentials and endpoints
- `backend/.env`: Environment variables (not committed)
- `frontend/vite.config.ts`: Vite dev server config with API proxy

**Core Logic:**
- `backend/src/services/cloud9/client.ts`: Cloud9 API client
- `backend/src/middleware/tenantContext.ts`: Multi-tenant middleware
- `frontend/src/services/api/client.ts`: Axios API client with auth interceptors
- `test-agent/src/core/agent.ts`: Test orchestration engine

**Testing:**
- `test-agent/data/test-results.db`: Test results storage
- `test-agent/src/tests/scenarios/`: Test scenario definitions
- `backend/src/controllers/testMonitorController.ts`: Test execution API

## Naming Conventions

**Files:**
- Controllers: `{domain}Controller.ts` (e.g., `patientController.ts`)
- Models: `{Entity}.ts` with PascalCase (e.g., `Patient.ts`)
- Services: `{purpose}Service.ts` (e.g., `authService.ts`)
- Components: `{ComponentName}.tsx` with PascalCase
- Redux slices: `{domain}Slice.ts` with camelCase (e.g., `authSlice.ts`)
- API services: `{domain}Api.ts` (e.g., `patientApi.ts`)

**Directories:**
- camelCase for feature directories: `goalTestCases/`, `testMonitor/`
- kebab-case for route paths: `test-monitor/`, `goal-cases/`
- PascalCase for component directories when matching component name

**Variables:**
- camelCase for functions and variables
- PascalCase for types, interfaces, classes
- SCREAMING_SNAKE_CASE for constants

## Where to Add New Code

**New API Endpoint:**
- Primary code: `backend/src/controllers/{domain}Controller.ts`
- Route definition: `backend/src/routes/{domain}.ts`
- API client method: `frontend/src/services/api/{domain}Api.ts`
- Tests: `test-agent/scripts/test-{feature}.js`

**New Frontend Page:**
- Implementation: `frontend/src/pages/{Feature}/{PageName}.tsx`
- Route definition: `frontend/src/routes/AppRouter.tsx`
- Redux slice (if needed): `frontend/src/store/slices/{domain}Slice.ts`
- Components: `frontend/src/components/features/{feature}/`

**New Database Table:**
- Migration: `backend/src/database/migrations/{number}_{description}.ts`
- Model: `backend/src/models/{Entity}.ts`
- Schema update: `backend/src/database/schema.sql`

**New Cloud9 Integration:**
- Service: `backend/src/services/{purpose}Service.ts`
- XML builder: `backend/src/services/cloud9/xmlBuilder.ts`
- Controller: Extend `backend/src/controllers/{domain}Controller.ts`

**New Test Scenario:**
- Scenario file: `test-agent/src/tests/scenarios/{category}.ts`
- Database seed: Insert into `goal_test_cases` table
- Execution script: `test-agent/scripts/test-{scenario}.js`

**New Tenant:**
- Database record: Insert into `tenants` table via Admin UI
- V1 files: `tenants/{slug}/v1/` (optional overrides)
- Node-RED flows: `tenants/{slug}/nodered/` (optional overrides)

**Utilities:**
- Shared helpers: `shared/services/` or `shared/types/`
- Backend utils: `backend/src/utils/`
- Frontend utils: `frontend/src/utils/`
- Test utils: `test-agent/src/utils/`

## Special Directories

**backend/logs:**
- Purpose: Application logs (rate limit errors, etc.)
- Generated: Yes, at runtime
- Committed: No (in .gitignore)

**backend/dist:**
- Purpose: Compiled TypeScript output
- Generated: Yes, by `tsc`
- Committed: No

**frontend/dist:**
- Purpose: Vite production build output
- Generated: Yes, by `vite build`
- Committed: No

**nodered/bk_up:**
- Purpose: Node-RED flow backups created before deployments
- Generated: Yes, by deployment scripts
- Committed: Yes (for disaster recovery)

**test-agent/data/reports:**
- Purpose: Generated test reports (markdown, JSON)
- Generated: Yes, by test-agent reporters
- Committed: No

**.planning:**
- Purpose: GSD planning artifacts (codebase analysis, phases, milestones)
- Generated: Yes, by GSD agents
- Committed: Yes (tracks project planning)

**.claude/hooks:**
- Purpose: Git hooks for syncing V1 files to Langfuse/database
- Generated: No, manually created
- Committed: Yes

**node_modules:**
- Purpose: NPM dependencies
- Generated: Yes, by `npm install`
- Committed: No

---

*Structure analysis: 2026-02-09*

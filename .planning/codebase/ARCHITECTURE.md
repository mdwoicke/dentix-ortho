# Architecture

**Analysis Date:** 2026-02-09

## Pattern Overview

**Overall:** Multi-Tenant Monorepo with Separate Backend API, Frontend SPA, and Test Agent CLI

**Key Characteristics:**
- Three distinct applications sharing types and services via `shared/` directory
- Multi-tenant architecture with tenant-specific Cloud9/Flowise/Langfuse configurations
- Synchronous SQLite database operations (better-sqlite3) for predictable behavior
- Static model methods pattern for database access (no ORM)
- Redux Toolkit for frontend state management with RTK Query-like async thunks
- AI-powered testing infrastructure with Langfuse observability tracing

## Layers

**Presentation Layer (Frontend):**
- Purpose: React SPA providing UI for Cloud9 API management and test monitoring
- Location: `frontend/src`
- Contains: Pages, components, routing, Redux store slices
- Depends on: Backend API via Axios client, local state in Redux store
- Used by: End users (administrators, QA engineers)

**API Layer (Backend):**
- Purpose: Express REST API serving as proxy to Cloud9 API with caching and tenant isolation
- Location: `backend/src`
- Contains: Routes, controllers, middleware, Cloud9 service integrations
- Depends on: SQLite databases (dentix.db for app data, test-results.db for test data)
- Used by: Frontend app, test-agent CLI, external clients

**Service Layer (Backend):**
- Purpose: Business logic, external API integration, caching, AI enhancement
- Location: `backend/src/services`
- Contains: 37+ services including Cloud9Client, authService, alertEngine, expertAgentService
- Depends on: Database models, external APIs (Cloud9, Flowise, Langfuse, Anthropic Claude)
- Used by: Controllers, other services

**Data Access Layer:**
- Purpose: Static model classes providing type-safe database operations
- Location: `backend/src/models`, `test-agent/src/storage`
- Contains: Patient, Appointment, Location, Provider, User, Tenant models
- Depends on: SQLite databases via better-sqlite3
- Used by: Services and controllers

**Test Orchestration Layer:**
- Purpose: E2E testing framework with goal-oriented test execution
- Location: `test-agent/src`
- Contains: Test runner, Flowise client, Langfuse tracer, analysis engines
- Depends on: Backend API, Flowise chatflow, Langfuse observability platform
- Used by: CI/CD pipelines, QA engineers via CLI

**Shared Layer:**
- Purpose: Common types, services, and utilities shared across backend/frontend/test-agent
- Location: `shared/`
- Contains: Langfuse service, LLM provider, Claude CLI service, type definitions
- Depends on: External SDKs (Anthropic, Langfuse)
- Used by: All three applications

## Data Flow

**Cloud9 API Request Flow:**

1. Frontend dispatches Redux async thunk (e.g., `fetchPatients`)
2. API client sends HTTP request with JWT token and X-Tenant-Id header
3. Backend middleware resolves tenant context from header or user's default tenant
4. Controller validates auth via `requireAdmin()` helper (inline, not middleware)
5. Service layer fetches data from Cloud9 API using tenant-specific credentials
6. Cloud9Client builds XML request, sends HTTP POST to Cloud9 endpoint
7. XML response parsed and cached in SQLite with tenant_id column
8. Response returned to frontend with `cached: false` flag (caching disabled)
9. Frontend stores in Redux slice and renders UI

**Multi-Tenant Isolation:**

1. All database tables include `tenant_id` column (added in migration 001)
2. Middleware reads `X-Tenant-Id` header or JWT payload to resolve tenant
3. TenantContext attached to `req.tenantContext` with cloud9/flowise/langfuse configs
4. All model methods require `tenantId` parameter for queries
5. Frontend TenantSelector component dispatches tenant switch action
6. API client includes `X-Tenant-Id` header on all subsequent requests

**Test Execution Flow:**

1. CLI invokes `test-agent/src/index.ts` with goal test scenario
2. GoalTestRunner creates Langfuse trace context via `runWithTrace()`
3. FlowiseClient sends initial message to chatflow with persona/goals
4. Flowise chatflow invokes Node-RED tools (patient lookup, scheduling)
5. Node-RED calls backend API endpoints to fetch Cloud9 data
6. Test agent evaluates conversation against success criteria
7. Results stored in `test-results.db` with Langfuse trace ID
8. Backend alertEngine monitors test results and triggers notifications

## State Management

**Frontend State (Redux Toolkit):**
- Global state managed in `frontend/src/store/store.ts` with 10+ slices
- Auth state (token, user, tenants) persisted to localStorage
- Tenant state (current tenant, available tenants) synced with backend
- UI state (sidebar, toasts, modals) ephemeral
- Reference data (locations, providers, appointment types) cached in Redux
- Async operations use createAsyncThunk pattern with pending/fulfilled/rejected states

**Backend State:**
- Stateless request handling (no session middleware)
- JWT tokens carry user identity and default tenant
- Database serves as single source of truth
- In-memory caching disabled (ENABLE_CACHING=false) for real-time Cloud9 data
- Patient info cache (60s TTL) prevents rate limiting on repeated lookups

## Key Abstractions

**TenantContext:**
- Purpose: Encapsulates all tenant-specific configuration (Cloud9, Flowise, Langfuse)
- Examples: `backend/src/middleware/tenantContext.ts`
- Pattern: Request-scoped context object attached to Express req

**Cloud9Client:**
- Purpose: Abstraction over Cloud9 XML-based API with retry logic and rate limit handling
- Examples: `backend/src/services/cloud9/client.ts`
- Pattern: Class-based service with environment-aware configuration

**Model (Static Methods):**
- Purpose: Type-safe database access without ORM overhead
- Examples: `PatientModel.getByGuid(tenantId, guid)`, `TenantModel.getById(id)`
- Pattern: Static class methods returning typed results from prepared statements

**Redux Slice:**
- Purpose: Domain-specific state management with actions and reducers
- Examples: `authSlice`, `tenantSlice`, `testMonitorSlice`
- Pattern: RTK createSlice with extraReducers for async thunks

**GoalOrientedTestCase:**
- Purpose: Declarative test definition with persona, goals, and success criteria
- Examples: Tests in `test-agent/src/tests/scenarios/goal-happy-path.ts`
- Pattern: TypeScript interface with JSON-serializable config

## Entry Points

**Backend Server:**
- Location: `backend/src/server.ts`
- Triggers: `npm run dev` or `node dist/server.js`
- Responsibilities: Initialize database, run migrations, seed admin, start Express server on port 3002

**Frontend SPA:**
- Location: `frontend/src/main.tsx`
- Triggers: Browser loads `index.html`, Vite dev server at port 5174
- Responsibilities: Mount React app, initialize Redux Provider and ThemeProvider

**Test Agent CLI:**
- Location: `test-agent/src/index.ts`
- Triggers: `npm run start` with CLI arguments
- Responsibilities: Parse commands (run/diagnose/report), execute tests, generate reports

**Application Router:**
- Location: `frontend/src/routes/AppRouter.tsx`
- Triggers: React Router initialization
- Responsibilities: Route protection, layout nesting, auth state initialization

## Error Handling

**Strategy:** Centralized error middleware with typed error responses and Langfuse observability

**Patterns:**
- Controllers wrapped in `asyncHandler()` for consistent error catching
- Cloud9Client retries on transient failures (timeout, rate limit)
- Frontend API client intercepts 401/403 and redirects to login
- Langfuse traces capture errors with severity scoring (CRITICAL/HIGH/MEDIUM/LOW)
- AlertEngine monitors error patterns and triggers notifications
- Rate limit errors (Cloud9 error code 8) logged to `backend/logs/rate-limit-errors.md`

## Cross-Cutting Concerns

**Logging:** Winston logger with structured logs (JSON format), separate loggers for HTTP, DB, Cloud9 operations

**Validation:** Zod schemas for API request/response validation, TypeScript strict mode for compile-time checks

**Authentication:** JWT tokens (8hr expiry) with bcryptjs password hashing, inline auth checks in controllers via `requireAdmin()`

**Tenant Isolation:** Middleware resolves tenant from X-Tenant-Id header, all queries filtered by tenant_id

**AI Observability:** Langfuse tracing for all test executions, chatbot conversations, and AI-generated fixes

**Caching:** Disabled by default (ENABLE_CACHING=false), infrastructure exists but database writes commented out

**Version Management:** V1 files in `docs/v1/` synced to Langfuse and SQLite, version history tracked in `prompt_version_history` table

---

*Architecture analysis: 2026-02-09*

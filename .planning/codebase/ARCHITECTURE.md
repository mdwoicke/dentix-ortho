# Architecture

**Analysis Date:** 2026-02-02

## Pattern Overview

**Overall:** Three-tier REST API architecture with separated frontend and backend, communicating via HTTP.

**Key Characteristics:**
- Layered controller-service-model pattern for API logic
- Centralized Express application with middleware pipeline
- SQLite database with Better-SQLite3 for fast synchronous operations
- Redux state management on frontend
- Cloud 9 Ortho XML-based SOAP-like API integration via proxy
- Test execution and monitoring infrastructure with real-time streaming

## Layers

**Presentation Layer (Frontend):**
- Purpose: React-based SPA providing user interfaces for patient/appointment management and test monitoring
- Location: `frontend/src/`
- Contains: React components, pages, Redux store, API client services
- Depends on: Backend API at `/api/`, Node-RED, Cloud 9 APIs (via proxy)
- Used by: End users via browser

**API Layer (Backend):**
- Purpose: Express.js REST API handling business logic, routing, and Cloud 9 integration
- Location: `backend/src/`
- Contains: Controllers, routes, middleware, error handling
- Depends on: Services layer, database, external APIs (Cloud 9, Flowise, Langfuse)
- Used by: Frontend application, test runners, external systems

**Service Layer (Backend):**
- Purpose: Business logic, API client implementations, data transformations
- Location: `backend/src/services/`
- Contains: Cloud9 client, test execution logic, prompt management, deployment services
- Depends on: Models, database, external clients (axios, langfuse)
- Used by: Controllers

**Model/Data Layer (Backend):**
- Purpose: Database schema, ORM-like patterns, data access
- Location: `backend/src/models/`, `backend/src/database/`
- Contains: Patient, Appointment, User, Location models; database config
- Depends on: Better-SQLite3, database connection
- Used by: Services and controllers

**State Management (Frontend):**
- Purpose: Centralized Redux store for UI and domain state
- Location: `frontend/src/store/slices/`
- Contains: Auth, reference data, patients, appointments, test execution state
- Depends on: API services
- Used by: React components via react-redux

## Data Flow

**Patient/Appointment Operations:**

1. User interaction in `frontend/src/components/` (e.g., AppointmentWizard)
2. Component dispatches Redux action from `frontend/src/store/slices/`
3. Redux thunk calls API client at `frontend/src/services/api/` (e.g., patientApi, appointmentApi)
4. Frontend makes HTTP request to backend `/api/patients/` or `/api/appointments/`
5. Express router at `backend/src/routes/patients.ts` or `appointments.ts` routes to controller
6. Controller at `backend/src/controllers/` calls Cloud 9 service
7. Cloud 9 service at `backend/src/services/cloud9/client.ts` builds XML request
8. Service calls `backend/src/services/cloud9/xmlBuilder.ts` to construct XML
9. Axios makes HTTP GET to Cloud 9 API (production or sandbox)
10. Response XML parsed by `backend/src/services/cloud9/xmlParser.ts`
11. Data transformed and optionally cached via `backend/src/models/`
12. Response returned to frontend
13. Redux store updated with results
14. Component re-renders with new data

**Test Execution Flow:**

1. User initiates test run from `frontend/src/pages/TestMonitor/`
2. Frontend calls `/api/test-monitor/runs/start` with test configuration
3. Controller at `backend/src/controllers/testMonitorController.ts` receives request
4. Service `backend/src/services/goalTestService.ts` spawns test process via Node.js child process
5. Test runner in `test-agent/src/tests/` executes test goals against Flowise
6. Results streamed back via SSE endpoint `/api/test-monitor/execution/:runId/stream`
7. Real-time conversation/API call updates sent to frontend
8. Frontend renders live progress via `TestExecutionSlice` Redux state
9. Results persisted to `test-agent/data/test-results.db` (separate SQLite database)

**State Management Flow:**

1. User logs in on `frontend/src/pages/Auth/LoginPage.tsx`
2. Credentials sent to `/api/auth/login`
3. Backend validates against `backend/src/models/User.ts`
4. JWT token returned and stored in localStorage via `authSlice`
5. All subsequent API requests include token in Authorization header
6. Protected routes use `ProtectedRoute` component to guard access
7. Redux middleware persists auth state for page reloads

**Cache Management:**

1. Reference data (locations, providers, appointment types) cached in models
2. Patient information cached with 60-second TTL in `Cloud9Client` to prevent rate limiting
3. Caching disabled by default via `ENABLE_CACHING` environment variable
4. When enabled, data persisted to SQLite models tables via `Model.bulkUpsert()`
5. Cache cleared on appointment actions (cancel, confirm)

## Key Abstractions

**Cloud9Client:**
- Purpose: Encapsulates XML building, HTTP requests, response parsing for Cloud 9 API
- Examples: `backend/src/services/cloud9/client.ts`, `xmlBuilder.ts`, `xmlParser.ts`
- Pattern: Procedural-style methods (getLocations, getPatient, setAppointment) that return parsed Cloud9 response objects
- Usage: Controllers instantiate via `createCloud9Client(environment)` and call methods

**Model Classes:**
- Purpose: Data access layer abstraction for database operations
- Examples: `backend/src/models/Patient.ts`, `Appointment.ts`, User.ts
- Pattern: Static class with methods (getAll, getById, upsert, delete)
- Usage: Services call Model.method() to access/modify data

**Redux Slices:**
- Purpose: Encapsulate domain state shape and async thunk actions
- Examples: `frontend/src/store/slices/patientSlice.ts`, `appointmentSlice.ts`
- Pattern: Slice creator with reducers and async thunks using createAsyncThunk
- Usage: Components dispatch actions and select state via useAppSelector, useAppDispatch hooks

**API Services (Frontend):**
- Purpose: Abstraction over axios for API endpoints
- Examples: `frontend/src/services/api/patientApi.ts`, `appointmentApi.ts`, `testMonitorApi.ts`
- Pattern: Named exports for get/post/put operations (patientApi.getPatients, appointmentApi.createAppointment)
- Usage: Redux thunks call these services; components never call HTTP directly

**Controllers:**
- Purpose: HTTP request/response handling and orchestration
- Examples: `backend/src/controllers/patientController.ts`, `appointmentController.ts`
- Pattern: Exported async functions wrapped in asyncHandler middleware for error catching
- Usage: Routes map HTTP verbs to controller functions

## Entry Points

**Backend Server:**
- Location: `backend/src/server.ts`
- Triggers: `npm run dev` in backend directory
- Responsibilities:
  - Loads environment variables from `.env`
  - Initializes database connection with WAL mode
  - Seeds master admin account
  - Starts Express server on PORT (default 3002) and HOST (default 0.0.0.0)
  - Sets up graceful shutdown handlers
  - Initializes test run cleanup service

**Frontend Application:**
- Location: `frontend/src/main.tsx`
- Triggers: `npm run dev` in frontend directory (Vite server on port 5174)
- Responsibilities:
  - Mounts React app to DOM root
  - Wraps app in Redux Provider and ThemeProvider
  - Initializes auth state on load
  - Sets up protected routes and navigation

**Express Application:**
- Location: `backend/src/app.ts`
- Triggers: Imported by server.ts
- Responsibilities:
  - Creates Express instance
  - Registers global middleware (CORS, body parsers, request logging)
  - Mounts all route modules (reference, patients, appointments, auth, admin, testMonitor, etc.)
  - Registers error handlers

**Router Modules:**
- Location: `backend/src/routes/*.ts` (appointments.ts, patients.ts, reference.ts, testMonitor.ts, etc.)
- Responsibilities: Define HTTP endpoints and map to controller functions

## Error Handling

**Strategy:** Centralized middleware-based approach with custom error class.

**Patterns:**
- Custom `AppError` class in `backend/src/middleware/errorHandler.ts` with statusCode property
- `asyncHandler` wrapper function catches async errors and passes to global handler
- Global error middleware logs error and returns JSON response with status code
- 404 handler returns 404 for unmatched routes
- Error responses include stack trace only in development mode

**Example:**
```typescript
// Controller
export const getPatient = asyncHandler(async (req, res) => {
  if (!patientGuid) {
    throw new AppError('Patient GUID required', 400);
  }
  // ...
});

// Middleware catches and handles error response
```

## Cross-Cutting Concerns

**Logging:**
- Winston logger in `backend/src/utils/logger.ts` with categorized loggers (httpRequest, httpResponse, cloud9Request, etc.)
- Logs to console (development) and file (production-ready)
- Request/response middleware logs all HTTP traffic with duration

**Validation:**
- Zod schema validation in frontend (forms with react-hook-form)
- Backend validates environment values via `isValidEnvironment()` checks
- Cloud 9 API validation via XML parsing (any parse errors thrown)

**Authentication:**
- JWT tokens issued by `/api/auth/login` endpoint
- Tokens verified in `authSlice` middleware on app load
- Protected routes use `ProtectedRoute` component checking auth state
- Backend controllers can check JWT via request header (if authenticated routes added)

**CORS:**
- Configured in `backend/src/middleware/cors.ts`
- Allows frontend development server (localhost:5174) and production origins
- Vite dev server proxies API requests to backend to avoid CORS issues in development

**Environment Management:**
- Cloud 9 environment (sandbox/production) specified via:
  - `X-Environment` header
  - `environment` query parameter
  - Defaults to sandbox
- Validated in controllers before use

---

*Architecture analysis: 2026-02-02*

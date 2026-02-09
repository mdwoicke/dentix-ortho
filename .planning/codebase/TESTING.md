# Testing Patterns

**Analysis Date:** 2026-02-09

## Test Framework

**Runner:**
- Backend: No test framework detected (package.json has `"test": "echo \"Error: no test specified\" && exit 1"`)
- Frontend: No test framework detected
- Integration testing done via manual scripts in `test-agent/` directory

**Assertion Library:**
- None detected

**Run Commands:**
```bash
# Backend (not configured)
npm test                   # Returns error

# Frontend (not configured)
npm test                   # Not defined

# Manual testing
cd test-agent && node scripts/<test-script>.js
```

## Test File Organization

**Location:**
- No `.test.ts` or `.spec.ts` files found in `backend/src/` or `frontend/src/`
- Manual test scripts located in `test-agent/scripts/` (500+ JavaScript files)
- Test data stored in `test-agent/data/test-results.db` (SQLite)

**Naming:**
- Test scripts use kebab-case with descriptive names (e.g., `test-booking-isolation.js`, `verify-cloud9-appointments.js`)
- Internal/temporary scripts prefixed with underscore (e.g., `_check-session.js`, `_debug-booking.js`)
- Analysis scripts: `analyze-*.js` (e.g., `analyze-flows.js`, `analyze-timing.js`)

**Structure:**
```
test-agent/
├── scripts/           # 500+ manual test scripts
│   ├── test-*.js     # Test execution scripts
│   ├── verify-*.js   # Verification scripts
│   ├── check-*.js    # Health check scripts
│   ├── analyze-*.js  # Analysis scripts
│   └── _*.js         # Internal/debug scripts
├── data/             # Test results and logs
└── *.db              # SQLite database for test tracking
```

## Test Structure

**Suite Organization:**
- No formal test suites
- Manual scripts run independently via Node.js
- Scripts typically connect to SQLite database for test data
- Use `better-sqlite3` for synchronous database operations

**Patterns:**
```javascript
// Typical script structure (inferred from file names)
// 1. Connect to database
// 2. Execute test operation (API call, data check, etc.)
// 3. Log results to file or database
// 4. Exit with status code

// Example script categories:
// - test-booking-*.js: Test appointment booking flows
// - check-*.js: Health checks for services
// - verify-*.js: Verification of data integrity
// - analyze-*.js: Post-test analysis
```

**Test Data:**
- Test database: `test-agent/data/test-results.db`
- Tables include: `goal_test_results`, `test_runs`, `prompt_version_history`, `flowise_configs`
- Production tracking: `prod_test_records` table for production call monitoring

## Mocking

**Framework:** Not detected

**Patterns:**
- No mocking infrastructure detected
- Tests run against actual Cloud9 sandbox/production APIs
- Environment switching via `X-Environment` header (`sandbox` or `production`)

**What to Mock:**
- Not applicable - integration testing approach used

**What NOT to Mock:**
- Cloud9 API (tests run against real sandbox environment)

## Fixtures and Factories

**Test Data:**
- Test data managed via SQLite database (`test-agent/data/test-results.db`)
- Fixtures appear to be database records rather than code-based factories
- No TypeScript/JavaScript fixture files detected

**Location:**
- Database: `test-agent/data/test-results.db`
- Logged results: `test-agent/data/*.json`, `test-agent/data/*.txt`

## Coverage

**Requirements:** Not enforced

**View Coverage:**
```bash
# No coverage tooling detected
```

**Current State:**
- No automated unit tests
- No coverage metrics
- Integration testing via manual scripts against sandbox/production

## Test Types

**Unit Tests:**
- Not present
- No Jest, Vitest, Mocha, or similar framework configured

**Integration Tests:**
- Primary testing approach
- Manual scripts in `test-agent/scripts/` test full flows
- Examples: booking appointments, patient creation, API health checks

**E2E Tests:**
- Manual scripts simulate end-to-end flows
- Test categories observed:
  - Booking flows: `test-booking-*.js`
  - Cloud9 integration: `test-cloud9-*.js`
  - Cache operations: `test-cache-*.js`
  - Session tracking: `test-session-*.js`

## Common Patterns

**Async Testing:**
- Scripts use async/await (Node.js runtime)
- Axios for HTTP requests
- `better-sqlite3` for synchronous database access

**Error Testing:**
- Error logging to files (`test-agent/data/*-log.txt`)
- Rate limit error tracking in `backend/logs/rate-limit-errors.md`
- Custom error handling in Cloud9 client (`backend/src/services/cloud9/client.ts`)

**Integration Testing Pattern:**
```javascript
// Inferred from script naming and database schema
// 1. Setup test run in database
const runId = insertTestRun({ flowise_config_id, environment, ... });

// 2. Execute test (e.g., API call to Cloud9)
const response = await axios.post('/api/appointments/create', { ... });

// 3. Log results
insertGoalTestResult({ run_id: runId, status: 'passed', ... });

// 4. Analyze (separate analysis scripts)
node scripts/analyze-session.js <session_id>
```

**Database-Driven Testing:**
- Tests stored in `goal_test_cases` table
- Results tracked in `goal_test_results` table
- Test runs tracked in `test_runs` table with metadata
- Production calls logged in `prod_test_records` for monitoring

**Environment Handling:**
- Tests specify environment via `X-Environment` header or config
- Sandbox environment for safe testing
- Production environment monitored via production tracker

## Test Infrastructure

**Backend API:**
- Express server provides endpoints for test execution
- Test monitor endpoints: `/api/test-monitor/*`
- Admin endpoints for test management: `/api/admin/*`

**Frontend UI:**
- Test Monitor pages for viewing results (`frontend/src/pages/TestMonitor/`)
- Goal test dashboard
- Test run history viewer
- Trace analysis tools

**Monitoring:**
- Langfuse integration for trace collection (`backend/src/services/langfuseTraceService.ts`)
- Production call tracking (`backend/src/services/prodTestRecordService.ts`)
- Alert engine for anomaly detection (`backend/src/services/alertEngine.ts`)

## Test Workflow

**Manual Test Execution:**
```bash
# 1. Run test script
cd test-agent && node scripts/test-booking-isolation.js

# 2. Check results in database
node scripts/check-test-records.js

# 3. Analyze failures
node scripts/analyze-failure-pattern.js
```

**Automated Testing:**
- No CI/CD pipeline detected
- No automated test runs on commit/PR
- Tests run manually by developers

**Test Data Management:**
- Test patients created via `SetPatient` Cloud9 API
- Test appointments created via `SetAppointment` API
- Cleanup scripts: `cleanup-prod-test-records.js`

## Recommendations for Improvement

**Missing Unit Tests:**
- Add Jest or Vitest for backend unit testing
- Test models, services, utilities in isolation
- Target coverage: Controllers, Models, Services

**Missing Frontend Tests:**
- Add Vitest + React Testing Library
- Test components, hooks, utilities
- Test Redux slices and async thunks

**Automated Integration Tests:**
- Convert manual scripts to automated test suite
- Use test framework for assertions and reporting
- Run on CI/CD pipeline

**Test Organization:**
- Co-locate unit tests with source files (`*.test.ts` pattern)
- Separate integration tests in dedicated directory
- Use test fixtures/factories for consistent test data

---

*Testing analysis: 2026-02-09*

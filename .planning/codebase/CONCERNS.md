# Codebase Concerns

**Analysis Date:** 2026-02-09

## Tech Debt

**Hardcoded Credentials in Script Files:**
- Issue: Production Cloud9 API credentials are hardcoded in multiple ad-hoc scripts
- Files: `backend/src/check-300m-all.ts`, `backend/src/find-allegheny-202-patients.ts`, `backend/src/find-allegany-chair8.ts`, `backend/src/find-chair8-both-locations.ts`, `backend/src/find-past-appointments.ts`, `backend/src/find-past-chair8.ts`, `backend/src/find-allegheny-202-fast.ts`, `backend/src/find-allegany-appt-types.ts`
- Impact: Security risk if these files are committed to public repositories. Credentials (`password: '$#1Nt-p33R-AwS#$'`) are visible in plain text. Makes credential rotation difficult.
- Fix approach: Extract credentials to environment variables or use the existing Cloud9Config system from `backend/src/config/cloud9.ts`. Delete or move these scripts to a separate utilities directory excluded from version control.

**Caching Infrastructure Disabled But Still Present:**
- Issue: Caching disabled via `ENABLE_CACHING=false` but all caching code (tables, services, TTL logic) remains in codebase
- Files: `backend/src/services/cacheService.ts`, `backend/src/controllers/referenceController.ts`, `backend/src/controllers/patientController.ts`, `backend/src/controllers/appointmentController.ts`
- Impact: Dead code increases maintenance burden. Database tables (`cache_metadata`) created but unused. Confusing for new developers.
- Fix approach: Either remove all caching code or restore it. Document decision in architecture docs. If keeping for future use, mark classes/methods as `@deprecated` with clear comments.

**Deprecated Endpoint Still Registered:**
- Issue: `/api/appointments/date-range` endpoint marked deprecated but still registered and returns HTTP 410 Gone
- Files: `backend/src/controllers/appointmentController.ts` (line 848-872)
- Impact: Keeps route handler logic in codebase. Misleading API surface. Frontend might still attempt to call it.
- Fix approach: Remove route registration entirely and let 404 handler catch it, or keep if backward compatibility needed but add expiry date comment.

**Console.log Used Instead of Logger:**
- Issue: 852 instances of `console.log/warn/error` across 44 backend files instead of structured logging
- Files: Widespread in `backend/src/services/`, `backend/src/controllers/`, utility scripts
- Impact: Lost log context (no timestamps, request IDs, severity levels). Difficult to filter logs in production. Performance overhead.
- Fix approach: Replace with `logger.info()`, `logger.warn()`, `logger.error()` from `backend/src/utils/logger.ts`. Add eslint rule to prevent future console usage.

**Multi-Tenancy Migration Runs on Every Startup:**
- Issue: Migration `001_add_multi_tenancy.ts` checks if already applied but runs on every server start
- Files: `backend/src/database/migrations/001_add_multi_tenancy.ts`
- Impact: Unnecessary database queries on startup. No central migration tracking. Fragile check (just checks table existence).
- Fix approach: Implement proper migration system with `migrations` table tracking applied migrations by ID and timestamp. Use migration library like `better-sqlite3-migrations` or custom system.

**V1 File Version Synchronization Complexity:**
- Issue: Complex manual sync requirements for V1 files across multiple locations (filesystem, SQLite, Langfuse, Flowise)
- Files: `docs/v1/*.js`, `docs/v1/*.md`, `backend/scripts/save-v31-prompt.js`, `.claude/hooks/sync-v1-to-langfuse.js`
- Impact: High risk of version drift. Manual steps easy to forget. CLAUDE.md warns "ALWAYS run script - NO EXCEPTIONS" indicates fragility.
- Fix approach: Create unified version management service. Single source of truth. Automated deployment pipeline with validation. Consider Git-based versioning instead of database.

**Escaped vs Unescaped File Confusion:**
- Issue: Flowise requires Mustache escaping (`{` → `{{`) for system prompts but NOT tools, leading to separate escaped/unescaped files
- Files: `docs/v1/system_prompt_escaped.md`, `docs/v1/Chord_Cloud9_SystemPrompt.md`, `docs/v1/scheduling_tool_func.js`, `docs/v1/scheduling_tool_func_escaped.js`
- Impact: Easy to deploy wrong version. Escaping tools breaks JavaScript syntax. Manual escaping error-prone.
- Fix approach: Automate escaping during deployment. Have single source file, generate escaped version programmatically. Add validation to reject escaped tool code.

## Known Bugs

**Flowise Integer Parameter Bug:**
- Issue: Flowise drops integer-typed parameters as `undefined`, breaking `numberOfPatients` in scheduling tool
- Files: `docs/v1/scheduling_tool_func.js` (v91 changelog)
- Symptoms: Sibling booking fails when LLM doesn't provide `numberOfPatients`. Tool receives `undefined` instead of integer.
- Workaround: Changed schema type from `integer` to `string`, parse with `parseInt()` in tool code
- Permanent fix: Report bug to Flowise team or migrate to different LLM orchestration platform

**Rate Limiting Errors (Code 8):**
- Issue: Cloud9 API returns rate limit errors logged to markdown file
- Files: `backend/src/services/cloud9/client.ts` (line 55-89), `backend/logs/rate-limit-errors.md`
- Symptoms: API calls fail with error code 8, logged but not handled gracefully
- Workaround: Short-term cache for `GetPatientInformation` (60s TTL) to reduce duplicate calls
- Permanent fix: Implement request queue with rate limiting. Add exponential backoff retry logic. Monitor rate limit threshold.

**Missing Child Name Warnings:**
- Issue: LLM sometimes doesn't provide `childName` during booking flow
- Files: `docs/v1/scheduling_tool_func.js` (lines 356, 381, 772)
- Symptoms: Console warnings "WARNING: No childName provided", "WARNING: Child X has no childName"
- Trigger: LLM skips `childName` field in tool call parameters
- Workaround: Fallback to extract from `$flow` context (fragile)
- Permanent fix: Make `childName` required in tool schema. Add server-side validation with clear error response.

**Session ID Fallback to UUI:**
- Issue: When `$flow.sessionId` unavailable, falls back to `uui` (unique user identifier), breaking cross-session reservation filtering
- Files: `docs/v1/scheduling_tool_func.js` (line 684)
- Symptoms: Multiple callers can book same slot if UUI is reused
- Trigger: Flowise doesn't populate `$flow.sessionId` or `$flow.chatId`
- Workaround: Explicit warning logged to console
- Permanent fix: Ensure Flowise always sets session ID. Add validation to reject calls without valid session ID.

## Security Considerations

**Hardcoded JWT Secret:**
- Risk: JWT secret uses default value if `JWT_SECRET` env var not set
- Files: `backend/src/services/authService.ts` (line 13)
- Current mitigation: Default secret `'dentix-ortho-secret-key-change-in-production'` with clear warning
- Recommendations: Fail server startup if `JWT_SECRET` not provided in production mode. Generate random secret on first run and save to secure config file.

**Master Admin Credentials in Code:**
- Risk: Master admin email/password hardcoded in source code
- Files: `backend/src/services/authService.ts` (lines 17-21)
- Current mitigation: Only used for database seeding, but credentials visible in codebase
- Recommendations: Move to environment variables. Use secure credential vault for production. Hash password in code, store hash as constant.

**Tenant Credentials in SQLite Database:**
- Risk: Cloud9 credentials, Node-RED passwords, Langfuse keys stored in plaintext in `tenants` table
- Files: `backend/src/database/migrations/001_add_multi_tenancy.ts` (lines 40-54)
- Current mitigation: Database file permissions, but no encryption at rest
- Recommendations: Encrypt sensitive columns using SQLite encryption extension or application-level encryption. Store credentials in dedicated secret manager (AWS Secrets Manager, HashiCorp Vault).

**API Credentials in Migration File:**
- Risk: Migration reads credentials from `PRODUCTION_CONFIG` and `SANDBOX_CONFIG` which come from environment variables
- Files: `backend/src/database/migrations/001_add_multi_tenancy.ts` (lines 128-144)
- Current mitigation: Uses existing config system, but credentials written to database
- Recommendations: Encrypt before storing. Add audit log for credential access.

**No Request Size Limits:**
- Risk: Express JSON parser has no size limit configured
- Files: `backend/src/app.ts` (line 33)
- Current mitigation: None visible
- Recommendations: Add `express.json({ limit: '10mb' })` to prevent DoS via large payloads.

**CORS Wildcard or Overly Permissive:**
- Risk: Need to verify CORS configuration doesn't allow arbitrary origins
- Files: `backend/src/middleware/cors.ts`
- Current mitigation: Unknown without reading cors.ts
- Recommendations: Audit CORS config. Whitelist specific origins. Avoid `Access-Control-Allow-Origin: *` in production.

## Performance Bottlenecks

**11,095-Line Controller:**
- Problem: `testMonitorController.ts` is 11,095 lines, far exceeding maintainability threshold
- Files: `backend/src/controllers/testMonitorController.ts`
- Cause: God object antipattern - handles test monitoring, trace analysis, comparisons, AI enhancement, document parsing, goal tests, prompt management, V1 files, Node-RED deployment
- Improvement path: Split into separate controllers: `traceAnalysisController`, `comparisonController`, `v1FileController`, `noderedController`, `promptController`. Extract common logic to services. Reduce controller to routing + validation only.

**Synchronous SQLite Operations:**
- Problem: Using `better-sqlite3` synchronous API in request handlers blocks event loop
- Files: All models (`backend/src/models/*.ts`), services accessing database
- Cause: SQLite operations run synchronously on main thread
- Improvement path: Migrate to `better-sqlite3-worker` for worker thread execution or switch to async driver like `better-sqlite3-async`. Alternatively, use connection pooling with separate worker processes.

**No Database Connection Pooling:**
- Problem: Single database instance shared across all requests
- Files: `backend/src/config/database.ts`
- Cause: Synchronous SQLite doesn't support pooling, relies on SQLite's internal locking
- Improvement path: For read-heavy workloads, implement read replicas. For write-heavy, consider PostgreSQL migration.

**Large JSON Responses from Langfuse:**
- Problem: Trace analysis fetches entire conversation history, can be megabytes for long sessions
- Files: `backend/src/services/langfuseTraceService.ts`
- Cause: No pagination or streaming, loads full trace into memory
- Improvement path: Add pagination to Langfuse API calls. Stream responses. Lazy-load trace details only when needed.

**Excessive Logging in Hot Paths:**
- Problem: Console.log in every request cycle in tools and services
- Files: `docs/v1/scheduling_tool_func.js` (80+ console.log statements), services
- Cause: Debug logging left enabled in production code
- Improvement path: Use log levels (DEBUG, INFO, WARN). Disable debug logs in production via env var. Add structured logging with sampling for high-frequency events.

## Fragile Areas

**Node-RED Flow Deployment:**
- Files: `backend/src/services/noderedDeployService.ts`, `nodered/nodered_Cloud9_flows.json`
- Why fragile: Entire flow replaced on deploy (3000+ line JSON). Single syntax error breaks all flows. No validation before deploy. Backup created but manual restoration.
- Safe modification: Always test in sandbox first. Use `dryRun: true` flag. Keep backups in `nodered/bk_up/` (30+ backups exist). Validate JSON syntax before deploy.
- Test coverage: No automated tests for flow logic

**Flowise Tool Deployment:**
- Files: `docs/v1/scheduling_tool_func.js`, `docs/v1/patient_tool_func.js`
- Why fragile: Tools are 91+ versions deep with complex version history. JavaScript code sent to Flowise, any syntax error breaks chatbot. Escaping confusion (tools must NOT be escaped but prompts must).
- Safe modification: Test in isolated Flowise config first. Use `validate` endpoint before deploy. Increment version number in header. Update App UI prompt versions table.
- Test coverage: Unit tests missing for tool functions

**Multi-Tenancy Context Middleware:**
- Files: `backend/src/middleware/tenantContext.ts`
- Why fragile: Reads `X-Tenant-Id` header, falls back to user's default tenant. If fallback logic fails, wrong tenant's data could be accessed. Recently added (Feb 2026).
- Safe modification: Never modify tenant resolution logic without comprehensive tests. Audit all queries have `tenant_id` filter. Add integration tests for tenant isolation.
- Test coverage: No tenant isolation tests visible

**Session ID Fallback Logic:**
- Files: `docs/v1/scheduling_tool_func.js` (lines 677-687)
- Why fragile: Complex fallback chain: `$flow.sessionId` → `$flow.chatId` → `uui`. Each level has different semantics. UUI fallback breaks reservation filtering.
- Safe modification: Test all three paths. Verify Flowise config populates `$flow.sessionId`. Add server-side validation.
- Test coverage: Manual testing only (test scripts in `test-agent/scripts/`)

**Patient Info Cache:**
- Files: `backend/src/services/cloud9/client.ts` (lines 32-36)
- Why fragile: In-memory Map cache, lost on server restart. No cache invalidation on patient updates. 60s TTL arbitrary.
- Safe modification: Verify patient data not stale. Consider disabling cache or using Redis for persistence.
- Test coverage: No cache invalidation tests

## Scaling Limits

**SQLite Database:**
- Current capacity: Development scale (single file, single writer)
- Limit: ~1000 concurrent requests (SQLite write lock contention). Database file grows unbounded (no cleanup/archiving).
- Scaling path: Migrate to PostgreSQL for production. Implement write-through cache (Redis). Archive old traces/test results.

**In-Memory Caches:**
- Current capacity: `patientInfoCache` Map grows with unique patients
- Limit: Node.js heap size (default 1.4GB on 32-bit, 4GB on 64-bit). No eviction policy.
- Scaling path: Use Redis or Memcached. Add LRU eviction. Monitor memory usage.

**Node-RED Single Instance:**
- Current capacity: Single Node-RED instance handles all Cloud9 API proxy calls
- Limit: Single point of failure. No horizontal scaling. Flow deployment requires restart (downtime).
- Scaling path: Deploy multiple Node-RED instances behind load balancer. Use shared Redis state. Implement blue-green deployments.

**Langfuse API Rate Limits:**
- Current capacity: No rate limiting on Langfuse trace fetching
- Limit: External service rate limits unknown
- Scaling path: Add request queue. Cache frequently accessed traces. Implement backoff/retry.

## Dependencies at Risk

**Node-RED No Version Pinning:**
- Risk: No package-lock.json visible for Node-RED instance, may use different versions across environments
- Impact: Flow JSON format compatibility issues, API changes
- Migration plan: Pin Node-RED version. Document tested version. Add version check in deploy script.

**React 19 (Bleeding Edge):**
- Risk: React 19.2.0 is very recent, may have stability issues
- Impact: Breaking changes, fewer community resources, library incompatibilities
- Migration plan: Monitor for critical bugs. Have rollback plan to React 18.x. Test thoroughly before production deploy.

**Better-SQLite3 Synchronous:**
- Risk: Blocks event loop, doesn't scale for high concurrency
- Impact: Request latency spikes under load
- Migration plan: Switch to async driver or PostgreSQL. Benchmark before migration to justify effort.

**Flowise Platform Lock-In:**
- Risk: Heavy reliance on Flowise-specific features (tool schemas, $flow context, Mustache templating)
- Impact: Difficult to migrate to alternative LLM orchestration platform
- Migration plan: Abstract Flowise-specific code behind interface. Document migration path to LangChain or custom solution.

## Missing Critical Features

**No Automated Testing:**
- Problem: No unit tests, integration tests, or E2E tests visible in `backend/src/` or `frontend/src/`
- Blocks: Confident refactoring, regression prevention, CI/CD pipeline
- Priority: High - 11k line controller, 91 tool versions, multi-tenancy all need test coverage

**No Migration Rollback:**
- Problem: Database migrations run on startup but no rollback mechanism
- Blocks: Safe deployment, disaster recovery
- Priority: Medium - needed before production use

**No Request Authentication on Test Monitor APIs:**
- Problem: `/api/test-monitor/*` endpoints exposed without clear auth requirements
- Blocks: Secure production deployment
- Priority: High - Langfuse traces may contain PII

**No Tenant Isolation Tests:**
- Problem: Multi-tenancy added Feb 2026 but no tests verify tenant data isolation
- Blocks: Production use with multiple tenants (data leakage risk)
- Priority: Critical - security issue

**No Health Checks for Dependencies:**
- Problem: `/health` endpoint only checks server uptime, not Cloud9 API, Langfuse, Node-RED connectivity
- Blocks: Proper monitoring, load balancer integration
- Priority: Medium - needed for production readiness

## Test Coverage Gaps

**No Backend Tests:**
- What's not tested: All controllers, services, models, middleware
- Files: No `*.test.ts` or `*.spec.ts` files in `backend/src/`
- Risk: Regressions in auth, tenant isolation, cache logic, API proxy
- Priority: Critical

**No Frontend Tests:**
- What's not tested: React components, Redux state management, API integration
- Files: No `*.test.tsx` or `*.spec.tsx` files in `frontend/src/`
- Risk: UI regressions, broken workflows
- Priority: High

**No Integration Tests:**
- What's not tested: Full request cycle (Frontend → Backend → Cloud9 API)
- Risk: Environment-specific bugs, configuration errors
- Priority: High - especially for Node-RED and Flowise integrations

**Manual Testing Only:**
- What's not tested: `test-agent/scripts/` contains 200+ manual test scripts
- Risk: Not run consistently, no CI integration, difficult to maintain
- Priority: Medium - convert critical paths to automated tests

---

*Concerns audit: 2026-02-09*

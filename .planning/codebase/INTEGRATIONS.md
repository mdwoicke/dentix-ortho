# External Integrations

**Analysis Date:** 2026-02-02

## APIs & External Services

**Cloud9 Ortho (Dentrix Orthodontic Practice Management):**
- Purpose: Primary practice management system for patient, appointment, and provider data
- SDK/Client: XML-based SOAP API via `axios` HTTP client
- Auth: ClientID, UserName, Password (environment-specific)
- Endpoints:
  - Production: `https://us-ea1-partner.cloud9ortho.com/GetData.ashx`
  - Sandbox: `https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx`
- Implementation: `backend/src/services/cloud9/client.ts`, `backend/src/services/cloud9/xmlBuilder.ts`, `backend/src/services/cloud9/procedures.ts`
- Credentials: Environment variables `CLOUD9_PROD_*` and `CLOUD9_SANDBOX_*`
- Operations: GetRecords, GetAppointmentListByDate, GetAvailableAppts, SetAppointment, SetPatient, CreatePatient, UpdatePatient, etc.

**Flowise (Conversational AI Orchestration):**
- Purpose: LLM-based chatbot orchestrator for appointment booking and patient services
- SDK/Client: Axios HTTP POST to prediction endpoint
- Auth: Optional Bearer token (API key)
- Endpoint: Environment variable `FLOWISE_ENDPOINT` (e.g., `https://app.c1elly.ai/api/v1/prediction/{flow-id}`)
- Implementation: `test-agent/src/core/flowise-client.ts`
- Timeout: 90 seconds (configurable in `test-agent/src/config/config.ts`)
- Integration: Flowise has embedded tools for Cloud9 API calls (Patient Lookup, Schedule Appointment)
- Tool Configuration: Stored in `/docs/v1/` (patient_tool, scheduling_tool)

**Node-RED (Integration Workflow Engine):**
- Purpose: Low-code workflow automation for Cloud9 API calls and session management
- SDK/Client: Admin API via HTTP fetch
- Auth: Basic authentication header (credentials from `backend/src/config/nodered.ts`)
- Endpoints:
  - Admin API: `https://c1-aicoe-nodered-lb.prod.c1conversations.io/red/api/v2`
  - Workflow API: `https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd`
- Implementation: `backend/src/services/noderedDeployService.ts`, `backend/src/services/heartbeatService.ts`
- Operations: Deploy flows, get flows, copy flows, cache refresh triggers
- Flow Source: `docs/v1/nodered_Cloud9_flows.json` (canonical source, synced to `/nodered/`)
- Safety Rules: READ and REPLACE only - no delete operations on individual nodes/flows

**Langfuse (LLM Observability & Tracing):**
- Purpose: Production trace collection, session tracking, and performance analytics
- SDK/Client: Langfuse SDK 3.38.6 + native fetch API
- Auth: Public key + Secret key (HTTP Basic auth)
- API Base URL: Configured per environment in database table `langfuse_configs`
- Implementation: `backend/src/services/langfuseTraceService.ts`
- Configuration: `backend/src/controllers/testMonitorController.ts` (endpoints), database table `langfuse_configs`
- Operations:
  - Fetch traces via paginated API: `/api/public/traces` (with filters: fromTimestamp, toTimestamp, sessionId, limit, page, orderBy)
  - Fetch single trace with observations: `/api/public/traces/{traceId}`
  - Import traces into local SQLite for analysis
  - Track sessions (conversation groups) and observations (tool calls, generations, errors)
- Storage: Imported traces stored in `production_traces`, `production_trace_observations`, `production_sessions` tables

**Slack (Alert Notifications):**
- Purpose: Send formatted alert notifications for system health and test failures
- SDK/Client: Axios HTTP POST to webhook URL
- Auth: Webhook URL (secret, environment-configured)
- Implementation: `backend/src/services/slackNotifier.ts`
- Configuration: Database table `slack_webhooks` (webhook_url, default_channel, critical_channel, enabled)
- Features:
  - Block Kit formatted messages with severity levels (critical, warning, info)
  - Actionable buttons linking to dashboard, traces, and settings
  - Trace links to Langfuse (`langfuseHost/project/{projectId}/traces/{traceId}`)
  - Test run links with run ID
  - Batch alert summaries with error details
- Used by: `backend/src/services/heartbeatService.ts` (periodic alert checks)

## Data Storage

**Databases:**

**SQLite 3 (Primary):**
- File: `./dentix.db` (configurable via `DATABASE_PATH`)
- Client: `better-sqlite3` 9.4.0
- Purpose: Local caching of Cloud9 data, Langfuse traces, test results, alert definitions
- Schema: `backend/src/database/schema.sql`
- Key Tables:
  - `locations`, `appointment_types`, `providers` - Cloud9 reference data
  - `patients`, `appointments` - Cloud9 patient/appointment cache
  - `production_traces`, `production_trace_observations`, `production_sessions` - Langfuse imports
  - `alerts`, `alert_history`, `heartbeat_runs` - Alert management
  - `flowise_configs`, `langfuse_configs` - External service credentials
  - `ab_sandboxes`, `ab_sandbox_files` - A/B testing sandbox configurations
  - `goal_test_results`, `test_runs`, `prod_test_records` - Test execution records
  - `app_settings` - System settings (dashboard URL, etc.)

**File Storage:**

**Local Filesystem:**
- Backup directory: `nodered/bk_up/` - Node-RED flow backups with timestamps
- Test data directory: `test-agent/data/` - Test transcripts, reports, JSON responses
- V1 source files: `docs/v1/` - Canonical system prompt, tools, Node-RED flows
  - `Chord_Cloud9_SystemPrompt.md` - IVA system prompt
  - `nodered_Cloud9_flows.json` - Node-RED flow definitions
  - `chord_dso_patient_Tool.json` - Patient lookup tool
  - `schedule_appointment_dso_Tool.json` - Scheduling tool
  - `system_prompt_escaped.md` - Escaped version for Flowise (Mustache template)
  - `*_func.js` - Raw JavaScript for tool functions

**Caching:**

**Redis (Test Agent Only):**
- Client: `ioredis` 5.9.2
- Purpose: Session slot caching and reservation management during testing
- Used by: `test-agent/src/storage/database.ts` (slot caching logic)
- Keys: Session-based slot reservation tracking for concurrent test isolation

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based authentication
- Implementation: `backend/src/services/authService.ts`, `backend/src/controllers/authController.ts`
- Approach: JWT tokens with refresh tokens, password hashing via `bcryptjs`
- Storage: User credentials stored in SQLite (not explicitly shown in schema excerpt, but referenced in auth service)
- Session: Optional session ID passed through Flowise for conversation continuity

**Anthropic Claude API (LLM Analysis):**
- Purpose: AI-powered test analysis, fix recommendations, and semantic evaluation
- SDK: `@anthropic-ai/sdk` 0.71.2+ (backend), 0.52.0 (test-agent)
- Auth: API key via `ANTHROPIC_API_KEY` environment variable
- Usage:
  - Test result analysis and fix generation (`test-agent/src/analysis/recommendation-engine.ts`)
  - Goal test result classification (`test-agent/src/services/response-strategy-engine.ts`)
  - Dynamic agent tuning and prompt optimization
  - Semantic evaluation of test steps (alternative to regex validation)
- Model: `claude-opus-4-5-20251101` (Opus 4.5 for deep analysis)

## Monitoring & Observability

**Error Tracking:**
- Langfuse API - Production traces with error observations
- No separate error tracking service (Sentry, etc.)
- Error detection: Observations with `level='ERROR'` or `output` containing `success:false` or `_debug_error`
- Trace-level error aggregation: Count errors per trace and per session

**Logs:**
- File-based logging: `winston` 3.11.0 logger
- Console output with `strip-ansi` to remove color codes in non-TTY environments
- Log levels: debug, info, warn, error
- Service logs: `[ServiceName]` prefixed messages for tracing calls through the stack

**Metrics & Analytics:**
- Langfuse traces provide: latency, cost per token, tool call performance
- SQLite queries for aggregation: session counts, error rates, booking success rates
- Dashboard exports: Charts via Recharts (frontend)

## CI/CD & Deployment

**Hosting:**
- Application: Self-hosted Node.js server (backend + frontend bundle)
- Node-RED: Production instance at `https://c1-aicoe-nodered-lb.prod.c1conversations.io`
- Flowise: SaaS instance (likely Hosted Flowise)
- Langfuse: Self-hosted or cloud instance at custom domain (configured per environment)

**CI Pipeline:**
- No explicit CI service detected (GitHub Actions, GitLab CI, etc.)
- Build scripts: `npm run build` (TypeScript compilation)
- Dev mode: `npm run dev` (concurrent Vite + Node-RED server)

**Deployment:**
- Backend: `tsc` build to `dist/`, run `node dist/server.js` or `npm start`
- Frontend: Vite build to `dist/` (frontend), served as static assets or from separate server
- Node-RED: Flows deployed via Admin API (no rebuild needed, just configuration)

## Environment Configuration

**Required Environment Variables:**

Backend:
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - development/production
- `CLOUD9_PROD_ENDPOINT`, `CLOUD9_PROD_CLIENT_ID`, `CLOUD9_PROD_USERNAME`, `CLOUD9_PROD_PASSWORD`
- `CLOUD9_SANDBOX_ENDPOINT`, `CLOUD9_SANDBOX_CLIENT_ID`, `CLOUD9_SANDBOX_USERNAME`, `CLOUD9_SANDBOX_PASSWORD`
- `DATABASE_PATH` - SQLite database file path
- `ANTHROPIC_API_KEY` - Claude API key (if not using Claude CLI)
- `USE_CLAUDE_CLI` - Use local Claude CLI instead of API
- `REPLIT_MODE` - Deployment mode detection

Frontend:
- `VITE_API_URL` - Backend API URL (relative `/api` or absolute URL)
- `VITE_DEFAULT_ENVIRONMENT` - sandbox or production

Test Agent:
- `FLOWISE_ENDPOINT` - Flowise prediction endpoint URL
- `ANTHROPIC_API_KEY` - Claude API key
- `USE_CLAUDE_CLI` - Use local Claude CLI

**Secrets Location:**
- Environment variables: `.env` file (development), container env vars (production)
- Database passwords: Embedded in Cloud9/Langfuse credentials (env vars)
- API keys: `ANTHROPIC_API_KEY`, Flowise API key, Langfuse keys stored as records in `langfuse_configs` table

## Webhooks & Callbacks

**Incoming Webhooks:**
- Slack webhook: Outbound only (Dentix sends alerts to Slack)
- No incoming webhooks detected

**Outgoing Webhooks:**

**Slack Notifications:**
- Endpoint: Slack webhook URL (configured in database or env)
- Payload: JSON with Block Kit format
- Triggered by: Heartbeat service when alerts are evaluated and triggered
- Content: Alert summaries, error details, links to dashboard and Langfuse traces

**Node-RED Cache Refresh:**
- Endpoint: `{NODERED_CACHE_BASE_URL}/cache-refresh` (webhook-style trigger)
- Purpose: Trigger slot availability cache refresh on-demand or scheduled
- Implementation: `backend/src/services/testMonitorController.ts` (POST endpoint)

## Data Flow Summary

```
User Input
    ↓
Flowise Chatbot (LLM + Tools)
    ├→ Current DateTime Tool (system info)
    ├→ Patient Lookup Tool (→ Cloud9 GetRecords)
    └→ Schedule Appointment Tool
         ├→ Cloud9 GetAvailableAppts (slot search)
         ├→ Node-RED (session cache management)
         └→ Cloud9 SetAppointment (booking)
    ↓
Langfuse (Trace Collection)
    ├→ Conversation history
    ├→ Tool calls and outcomes
    └→ Error tracking
    ↓
SQLite (Local Caching & Analytics)
    ├→ Test results
    ├→ Alert definitions
    └→ Production trace imports
    ↓
Dashboard UI (Vite + React)
    ├→ Real-time alerts
    ├→ Test monitor
    ├→ Trace viewer
    └→ Analytics
    ↓
Slack (Notifications)
```

---

*Integration audit: 2026-02-02*

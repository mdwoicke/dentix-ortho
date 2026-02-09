# External Integrations

**Analysis Date:** 2026-02-09

## APIs & External Services

**Cloud9 Ortho (Primary Integration):**
- Cloud9 Ortho (Dentrix) Practice Management System - SOAP-like XML API
  - SDK/Client: Custom `backend/src/services/cloud9/client.ts`
  - Auth: XML-based ClientID, UserName, Password per environment
  - Endpoints:
    - Production: `https://us-ea1-partner.cloud9ortho.com/GetData.ashx`
    - Sandbox: `https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx`
  - Environment vars: `CLOUD9_PRODUCTION_CLIENT_ID`, `CLOUD9_PRODUCTION_USERNAME`, `CLOUD9_PRODUCTION_PASSWORD`, `CLOUD9_SANDBOX_*`
  - Features: Patient CRUD, appointment scheduling, location/provider/appointment type reference data

**Langfuse:**
- LLM Observability Platform - Production trace management
  - SDK/Client: `langfuse` 3.38.6 package
  - Auth: Basic auth with public_key + secret_key (stored in `langfuse_configs` table)
  - Endpoint: `https://langfuse-6x3cj-u15194.vm.elestio.app` (configurable per tenant)
  - Implementation: `backend/src/services/langfuseTraceService.ts`
  - Features: Trace import, session grouping, production monitoring, cost analysis

**Anthropic (Claude AI):**
- Claude AI API - LLM integration for agent logic
  - SDK/Client: `@anthropic-ai/sdk` 0.71.2
  - Auth: `ANTHROPIC_API_KEY` env var
  - Features: AI-powered appointment booking agent, prompt versioning

**Node-RED:**
- Workflow automation and orchestration
  - SDK/Client: Custom REST API proxy via backend
  - Endpoints:
    - Production: `https://c1-aicoe-nodered-lb.prod.c1conversations.io`
    - Local test: Custom Node-RED instance
  - Implementation: `backend/src/routes/testMonitor.ts` for deploy/copy operations
  - Features: Flow deployment, flow copying, backup management

## Data Storage

**Databases:**
- SQLite (better-sqlite3)
  - Connection: Synchronous local file
  - Primary DB: `backend/dentix.db` (57MB)
  - Test DB: `test-agent/data/test-results.db`
  - Client: `better-sqlite3` 9.4.0
  - Multi-tenancy: `tenant_id` column on 11+ tables
  - Tables: patients, appointments, locations, providers, appointment_types, users, tenants, production_traces, production_sessions, langfuse_configs

**File Storage:**
- Local filesystem
  - V1 production files: `docs/v1/` (system prompts, tools, flows)
  - Per-tenant files: `tenants/{slug}/v1/` and `tenants/{slug}/nodered/`
  - Node-RED backups: `nodered/bk_up/`
  - Logs: `backend/logs/`

**Caching:**
- Redis (partial/optional implementation)
  - Client: `ioredis` 5.9.2 (in test-agent)
  - Usage: Appointment slot caching, session data
  - Note: `ENABLE_CACHING=false` by default - most data fetched directly from Cloud9 API

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based authentication
  - Implementation: `backend/src/services/authService.ts`
  - Storage: Users in SQLite `users` table
  - Password hashing: bcryptjs
  - Token expiry: 8 hours
  - Master admin: `mwoicke@intelepeer.ai` / `Cyclones`

## Monitoring & Observability

**Error Tracking:**
- Winston logger (`winston` 3.11.0)
  - Log location: `backend/logs/`
  - Log files: `rate-limit-errors.md` for Cloud9 API throttling

**Logs:**
- Structured logging via Winston
  - Custom loggers: `httpRequest`, `httpResponse`, `dbOperation`, `cloud9Request`, `cloud9Response`
  - Implementation: `backend/src/utils/logger.ts`

## CI/CD & Deployment

**Hosting:**
- Not configured (local development setup)

**CI Pipeline:**
- None detected

## Environment Configuration

**Required env vars:**

Backend (`backend/.env`):
- `PORT` - Server port (default: 3001)
- `NODE_ENV` - Environment mode
- `DATABASE_PATH` - SQLite database file path
- `ENABLE_CACHING` - Enable/disable caching (default: false)
- `CLOUD9_PRODUCTION_ENDPOINT`, `CLOUD9_PRODUCTION_CLIENT_ID`, `CLOUD9_PRODUCTION_USERNAME`, `CLOUD9_PRODUCTION_PASSWORD`
- `CLOUD9_SANDBOX_ENDPOINT`, `CLOUD9_SANDBOX_CLIENT_ID`, `CLOUD9_SANDBOX_USERNAME`, `CLOUD9_SANDBOX_PASSWORD`
- `ANTHROPIC_API_KEY` - Claude AI API key
- `USE_CLAUDE_CLI` - Enable Claude CLI mode (default: true)
- `REPLIT_MODE` - Replit deployment flag (default: false)

Frontend (`frontend/.env`):
- `VITE_API_URL` - Backend API URL (use `/api` for proxy mode)
- `VITE_DEFAULT_ENVIRONMENT` - Default Cloud9 environment (sandbox/production)

Test Agent (`test-agent/.env`):
- Langfuse credentials
- Redis connection details (if caching enabled)

**Secrets location:**
- `.env` files (not committed)
- `.env.example` files provide templates
- SQLite database `langfuse_configs` table for Langfuse credentials per tenant

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- Cloud9 API calls (HTTP GET with XML body)
- Langfuse trace submissions
- Node-RED flow deployments

---

*Integration audit: 2026-02-09*

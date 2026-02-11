# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## ⚠️ MANDATORY - App UI Version Sync (READ THIS FIRST)

**EVERY TIME you edit ANY of these files, you MUST run the update script IMMEDIATELY after:**

| File | Command |
|------|---------|
| `nodered/nodered_Cloud9_flows.json` | `cd test-agent && node scripts/update-prompt-version.js nodered_flow "<description>"` |
| `docs/v1/nodered_Cloud9_flows.json` | `cd test-agent && node scripts/update-prompt-version.js nodered_flow "<description>"` |
| `docs/v1/Chord_Cloud9_SystemPrompt.md` | `cd test-agent && node scripts/update-prompt-version.js system_prompt "<description>"` |
| `docs/v1/chord_dso_patient_Tool.json` | `cd test-agent && node scripts/update-prompt-version.js patient_tool "<description>"` |
| `docs/v1/schedule_appointment_dso_Tool.json` | `cd test-agent && node scripts/update-prompt-version.js scheduling_tool "<description>"` |

**NO EXCEPTIONS. Do NOT skip this step. The App UI "Prompt Versions" panel must always reflect the latest changes.**

The hook at `.claude/hooks/sync-v1-to-langfuse.js` may auto-sync, but ALWAYS verify by running the script manually if in doubt.

---

## Project Overview

A full-stack SaaS application for Cloud 9 Ortho (Dentrix Orthodontic) practice management integration. It combines a CRM dashboard, an E2E testing framework for a Flowise chatbot (IVA "Allie"), Node-RED workflow automation, and Langfuse LLM observability.

### High-Level Data Flow

```
User input → Flowise Prompt → Flowise Tool → Node-RED API → Cloud9 API
```

---

## Repository Structure

```
dentix-ortho/
├── backend/                # Express.js + TypeScript API server (port 3003)
├── frontend/               # React 19 + Vite + Tailwind CSS dashboard (port 5174)
├── test-agent/             # E2E testing framework for Flowise chatbot
├── shared/                 # Shared TypeScript types & services (Langfuse, LLM provider)
├── docs/
│   ├── v1/                 # CANONICAL V1 production files (prompts, tools, flows)
│   └── archive/            # Historical/archived versions
├── nodered/                # Node-RED flow definitions & working copies
├── scripts/                # Root-level utility scripts
├── .claude/                # Claude Code settings, hooks, and skills
├── .planning/              # Project planning & milestones
├── CLAUDE.md               # This file
├── Cloud9_API_Markdown.md  # Cloud 9 API reference (March 2024 / 11.3)
└── Export Test Response Cloud 9 APIs.postman_collection.json  # Postman collection
```

---

## Technology Stack

### Backend (`backend/`)
- **Runtime**: Node.js + Express.js + TypeScript
- **Database**: SQLite via `better-sqlite3`
- **Build**: `tsc` → `dist/server.js`
- **Key deps**: axios, xml2js, winston, bcryptjs, jsonwebtoken, langfuse, ssh2, node-pty, zod, mammoth, pdf-parse

### Frontend (`frontend/`)
- **Framework**: React 19 + TypeScript + Vite 7
- **Styling**: Tailwind CSS 4 + PostCSS
- **State**: Redux Toolkit + react-redux
- **Routing**: React Router v7
- **Key deps**: FullCalendar, xterm.js, Monaco Editor, recharts, react-hook-form + zod, allotment, dnd-kit

### Test Agent (`test-agent/`)
- **Framework**: TypeScript CLI (commander)
- **LLM**: Anthropic SDK + Langfuse
- **Database**: SQLite (`test-agent/data/test-results.db`)
- **Key deps**: @faker-js/faker, chalk, ioredis, zod

### External Services
- **Cloud 9 Ortho API**: XML/SOAP-like endpoints (Prod + Sandbox)
- **Flowise**: Chatbot platform (IVA "Allie")
- **Langfuse**: LLM trace observability
- **Node-RED**: Workflow automation (hosted at `c1-aicoe-nodered-lb.prod.c1conversations.io`)
- **Anthropic Claude**: AI/LLM capabilities

---

## Development Commands

### Root-level
```bash
npm run install:all        # Install backend + frontend deps
npm run build:all          # Build backend + frontend
npm run serve:all          # Start backend + frontend preview
npm run validate:prompt    # Validate prompt files
```

### Backend (`cd backend`)
```bash
npm run dev                # ts-node-dev with hot reload
npm run build              # TypeScript compile
npm start                  # Run compiled dist/server.js
```

### Frontend (`cd frontend`)
```bash
npm run dev                # Vite dev server + Node-RED test server (concurrently)
npm run dev:vite-only      # Vite dev server only
npm run build              # Production build
npm run build:typecheck    # TypeScript check + build
npm run lint               # ESLint
npm run preview            # Preview production build
```

### Test Agent (`cd test-agent`)
```bash
npm start                  # Interactive CLI mode
npm run run                # Run all tests
npm run run:happy          # Happy path tests only
npm run run:failed         # Re-run failed tests
npm run results            # Show last results
npm run diagnose           # Diagnose happy-path failures
npm run diagnose:all       # Diagnose all failures
npm run report             # Generate markdown report
npm run analyze            # Analyze test patterns
npm run llm-prompt         # LLM prompt tool
```

---

## Backend Architecture

**Entry point**: `backend/src/server.ts` → `backend/src/app.ts`
**Default port**: 3003 (configurable via `PORT` env var)

### API Route Prefixes

| Prefix | Router | Description |
|--------|--------|-------------|
| `/api/reference` | `referenceRoutes` | Locations, providers, appointment types |
| `/api/patients` | `patientRoutes` | Patient CRUD via Cloud 9 API |
| `/api/appointments` | `appointmentRoutes` | Appointment scheduling/management |
| `/api/postman` | `postmanRoutes` | Postman collection endpoints |
| `/api/test-monitor` | `testMonitorRoutes` | Test execution, goal tests, Node-RED, V1 files, sandboxes |
| `/api/auth` | `authRoutes` | Login, JWT authentication |
| `/api/admin` | `adminRoutes` | User management, permissions |
| `/api/skills-runner` | `skillsRunnerRoutes` | Claude skill execution |
| `/api/heartbeat` | `heartbeatRoutes` | Health monitoring |
| `/api/trace-analysis` | `traceAnalysisRoutes` | Langfuse trace analysis |
| `/health` | inline | Health check |

### Key Controllers (by size/importance)

| Controller | LOC | Purpose |
|------------|-----|---------|
| `testMonitorController.ts` | ~11,000 | Test run management, goal tests, Node-RED deploy, sandbox files |
| `traceAnalysisController.ts` | ~1,600 | Langfuse trace querying and analysis |
| `skillsRunnerController.ts` | ~800 | Claude skill execution via SSH/PTY |
| `appointmentController.ts` | ~800 | Cloud 9 appointment operations |
| `heartbeatController.ts` | ~770 | System health checks |
| `prodTestRecordController.ts` | ~700 | Production test data tracking/cleanup |
| `patientController.ts` | ~350 | Cloud 9 patient operations |
| `adminController.ts` | ~300 | User/permission management |
| `referenceController.ts` | ~200 | Reference data (locations, types, providers) |
| `authController.ts` | ~125 | JWT authentication |

### Key Services

| Service | Purpose |
|---------|---------|
| `cloud9/client.ts` | Cloud 9 API HTTP client |
| `cloud9/xmlBuilder.ts` / `xmlParser.ts` | XML request/response handling |
| `langfuseTraceService.ts` | Langfuse integration (63 KB) |
| `promptService.ts` | Prompt version management (54 KB) |
| `goalTestService.ts` | Goal test execution (29 KB) |
| `goalAnalysisService.ts` | Goal test analysis (52 KB) |
| `goalSuggestionService.ts` | AI-powered goal suggestions (29 KB) |
| `replayService.ts` | Conversation replay (38 KB) |
| `noderedDeployService.ts` | Node-RED flow deployment |
| `v1FileService.ts` | V1 file management |
| `alertEngine.ts` | Production monitoring alerts |
| `authService.ts` | JWT + bcrypt auth logic |
| `heartbeatService.ts` | System monitoring |
| `sshService.ts` / `ptyService.ts` | SSH connectivity & pseudo-terminal |
| `ab-testing/` | A/B sandbox testing services |
| `sandbox/` | Sandbox file services |

### Database (SQLite)

**Backend DB**: `backend/dentix.db`
**Test Agent DB**: `test-agent/data/test-results.db`

#### Backend Schema Tables (`backend/src/database/schema.sql`)

| Table | Purpose |
|-------|---------|
| `locations` | Practice location cache |
| `appointment_types` | Appointment type cache |
| `providers` | Provider/schedule view cache |
| `patients` | Patient data cache |
| `appointments` | Appointment data cache |
| `cache_metadata` | Cache TTL tracking |
| `prompt_working_copies` | Current working copies of prompts/tools |
| `prompt_version_history` | Immutable version history |
| `users` | Authentication (email, password_hash, is_admin) |
| `user_permissions` | Tab-level access control |
| `prod_test_records` | Production test data for cleanup tracking |
| `session_analysis` | Langfuse session analysis cache |
| `artifact_deploy_events` | Version deployment tracking |

#### User Permission Tab Keys
`dashboard`, `patients`, `appointments`, `calendar`, `test_monitor`, `settings`, `goal_tests`, `goal_test_generator`, `history`, `tuning`, `ab_testing_sandbox`, `ai_prompting`, `api_testing`, `advanced`

---

## Frontend Architecture

**Entry point**: `frontend/src/main.tsx` → `App.tsx` → `AppRouter.tsx`
**Dev URL**: `http://localhost:5174` (accessible on all interfaces via `0.0.0.0`)

### Frontend Pages & Routes

| Route | Page | Tab Key |
|-------|------|---------|
| `/` | Dashboard | `dashboard` |
| `/admin` | Admin (requires admin) | — |
| `/patients` | PatientList | `patients` |
| `/patients/:id` | PatientDetail | — |
| `/appointments` | AppointmentList | `appointments` |
| `/calendar` | AppointmentCalendar | `calendar` |
| `/settings` | Settings | `settings` |
| `/test-monitor` | TestMonitorDashboard | `test_monitor` |
| `/test-monitor/tests` | TestsPage | — |
| `/test-monitor/analysis` | AnalysisPage | — |
| `/test-monitor/call-trace` | CallTracePage | — |
| `/test-monitor/sandbox-lab` | SandboxLabPage | — |
| `/test-monitor/experiments` | ABTestingDashboard | — |
| `/test-monitor/skills-runner` | SkillsRunnerPage | — |
| `/test-monitor/prod-tracker` | ProdTestTrackerPage | — |
| `/test-monitor/queue-activity` | QueueActivityPage | — |
| `/test-monitor/alerts` | AlertsPage | — |
| `/test-monitor/cache-health` | CacheHealthPage | — |
| `/test-monitor/trace-analysis` | TraceAnalysisPage | — |
| `/test-monitor/cases` | TestCasesPage | — |
| `/test-monitor/goal-cases` | GoalTestsDashboard | — |
| `/test-monitor/create` | CreateGoalTestPage | — |
| `/test-monitor/history` | TestRunHistory | — |
| `/test-monitor/tuning` | AgentTuning | — |
| `/test-monitor/sandbox` | ABTestingSandbox | — |
| `/test-monitor/ai-prompting` | AIPromptingPage | — |
| `/test-monitor/api-testing` | APITestingPage | — |
| `/test-monitor/run/:runId` | TestRunDetail | — |

### Redux Store Slices (`frontend/src/store/slices/`)

| Slice | Purpose |
|-------|---------|
| `authSlice` | Authentication state, JWT handling |
| `appointmentSlice` | Appointment data |
| `patientSlice` | Patient data |
| `referenceSlice` | Reference data (locations, types, providers) |
| `testMonitorSlice` | Test monitoring state (~50 KB) |
| `testExecutionSlice` | Active test execution |
| `testCasesSlice` | Test case management |
| `createGoalTestSlice` | Goal test creation wizard |
| `goalTestCasesSlice` | Goal test cases |
| `sandboxSlice` | Sandbox A/B configuration |
| `uiSlice` | UI state (sidebar, theme) |
| `workflowSlice` | Workflow management |

### Component Organization (`frontend/src/components/`)

```
components/
├── features/           # Feature-specific components (18 subdirectories)
│   ├── admin/          # User management, permissions
│   ├── aiPrompting/    # AI prompt editor & testing
│   ├── appointments/   # Appointment components
│   ├── auth/           # Login, ProtectedRoute
│   ├── cacheHealth/    # Cache monitoring
│   ├── dashboard/      # Dashboard widgets
│   ├── goalTestCases/  # Goal test case management
│   ├── goalTestWizard/ # Guided test creation
│   ├── patients/       # Patient components
│   ├── postman/        # Postman integration UI
│   ├── sandbox/        # Sandbox testing A/B UI
│   ├── settings/       # Configuration panels
│   ├── skillsRunner/   # Skill execution interface
│   ├── test-monitor/   # Test monitoring dashboard
│   └── testMonitor/    # Extended test monitoring
├── forms/              # Reusable form components
├── layout/             # Navigation, sidebar, MainLayout
└── ui/                 # Basic UI primitives
```

### API Services (`frontend/src/services/api/`)

| File | Backend Route |
|------|---------------|
| `client.ts` | Axios instance with JWT interceptor |
| `authApi.ts` | `/api/auth` |
| `adminApi.ts` | `/api/admin` |
| `appointmentApi.ts` | `/api/appointments` |
| `patientApi.ts` | `/api/patients` |
| `referenceApi.ts` | `/api/reference` |
| `testMonitorApi.ts` | `/api/test-monitor` (~72 KB) |
| `testCasesApi.ts` | `/api/test-monitor` (test cases) |
| `skillsRunner.ts` | `/api/skills-runner` |
| `sandboxApi.ts` | `/api/test-monitor` (sandbox) |
| `appSettingsApi.ts` | `/api/test-monitor` (settings) |
| `postmanApi.ts` | `/api/postman` |

---

## Vite Proxy Configuration

The frontend uses Vite dev server proxies to route API requests. Defined in `frontend/vite.config.ts`:

| Proxy Path | Target | Purpose |
|------------|--------|---------|
| `/api` | `http://localhost:3003` | Backend API |
| `/FabricWorkflow` | `https://c1-aicoe-nodered-lb.prod.c1conversations.io` | Node-RED prod |
| `/cloud9-api-prod` | `https://us-ea1-partner.cloud9ortho.com` | Cloud 9 production |
| `/cloud9-api` | `https://us-ea1-partnertest.cloud9ortho.com` | Cloud 9 sandbox |

**IMPORTANT**: `frontend/.env` must use `VITE_API_URL=/api` (relative), NOT an absolute localhost URL. Absolute URLs break network access from other devices.

---

## Test Agent Architecture (`test-agent/`)

The test agent is a CLI tool for E2E testing of the Flowise chatbot integration.

### Core Components
- `src/core/agent.ts` - Test agent orchestrator
- `src/core/flowise-client.ts` - Flowise chatbot HTTP client
- `src/core/cloud9-client.ts` - Cloud 9 API client
- `src/core/adaptive-concurrency.ts` - Concurrency control

### Test Scenarios (`src/tests/scenarios/`)
- `happy-path.ts` - Standard booking flows (~23 KB)
- `goal-happy-path.ts` - Goal-based test paths
- `error-handling.ts` - Error recovery scenarios
- `edge-cases.ts` - Boundary conditions

### Test Personas (`src/tests/personas/`)
- `standard-personas.ts` - Pre-defined user types (~8.5 KB)

### Key Services
- `llm-analysis-service.ts` - LLM-powered test analysis (~35 KB)
- `goal-evaluator.ts` - Goal pass/fail evaluation
- `semantic-evaluator.ts` - Semantic response evaluation
- `category-classifier.ts` - Test categorization
- `intent-detector.ts` - Intent detection
- `conversation-context-tracker.ts` - Multi-turn tracking
- `ab-testing/` - A/B test variant services
- `sandbox/` - Sandbox file management

### Storage
- `storage/database.ts` - SQLite operations (~169 KB, largest file)
- `storage/batch-writer.ts` - Batch database writes
- `storage/retention-service.ts` - Data retention policies

### Scripts (`test-agent/scripts/`)
90+ utility scripts including:
- `deploy-nodered.js` - Deploy flows to Node-RED
- `copy-nodered-flow.js` - Copy flow tabs
- `update-prompt-version.js` - Update prompt/tool versions in DB

---

## V1 Production Files (`docs/v1/`)

These are the canonical source files for the Flowise + Node-RED integration:

| File | Type | Escaped? | Deploy To |
|------|------|----------|-----------|
| `Chord_Cloud9_SystemPrompt.md` | System prompt | No | Source/reference |
| `system_prompt_escaped.md` | System prompt | Yes (`{` → `{{`) | Flowise |
| `nodered_Cloud9_flows.json` | Node-RED flows | N/A | Node-RED |
| `chord_dso_patient_Tool.json` | Tool JSON | N/A | Reference |
| `schedule_appointment_dso_Tool.json` | Tool JSON | N/A | Reference |
| `patient_tool_func.js` | Tool JavaScript | No (NEVER escape) | Flowise |
| `scheduling_tool_func.js` | Tool JavaScript | No (NEVER escape) | Flowise |

### V1 File Sync Locations

When updating V1 files, sync to ALL of these:

1. **File on disk** (`docs/v1/`)
2. **Local SQLite DB** (`test-agent/data/test-results.db` - tables: `prompt_working_copies`, `prompt_version_history`)
3. **Langfuse Cloud** (`https://langfuse-6x3cj-u15194.vm.elestio.app`)
4. **Sandbox DB entries** (`ab_sandbox_files` table - `sandbox_a` and `sandbox_b`)
5. **Node-RED working copies** (`nodered/` directory, synced from V1)

---

## ⚠️ Node-RED Safety Rules

**DO NOT perform any Node-RED delete operations until further notice:**

| Allowed | NOT Allowed |
|---------|-------------|
| `GET /flows` - Read current flows | `DELETE` endpoints - Never use |
| `POST /flows` - Deploy/replace flows | Remove individual nodes/flows |
| Backup before deploy | Delete tabs or subflows |

**Why:** The deploy service uses **replace-only** operations. It replaces the entire flow configuration. Never deletes individual flows, tabs, or nodes.

**Node-RED Endpoints:**
- `GET /api/test-monitor/nodered/status` - Connection status
- `GET /api/test-monitor/nodered/flows` - List all flow tabs
- `GET /api/test-monitor/nodered/flows/:flowId` - Get specific flow
- `POST /api/test-monitor/nodered/deploy` - Deploy from V1 source
- `POST /api/test-monitor/nodered/copy-flow` - Copy a flow tab

**Deploy Options:**
```json
{ "backup": true, "dryRun": false }
```

**Copy Flow Options:**
```json
{
  "sourceFlowId": "cloud9-ortho-tab",
  "sourceFlowLabel": "Chord-Cloud9-Ortho-Prd",
  "newLabel": "Chord-Cloud9-Ortho-Dev",
  "disabled": false,
  "backup": true,
  "dryRun": false
}
```

**CLI Scripts:**
```bash
cd test-agent && node scripts/deploy-nodered.js --dry-run       # Dry run
cd test-agent && node scripts/deploy-nodered.js --backup         # Deploy with backup
cd test-agent && node scripts/copy-nodered-flow.js --list        # List flows
cd test-agent && node scripts/copy-nodered-flow.js --source "Chord-Cloud9-Ortho-Prd" --name "Test-Flow" --dry-run
cd test-agent && node scripts/copy-nodered-flow.js --source "Chord-Cloud9-Ortho-Prd" --name "Chord-Cloud9-Ortho-Dev" --disabled
```

**Backups saved to:** `nodered/bk_up/flow-backup-{timestamp}.json`

---

## ⚠️ CRITICAL - Test Environment Must Match Node-RED Environment

**When running tests, the Flowise config MUST match the environment your Node-RED code is pointing to.**

| Node-RED Flow | Points To | Required Flowise Config |
|---------------|-----------|------------------------|
| `Chord-Cloud9-Ortho-Prd` | Production Cloud9 API | **Production (ID 1, Default)** |
| `Chord-Cloud9-Ortho-Sandbox` | Sandbox Cloud9 API | Sandbox config |

**Flowise Configs in Database (`flowise_configs` table):**

| ID | Name | Use For |
|----|------|---------|
| 1 | Production (Default) | Use for all Prd Node-RED testing |
| 2 | Ortho-Test-JL-UAT | May have different/outdated config |
| 3 | A/B Sandbox A | Sandbox A testing only |
| 4 | A/B Sandbox B | Sandbox B testing only |

**Environment Presets:**

| Preset | flowise_config_id | Notes |
|--------|-------------------|-------|
| Prod | **1** (Production) | Must match Node-RED prd endpoints |
| Sandbox A | 3 | For sandbox testing |
| Sandbox B | 4 | For sandbox testing |

**Verify test config:**
```sql
SELECT g.run_id, t.flowise_config_id, t.flowise_config_name
FROM goal_test_results g
LEFT JOIN test_runs t ON g.run_id = t.run_id
ORDER BY g.started_at DESC LIMIT 5;
```

---

## ⚠️⚠️⚠️ CRITICAL - ESCAPING RULES ⚠️⚠️⚠️

### ONLY ESCAPE SYSTEM PROMPTS - NEVER ESCAPE TOOLS!

| Content Type | Escape `{` to `{{`? | Why |
|--------------|---------------------|-----|
| **System Prompts** (`.md`) | YES | Flowise uses Mustache templates for prompts |
| **Tool JavaScript** (`.js`) | **NEVER** | Tools are raw JS - escaping breaks the code |
| **JSON configs** | NEVER | JSON needs valid syntax |
| **Regular code** | NEVER | Code needs valid syntax |

### Why Prompts MUST Be Escaped
Flowise applies Mustache templating to system prompts. Variables like `{{input}}` are replaced by Flowise. To show literal `{` in prompts, escape as `{{`.

### Why Tools Must NOT Be Escaped
Tools contain JavaScript that runs directly in Node.js. `const obj = {{ key: value }}` is broken JavaScript. Flowise does NOT apply Mustache templating to tool code.

**NEVER save the entire tool JSON to the database** - only the JavaScript `func` portion is needed for versioning and deployment.

---

## ⚠️ MANDATORY - Sandbox File Sync

**EVERY TIME you update a source file in `/docs/v1/`, you MUST ALSO update the corresponding sandbox files in the database:**

| Source File | Database Table | Sandbox Columns |
|-------------|----------------|-----------------|
| `docs/v1/scheduling_tool_func.js` | `ab_sandbox_files` | `sandbox_a`, `sandbox_b` |
| `docs/v1/patient_tool_func.js` | `ab_sandbox_files` | `sandbox_a`, `sandbox_b` |
| `docs/v1/Chord_Cloud9_SystemPrompt.md` | `ab_sandbox_files` | `sandbox_a`, `sandbox_b` |

```javascript
// In test-agent directory:
const BetterSqlite3 = require('better-sqlite3');
const fs = require('fs');
const db = new BetterSqlite3('./data/test-results.db');
const content = fs.readFileSync('../docs/v1/scheduling_tool_func.js', 'utf-8');
db.prepare(`UPDATE ab_sandbox_files SET content = ?, version = version + 1, updated_at = ? WHERE file_type = ? AND sandbox = ?`)
  .run(content, new Date().toISOString(), 'scheduling_tool', 'sandbox_b');
db.close();
```

---

## Tool Version Updates

**When updating Flowise tools (`scheduling_tool`, `patient_tool`):**

1. **ONLY the JavaScript `func` field matters** - Flowise uses just the JavaScript code, not the full JSON
2. **Always use the update script:**
   ```bash
   cd test-agent && node scripts/update-prompt-version.js scheduling_tool "<description>"
   ```
3. **The script automatically:**
   - Extracts only the `func` field from the tool JSON
   - Saves it to a separate `.js` file (e.g., `docs/v1/scheduling_tool_func.js`)
   - Updates the database with just the JavaScript content

**ALWAYS add new versions to App UI** with version number in file header (e.g., `<!-- v45 -->` or `// v45`).

---

## Cloud 9 API Integration

### Environments & Endpoints

| Environment | Endpoint | Notes |
|-------------|----------|-------|
| **Production** | `https://us-ea1-partner.cloud9ortho.com/GetData.ashx` | 24/7 |
| **Sandbox** | `https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx` | Deactivated after 6 months inactivity |

### Request Format

All requests are **HTTP POST** with an XML body:
```xml
<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>[Cloud9 Client GUID]</ClientID>
    <UserName>[Partner UserName]</UserName>
    <Password>[Partner Password]</Password>
    <Procedure>[Procedure Name]</Procedure>
    <Parameters>
    </Parameters>
</GetDataRequest>
```

### Response Format
```xml
<GetDataResponse>
    <ResponseStatus>Success</ResponseStatus>
    <Records><Record></Record></Records>
</GetDataResponse>
```

### Data Types
- **bit:** `1` (True) / `0` (False)
- **datetime:** `MM/DD/YYYY` or `MM/DD/YYYY 12:00:00 AM`
- **uniqueidentifier:** GUID format

### Error Codes

| Code | Message |
|------|---------|
| 0 | Unknown error |
| 1 | Invalid client/username/password |
| 2 | Required parameter missing |
| 3 | Invalid parameter value |
| 6 | Not authorized to access client |
| 7 | Not authorized outside allowance window |
| 10 | Procedure not authorized |

### GET APIs (Read)

| Procedure | Purpose | Key Parameters |
|-----------|---------|----------------|
| `GetPortalPatientLookup` | Patient search | `filter` (req), `lookupByPatient`, `showInactive` |
| `GetPatient` | Patient GUIDs | `patGUID` (req) |
| `GetPatientInformation` | Patient demographics | `patguid` (req) |
| `GetPatientAddress` | All patient addresses | — |
| `GetBirthdayList` | Patients by birthday | `dtBirthday` (req) |
| `GetAppointmentListByDate` | Appointments by date range | `dtAppointment` (req), `dtAppointmentEnd` |
| `GetAppointmentListByPatient` | Appointments by patient | `patGUID` (req) |
| `GetAppointmentsByDate` | Appointments by date + view | `dtAppointment` (req), `schdvwGUID` (req) |
| `GetOnlineReservations` | Available slots | `startDate` (req), `endDate` (req), max 28 weeks |
| `GetInsurancePolicies` | Insurance details | `modifiedDate` |
| `GetPatientInsurancePolicies` | All patient insurance | `ExcludeInactivePatients` |
| `GetResponsiblePartiesForPatient` | Responsible parties | `PatientGUID` (req) |
| `GetLedger` | Transaction ledger | `patGUIDString`, `fromDate`, `toDate` |
| `GetPayments` | Payments by date range | `StartDateParam` (req), `EndDateParam` (req) |

### SET APIs (Write)

| Procedure | Purpose | Key Parameters |
|-----------|---------|----------------|
| `SetPatient` | Create patient | `patientFirstName`, `patientLastName`, `providerGUID`, `locationGUID`, `VendorUserName` (all req) |
| `SetPatientDemographicInfo` | Update demographics | `patGUID` (req) |
| `SetPatientComment` | Add/edit comment | `patGUID` (req), `patComment` (req) |
| `SetAppointment` | Create appointment | `PatientGUID`, `StartTime`, `ScheduleViewGUID`, `ScheduleColumnGUID`, `AppointmentTypeGUID`, `Minutes`, `VendorUserName` (all req) |
| `SetAppointmentInsuranceVerified` | Mark insurance verified | `apptGUIDs` (pipe-separated) |

---

## Caching Configuration

Caching is **disabled by default** (`ENABLE_CACHING=false`). All data is fetched in real-time from Cloud 9 API.

- No database writes occur; all endpoints return `cached: false`
- If Cloud 9 API is down, no fallback data available

**Deprecated Endpoints** (still present but non-functional):
- `GET /api/appointments/date-range` - Returns HTTP 410
- `POST /api/reference/refresh` - No-op
- `GET /api/reference/cache/stats` - Returns empty stats

**To re-enable caching:** Set `ENABLE_CACHING=true` in `.env`, restore `Model.bulkUpsert()` / `Model.upsert()` calls in controllers, restart backend.

---

## Development Server Configuration

### Frontend `.env`
```
VITE_API_URL=/api
```
**DO NOT** use `http://localhost:3003/api` - this breaks network access from other devices.

### Backend `.env` (key variables)
```
PORT=3003
CLOUD9_PROD_ENDPOINT=https://us-ea1-partner.cloud9ortho.com/GetData.ashx
CLOUD9_SANDBOX_ENDPOINT=https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx
DATABASE_PATH=./dentix.db
ENABLE_CACHING=false
REPLIT_MODE=false
USE_CLAUDE_CLI=true
ANTHROPIC_API_KEY=   # Required when REPLIT_MODE=true or USE_CLAUDE_CLI=false
```

---

## Claude Code Integration (`.claude/`)

### Settings (`.claude/settings.local.json`)
- Permissions for npm, npx, taskkill
- MCP server configuration

### Skills (`.claude/skills/`)

| Skill | Purpose |
|-------|---------|
| `start-and-verify.md` | Startup and verification procedures |
| `e2e-test.md` | E2E testing guide |
| `iva-prompt-tuning.md` | IVA prompt tuning workflow |
| `prompt-tool-update.md` | Prompt and tool update procedures |
| `claude-cli-llm.md` | Claude CLI documentation |

---

## Shared Module (`shared/`)

Shared TypeScript types and services used across backend and test-agent:

| File | Purpose |
|------|---------|
| `types/Appointment.ts` | Appointment interfaces |
| `types/Location.ts` | Location interfaces |
| `types/Patient.ts` | Patient interfaces |
| `types/langfuse.types.ts` | Langfuse type definitions |
| `services/langfuse-service.ts` | Langfuse API service |
| `services/langfuse-scorer.ts` | Scoring logic |
| `services/langfuse-context.ts` | Context management |
| `services/llm-provider.ts` | LLM provider abstraction |
| `services/claude-cli-service.ts` | Claude CLI integration |
| `config/llm-config.ts` | LLM configuration |

---

## Development Workflow

1. **Use Sandbox First**: Test all Cloud 9 API operations against sandbox before production
2. **XML Structure**: Maintain proper XML structure with namespace `http://schemas.practica.ws/cloud9/partners/`
3. **Always backup before Node-RED deploy**: Use `--backup` flag or `"backup": true`
4. **Version tracking**: Update the App UI version history after every V1 file change
5. **Environment matching**: Ensure Flowise config matches the Node-RED environment being tested
6. **Sandbox sync**: After updating V1 source files, sync to sandbox database entries

---

## Credentials

**Cloud 9 API:**
- Production ClientID: `b42c51be-2529-4d31-92cb-50fd1a58c084`
- Sandbox ClientID: `c15aa02a-adc1-40ae-a2b5-d2e39173ae56`

**App UI Login:**
- Username: `mwoicke@intelepeer.ai`
- Password: `Cyclones`

**Langfuse Cloud:**
- Host: `https://langfuse-6x3cj-u15194.vm.elestio.app`
- Prompt name: "System Prompt"

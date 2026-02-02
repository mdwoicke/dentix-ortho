# Technology Stack

**Analysis Date:** 2026-02-02

## Languages

**Primary:**
- TypeScript 5.3.3 - All backend and test-agent code
- JavaScript - Frontend components (React JSX/TSX)
- SQL - SQLite database queries in services

**Secondary:**
- Bash - Build and deployment scripts
- JSON - Configuration files, flow definitions, tool definitions
- Markdown - Documentation and prompts

## Runtime

**Environment:**
- Node.js (LTS version) - Backend and test-agent execution
- Vite 7.2.4 - Frontend development server and build tool
- React 19.2.0 - UI framework (frontend)

**Package Manager:**
- npm - Primary package manager
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Express 4.18.2 - Backend HTTP API server
- React 19.2.0 - Frontend UI framework
- React Router 7.11.0 - Frontend routing

**Frontend UI Components:**
- Recharts 3.6.0 - Chart visualization
- FullCalendar 6.1.19 - Calendar component with timegrid and daygrid
- xterm.js 6.0.0 - Terminal emulator (in-browser)
- Monaco Editor 4.7.0 - Code editor with syntax highlighting
- TailwindCSS 4.1.18 - Utility-first CSS framework
- React Hook Form 7.69.0 - Form state management
- Redux Toolkit 2.11.2 - Global state management

**Testing & Analysis:**
- Langfuse 3.38.6 - LLM observability and tracing
- Anthropic SDK 0.71.2 (backend), 0.52.0 (test-agent) - Claude API integration

**Build/Dev:**
- TypeScript 5.3.3 - Static type checking
- ESLint 9.39.1 - Code linting
- Concurrently 9.2.1 - Run multiple processes in parallel

## Key Dependencies

**Critical:**
- `better-sqlite3` 9.4.0 - Lightweight SQLite database client for Node.js
- `axios` 1.6.7+ - HTTP client for API calls
- `express` 4.18.2 - Web server framework
- `langfuse` 3.38.6 - LLM observability SDK
- `zod` 3.22.4+ - Runtime schema validation and type inference

**Infrastructure:**
- `cors` 2.8.5 - Cross-origin resource sharing middleware
- `dotenv` 16.4.1 - Environment variable loading
- `jsonwebtoken` 9.0.3 - JWT authentication
- `bcryptjs` 3.0.3 - Password hashing
- `uuid` 13.0.0 (backend), 9.0.0 (test-agent) - Unique identifier generation

**Data Processing:**
- `xml2js` 0.6.2 - XML parsing and building for Cloud9 API requests
- `xlsx` 0.18.5 - Excel file parsing
- `pdf-parse` 2.4.5 - PDF document parsing
- `mammoth` 1.11.0 - DOCX document parsing
- `js-yaml` 4.1.1 - YAML parsing

**Logging & Monitoring:**
- `winston` 3.11.0 - Structured logging library
- `strip-ansi` 7.1.2 - Remove ANSI color codes from output

**Infrastructure Integration:**
- `ssh2` 1.17.0, `@types/ssh2` 1.15.5 - SSH client for remote connections
- `node-pty` 1.1.0 - Pseudo-terminal support
- `multer` 2.0.2 - Multipart file upload handling

**Test Agent Specific:**
- `ioredis` 5.9.2 - Redis client (test-agent only)
- `commander` 11.1.0 - CLI argument parsing
- `chalk` 4.1.2 - Colored terminal output
- `@faker-js/faker` 10.1.0 - Fake data generation

## Configuration

**Environment:**

Backend (`.env.example`):
```
PORT=3001
NODE_ENV=development
CLOUD9_PROD_ENDPOINT=https://us-ea1-partner.cloud9ortho.com/GetData.ashx
CLOUD9_SANDBOX_ENDPOINT=https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx
DATABASE_PATH=./dentix.db
ENABLE_CACHING=false
ANTHROPIC_API_KEY=<api-key>
USE_CLAUDE_CLI=true
```

Frontend (`.env.example`):
```
VITE_API_URL=http://localhost:3001/api
VITE_DEFAULT_ENVIRONMENT=sandbox
```

Test Agent (`.env.example`):
```
FLOWISE_ENDPOINT=<flowise-prediction-url>
REPLIT_MODE=false
USE_CLAUDE_CLI=true
ANTHROPIC_API_KEY=<api-key>
```

**Build:**
- `tsconfig.json` - TypeScript compiler configuration (backend, frontend, test-agent)
- `vite.config.ts` - Frontend Vite configuration with API proxy
- `tailwind.config.js` - TailwindCSS configuration
- `postcss.config.js` - PostCSS configuration
- `eslint.config.js` - ESLint configuration
- `.prettierrc` - Code formatting configuration (if present)

**Key Config Files:**
- `backend/src/config/cloud9.ts` - Cloud9 API endpoints and credentials
- `backend/src/config/nodered.ts` - Node-RED Admin API configuration
- `test-agent/src/config/config.ts` - Test agent settings (Flowise endpoint, timeouts, etc.)
- `backend/src/database/schema.sql` - SQLite database schema

## Platform Requirements

**Development:**
- Node.js 18+ (LTS recommended)
- npm 9+
- SQLite 3+ (included with better-sqlite3)
- macOS, Linux, or Windows (WSL recommended)

**Production:**
- Node.js 18+ runtime
- SQLite database file (dentix.db)
- Network access to external APIs (Cloud9, Flowise, Langfuse, Node-RED)
- SSL/TLS for HTTPS endpoints

## Database

**SQLite 3 (better-sqlite3)**
- File-based database: `dentix.db` or configurable via `DATABASE_PATH`
- Tables: locations, appointment_types, providers, patients, appointments, production_traces, production_sessions, production_trace_observations, alerts, alert_history, heartbeat_runs, flowise_configs, langfuse_configs, ab_sandboxes, ab_sandbox_files, goal_test_results, test_runs, prod_test_records, app_settings
- Used for: Caching Cloud9 data, storing Langfuse traces, alert definitions and history, test results
- Schema location: `backend/src/database/schema.sql`

## Ports

**Development:**
- Backend API: `3001` (configurable via `PORT`)
- Backend WebSocket/Admin: `3002`
- Frontend: `5174` (Vite dev server, hardcoded in vite.config.ts)
- Node-RED (proxied): `https://c1-aicoe-nodered-lb.prod.c1conversations.io`

**Network Configuration:**
- Frontend Vite server: `0.0.0.0:5174` (accessible from any IP, not just localhost)
- API proxy: `/api` → `http://localhost:3003` (or 3002 in older config)
- Node-RED proxy: `/FabricWorkflow` → production server

---

*Stack analysis: 2026-02-02*

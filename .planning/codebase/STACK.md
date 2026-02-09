# Technology Stack

**Analysis Date:** 2026-02-09

## Languages

**Primary:**
- TypeScript - Backend API, frontend UI, test automation
- JavaScript - Node-RED flows, utility scripts

**Secondary:**
- SQL - SQLite database schemas and queries
- Markdown - Documentation and prompt templates

## Runtime

**Environment:**
- Node.js (implied from package.json structure)

**Package Manager:**
- npm
- Lockfile: Not detected in repository

## Frameworks

**Core:**
- Express 4.18.2 - Backend REST API framework
- React 19.2.0 - Frontend UI framework
- Vite 7.2.4 - Frontend build tool and dev server

**Testing:**
- Not detected (no Jest/Vitest/Mocha in dependencies)

**Build/Dev:**
- TypeScript 5.3.3 (backend), 5.9.3 (frontend) - Type checking and compilation
- ts-node 10.9.2 - TypeScript execution for development
- ts-node-dev 2.0.0 - Hot reload for backend development

## Key Dependencies

**Critical:**
- better-sqlite3 9.4.0 - Synchronous SQLite database (main data storage)
- axios 1.6.7 (backend), 1.13.2 (frontend) - HTTP client for Cloud9 API calls
- xml2js 0.6.2 - XML parsing for Cloud9 SOAP-like API responses
- langfuse 3.38.6 - LLM observability and trace management
- @anthropic-ai/sdk 0.71.2 - Claude AI integration

**Infrastructure:**
- jsonwebtoken 9.0.3 - JWT authentication (8hr token expiry)
- bcryptjs 3.0.3 - Password hashing
- cors 2.8.5 - Cross-origin resource sharing
- winston 3.11.0 - Structured logging
- dotenv 16.4.1 - Environment variable management

**Frontend State & UI:**
- @reduxjs/toolkit 2.11.2 - State management
- react-redux 9.2.0 - React bindings for Redux
- react-router-dom 7.11.0 - Client-side routing
- tailwindcss 4.1.18 - Utility-first CSS framework
- react-hook-form 7.69.0 - Form validation
- zod 4.2.1 (frontend), 3.22.4 (backend) - Schema validation

**Specialized:**
- @monaco-editor/react 4.7.0 - Code editor component
- @xterm/xterm 6.0.0 - Terminal emulator
- @fullcalendar/react 6.1.19 - Calendar scheduling UI
- recharts 3.6.0 - Data visualization charts

## Configuration

**Environment:**
- `.env` files for backend, frontend, test-agent
- Environment variables: PORT, NODE_ENV, CLOUD9_* credentials, DATABASE_PATH, ENABLE_CACHING
- JWT_SECRET for token signing
- ANTHROPIC_API_KEY for Claude integration
- REPLIT_MODE flag for deployment mode

**Build:**
- `backend/tsconfig.json` - CommonJS, ES2020 target
- `frontend/tsconfig.json` - ESM modules
- `frontend/vite.config.ts` - Dev server proxy config
- `frontend/tailwind.config.js` - Tailwind CSS settings

## Platform Requirements

**Development:**
- Node.js runtime
- SQLite database support
- Windows/Linux/macOS compatible

**Production:**
- Backend port: 3003 (configurable via PORT env var)
- Frontend dev server: 5174 (Vite)
- Network access required for Cloud9 API endpoints
- Database: SQLite files (`backend/dentix.db`, `test-agent/data/test-results.db`)

---

*Stack analysis: 2026-02-09*

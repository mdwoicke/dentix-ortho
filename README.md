# Cloud 9 Ortho CRM Dashboard

A full-stack CRM dashboard for Cloud 9 Ortho (Dentrix Orthodontic) practice management system integration.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Redux Toolkit + Tailwind CSS
- **Backend**: Node.js + Express + TypeScript
- **Database**: SQLite (caching layer)
- **API Integration**: Cloud 9 Ortho Partner API (XML-based)

## Features

- ✅ **Patient Management**: Create, search, update patient records
- ✅ **Appointment Scheduling**: Schedule, confirm, cancel appointments
- ✅ **Visual Calendar**: Month/week/day views with drag-and-drop
- ✅ **Multi-Environment**: Switch between Sandbox and Production
- ✅ **Smart Caching**: Reduces API calls with SQLite cache
- ✅ **Dashboard**: Overview stats and metrics

## Project Structure

```
dentix-ortho/
├── frontend/          # React TypeScript app
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── store/
│   │   └── types/
│   └── package.json
│
├── backend/           # Node.js Express API
│   ├── src/
│   │   ├── config/
│   │   ├── services/
│   │   ├── controllers/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── models/
│   │   └── database/
│   ├── dentix.db      # SQLite database
│   └── package.json
│
├── shared/            # Shared TypeScript types
└── docs/              # Documentation
```

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Git

### Installation

1. **Clone the repository** (if from git)
   ```bash
   git clone <repository-url>
   cd dentix-ortho
   ```

2. **Install dependencies**

   Frontend:
   ```bash
   cd frontend
   npm install
   ```

   Backend:
   ```bash
   cd ../backend
   npm install
   ```

3. **Configure environment variables**

   Frontend (`.env`):
   ```env
   VITE_API_URL=http://localhost:3001/api
   VITE_DEFAULT_ENVIRONMENT=sandbox
   ```

   Backend (`.env`):
   ```env
   PORT=3001
   NODE_ENV=development

   # Cloud 9 credentials (see .env.example)
   CLOUD9_SANDBOX_ENDPOINT=...
   CLOUD9_SANDBOX_CLIENT_ID=...
   # etc.
   ```

4. **Initialize database** (already done in setup)
   ```bash
   cd backend
   npx ts-node src/database/init.ts
   ```

### Running the Application

**Development Mode**:

Terminal 1 - Backend:
```bash
cd backend
npm run dev
```
Backend will run on http://localhost:3001

Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```
Frontend will run on http://localhost:5173

**Production Build**:

Backend:
```bash
cd backend
npm run build
npm start
```

Frontend:
```bash
cd frontend
npm run build
# Serve the dist/ folder with nginx or Express
```

## API Documentation

See `API_WORKFLOW_DOCUMENTATION.md` for detailed API workflows and examples.

## Implementation Progress

See `PROGRESS.md` for current implementation status.

- [x] Phase 1: Project Setup ✅
- [ ] Phase 2: Backend API Proxy (in progress)
- [ ] Phase 3: Frontend Scaffold
- [ ] Phase 4: Patient Management
- [ ] Phase 5: Appointment Scheduling
- [ ] Phase 6: Calendar View

## Cloud 9 API Integration

This application integrates with the Cloud 9 Ortho Partner API using:
- XML-based SOAP-like requests
- Two environments: Sandbox (testing) and Production
- 14 API procedures for patient and appointment management

See Postman collection: `Export Test Response Cloud 9 APIs.postman_collection.json`

## Architecture

```
Frontend (React) → Backend (Express) → Cloud 9 API
                         ↓
                    SQLite Cache
```

- Frontend sends JSON requests to backend
- Backend translates JSON ↔ XML for Cloud 9 API
- Backend caches reference data in SQLite
- Environment (sandbox/production) selected via header

## Security

- ✅ Cloud 9 credentials stored in backend `.env` (never exposed to frontend)
- ✅ Backend acts as proxy to hide credentials
- ✅ CORS configured for frontend origin only
- ✅ Input validation with Zod on both frontend and backend

## Contributing

This is a private project. See `CLAUDE.md` for development guidelines.

## License

ISC

---

**For detailed implementation plan**: See `/home/mwoicke/.claude/plans/happy-growing-karp.md`

**To continue development**: See `PROGRESS.md` and simply say "continue with plan"

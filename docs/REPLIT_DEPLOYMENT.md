# Replit Deployment Guide

This guide covers deploying the Cloud 9 Ortho CRM application (frontend, backend, and test-agent) on Replit.

## Overview

| Component | Port | Technology | Description |
|-----------|------|------------|-------------|
| Backend | 3001 | Express + TypeScript | API proxy for Cloud 9 |
| Frontend | 5174 | React 19 + Vite | CRM dashboard UI |
| Test-Agent | N/A | TypeScript | E2E testing suite |

## Prerequisites

- Replit account (free tier works, but Hacker plan recommended for always-on)
- Cloud 9 API credentials (sandbox and/or production)
- Node.js 18+ (Replit provides this)

---

## Step 1: Import Repository

1. Go to [replit.com](https://replit.com)
2. Click **Create Repl** > **Import from GitHub**
3. Paste your repository URL
4. Select **Node.js** as the template
5. Click **Import from GitHub**

---

## Step 2: Create Replit Configuration Files

### `.replit` File

Create `.replit` in the project root:

```toml
run = "npm run start:replit"
entrypoint = "backend/src/server.ts"

[nix]
channel = "stable-24_05"

[deployment]
run = ["sh", "-c", "npm run start:replit"]
deploymentTarget = "cloudrun"

[[ports]]
localPort = 3001
externalPort = 3001

[[ports]]
localPort = 5174
externalPort = 80
```

### `replit.nix` File

Create `replit.nix` in the project root:

```nix
{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.nodePackages.npm
    pkgs.python311
    pkgs.gcc
  ];
}
```

> **Note:** `python311` and `gcc` are needed for compiling `better-sqlite3` native module.

---

## Step 3: Add Start Script

Add this script to the root `package.json`:

```json
{
  "scripts": {
    "start:replit": "npm run install:all && npm run build:all && npm run serve:all",
    "install:all": "cd backend && npm install && cd ../frontend && npm install",
    "build:all": "cd backend && npm run build && cd ../frontend && npm run build",
    "serve:all": "cd backend && npm start & cd frontend && npm run preview -- --host 0.0.0.0"
  }
}
```

---

## Step 4: Configure Environment Variables

### Using Replit Secrets

Go to **Tools** > **Secrets** in your Repl and add these variables:

#### Backend Secrets

| Key | Value | Description |
|-----|-------|-------------|
| `PORT` | `3001` | Backend API port |
| `NODE_ENV` | `production` | Environment mode |
| `DATABASE_PATH` | `./dentix.db` | SQLite database path |
| `ENABLE_CACHING` | `false` | Disable caching (fresh API calls) |
| `CLOUD9_SANDBOX_ENDPOINT` | `https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx` | Sandbox API |
| `CLOUD9_SANDBOX_CLIENT_ID` | `your-sandbox-client-id` | Sandbox credentials |
| `CLOUD9_SANDBOX_USERNAME` | `your-sandbox-username` | Sandbox credentials |
| `CLOUD9_SANDBOX_PASSWORD` | `your-sandbox-password` | Sandbox credentials |
| `CLOUD9_PROD_ENDPOINT` | `https://us-ea1-partner.cloud9ortho.com/GetData.ashx` | Production API |
| `CLOUD9_PROD_CLIENT_ID` | `your-prod-client-id` | Production credentials |
| `CLOUD9_PROD_USERNAME` | `your-prod-username` | Production credentials |
| `CLOUD9_PROD_PASSWORD` | `your-prod-password` | Production credentials |

#### LLM / AI Configuration (Required for AI Features)

The application includes AI-powered features that require either Claude CLI or the Anthropic API. **On Replit, you must use API mode** since Claude CLI is not available.

| Key | Value | Description |
|-----|-------|-------------|
| `REPLIT_MODE` | `true` | **Required on Replit** - Enables API-only mode |
| `ANTHROPIC_API_KEY` | `sk-ant-api...` | Your Anthropic API key ([get one here](https://console.anthropic.com/)) |

**How it works:**
- When `REPLIT_MODE=true`, Claude CLI is automatically disabled
- All AI features use the Anthropic API directly
- The `USE_CLAUDE_CLI` setting is ignored when Replit mode is enabled

**AI Features that use this:**
- Goal suggestions for test cases
- AI-powered prompt/tool enhancements
- Semantic evaluation in test-agent
- Natural language goal analysis

#### Frontend Environment

Create `frontend/.env.production`:

```env
VITE_API_URL=https://your-repl-name.your-username.repl.co/api
VITE_DEFAULT_ENVIRONMENT=sandbox
```

Replace `your-repl-name.your-username.repl.co` with your actual Replit URL.

---

## Step 5: Update CORS Configuration

Edit `backend/src/middleware/cors.ts` to allow your Replit domain:

```typescript
const allowedOrigins = [
  'http://localhost:5174',
  'http://localhost:5173',
  'https://your-repl-name.your-username.repl.co',
  // Add your Replit URL here
];
```

---

## Step 6: Run the Application

1. Click the **Run** button in Replit
2. Wait for dependencies to install and build to complete
3. The Webview will open showing your frontend

### Verify Deployment

- **Frontend**: Opens automatically in Replit's Webview
- **Backend Health**: Visit `https://your-repl.repl.co:3001/health`
- **API Test**: `https://your-repl.repl.co:3001/api/reference/locations`

---

## Test-Agent Setup (Optional)

The test-agent runs E2E tests against the Flowise chatbot integration.

### Install Test-Agent Dependencies

```bash
cd test-agent
npm install
```

### Configure Test-Agent Environment

Create `test-agent/.env`:

```env
# Replit Mode - REQUIRED on Replit (disables Claude CLI, uses API)
REPLIT_MODE=true

# Anthropic API Key - REQUIRED when REPLIT_MODE=true
ANTHROPIC_API_KEY=your-api-key

# Flowise endpoint (required for E2E chatbot tests)
FLOWISE_ENDPOINT=https://your-flowise-instance/api/v1/prediction/your-flow-id
```

> **Note:** On Replit, you must set `REPLIT_MODE=true` because Claude CLI is not available. The test-agent will use the Anthropic API directly for AI-powered evaluation.

### Run Tests

```bash
cd test-agent
npm start -- --scenario GOAL-SCHED --verbose
```

### Test Results

Results are stored in `test-agent/data/test-results.db` (SQLite).

---

## Project Structure on Replit

```
dentix-ortho/
├── .replit              # Replit run configuration
├── replit.nix           # Nix dependencies
├── package.json         # Root package with start scripts
├── backend/
│   ├── .env             # (use Replit Secrets instead)
│   ├── package.json
│   ├── dist/            # Compiled TypeScript
│   └── dentix.db        # SQLite database (auto-created)
├── frontend/
│   ├── .env.production
│   ├── package.json
│   └── dist/            # Built React app
└── test-agent/
    ├── .env
    ├── package.json
    └── data/            # Test results
```

---

## Troubleshooting

### Issue: `better-sqlite3` compilation fails

**Solution:** Ensure `replit.nix` includes `python311` and `gcc`:

```nix
{ pkgs }: {
  deps = [
    pkgs.nodejs_20
    pkgs.nodePackages.npm
    pkgs.python311
    pkgs.gcc
  ];
}
```

### Issue: Port not accessible

**Solution:** Ensure ports are defined in `.replit`:

```toml
[[ports]]
localPort = 3001
externalPort = 3001
```

### Issue: CORS errors

**Solution:** Add your Replit URL to the CORS allowed origins in `backend/src/middleware/cors.ts`.

### Issue: Frontend can't reach backend

**Solution:** Update `frontend/.env.production`:

```env
VITE_API_URL=https://your-repl-name.your-username.repl.co:3001/api
```

Or use relative URLs if both are on the same domain.

### Issue: Database not persisting

**Solution:** SQLite file persists in Replit's filesystem. If you're on the free tier, the Repl may sleep and data persists when it wakes.

### Issue: Slow cold starts

**Solution:** Upgrade to Replit's Hacker plan for always-on Repls, or use the Deployments feature for production.

---

## Production Deployment

For production use, consider Replit's **Deployments** feature:

1. Go to **Deployments** tab
2. Click **Deploy**
3. Configure environment variables in deployment settings
4. Your app gets a stable `*.repl.co` URL

### Custom Domain (Optional)

1. Go to Repl settings
2. Click **Custom domains**
3. Add your domain and configure DNS

Update `VITE_API_URL` in frontend to use your custom domain.

---

## Useful Commands

| Command | Description |
|---------|-------------|
| `npm run start:replit` | Full install, build, and serve |
| `cd backend && npm run dev` | Backend development mode |
| `cd frontend && npm run dev` | Frontend development mode |
| `cd test-agent && npm start` | Run E2E tests |

---

## Architecture on Replit

```
Browser → Replit Frontend (Port 5174) → Replit Backend (Port 3001) → Cloud 9 API
                                              ↓
                                         SQLite Cache
```

- Frontend serves static React build via Vite preview
- Backend handles API requests and proxies to Cloud 9
- SQLite provides optional caching (disabled by default)
- Both servers bind to `0.0.0.0` for Replit compatibility

---

## Support

- **Cloud 9 API Issues**: Contact cloud9.integrations@planetdds.com
- **Replit Issues**: Check [Replit Docs](https://docs.replit.com)
- **Project Issues**: See project README.md

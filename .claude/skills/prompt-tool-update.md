# Prompt & Tool Update Skill

## Skill Metadata
- **Name**: `prompt-tool-update`
- **Trigger Hints**: "update prompt", "add rule", "fix prompt", "create version", "sync to flowise", "prompt version", "update tool"
- **Description**: Update Allie IVA prompts and tools with version control and Flowise deployment

---

## ⚠️ CRITICAL: Get Latest File Paths First

File names change between versions (V2, V3, V4, etc.). **Always check current mappings before updating:**

```bash
# Quick check - get current file mappings
grep -A 15 "PROMPT_FILE_MAPPINGS" backend/src/services/promptService.ts
```

The `PROMPT_FILE_MAPPINGS` constant in `backend/src/services/promptService.ts` (lines 137-151) defines the authoritative source file paths.

---

## Architecture Overview

There are **TWO systems** that manage prompts:

| System | Purpose | Storage | How to Update |
|--------|---------|---------|---------------|
| **Backend Prompt Service** | Version history, working copies | SQLite database | REST API or script |
| **Flowise** | Live chatbot execution | Flowise internal DB | UI or JSON import |

**IMPORTANT**: Both systems must be updated for changes to take effect in production!

### Storage Locations

- **Database**: `test-agent/data/test-results.db` (SQLite)
- **Tables**:
  - `prompt_working_copies` - Current working version of each prompt
  - `prompt_version_history` - Version history with all past versions

### Source Files (Verify paths in promptService.ts!)

| File Key | Display Name | Check Path In |
|----------|--------------|---------------|
| `system_prompt` | System Prompt | `PROMPT_FILE_MAPPINGS.system_prompt.path` |
| `scheduling_tool` | Scheduling Tool | `PROMPT_FILE_MAPPINGS.scheduling_tool.path` |
| `patient_tool` | Patient Tool | `PROMPT_FILE_MAPPINGS.patient_tool.path` |

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/test-monitor/prompts` | List all prompt files with versions |
| GET | `/api/test-monitor/prompts/:fileKey` | Get current content |
| GET | `/api/test-monitor/prompts/:fileKey/history` | Get version history |
| GET | `/api/test-monitor/prompts/:fileKey/version/:version` | Get specific version |
| POST | `/api/test-monitor/prompts/:fileKey/save` | Save new version (body: {content, changeDescription}) |
| POST | `/api/test-monitor/prompts/:fileKey/reset` | Reset from disk file |
| POST | `/api/test-monitor/prompts/:fileKey/sync` | Sync working copy TO disk |

---

## Update Methods

### Method 1: Update Source File + Reset from Disk (Recommended)

Use when you've modified the source `.md` or `.js` files.

**Step 1**: Check current file paths:
```bash
grep -A 15 "PROMPT_FILE_MAPPINGS" backend/src/services/promptService.ts
```

**Step 2**: Edit the source file(s) at paths shown in PROMPT_FILE_MAPPINGS

**Step 3**: Reset from disk:

```bash
# Option A: Run script
cd backend && npx ts-node -e "
const ps = require('./src/services/promptService');
['system_prompt', 'scheduling_tool', 'patient_tool'].forEach(k => {
  console.log(k, '-> v' + ps.resetFromDisk(k).version);
});
"

# Option B: Call API
curl -X POST http://localhost:3001/api/test-monitor/prompts/system_prompt/reset
curl -X POST http://localhost:3001/api/test-monitor/prompts/scheduling_tool/reset
curl -X POST http://localhost:3001/api/test-monitor/prompts/patient_tool/reset
```

### Method 2: Direct Save via API

Save content directly without modifying source files:

```bash
curl -X POST http://localhost:3001/api/test-monitor/prompts/system_prompt/save \
  -H "Content-Type: application/json" \
  -d '{
    "content": "... your new prompt content ...",
    "changeDescription": "V3.1: Added new feature XYZ"
  }'
```

### Method 3: Using promptService Functions

```typescript
import * as promptService from './src/services/promptService';

// Reset from disk file
const result = promptService.resetFromDisk('system_prompt');
console.log('Reset to version:', result.version);

// Save new version with content
const saveResult = promptService.saveNewVersion(
  'system_prompt',           // fileKey
  newContent,                // content string
  'Description of changes'   // changeDescription
);

// Get current content
const current = promptService.getPromptContent('system_prompt');

// Get version history
const history = promptService.getPromptHistory('system_prompt', 10);
```

---

## Flowise Integration

### Access
- **URL**: `https://app.c1elly.ai`
- **Chatflow**: Ortho appointment scheduling
- **Chatflow JSON**: `docs/Ortho_Chatflow_latest.json`

**IMPORTANT: Flowise prompts can ONLY be updated manually by the user!**
- Claude cannot automate Flowise UI updates
- After updating local files, prompt the user with content to add
- User manually updates Flowise and confirms when done
- Then re-run tests to verify

### Update Flowise Chatflow

**Option A: Update via Flowise UI**
1. Navigate to https://app.c1elly.ai
2. Open the Ortho chatflow
3. Click on the Tool Agent node
4. Update the System Prompt field
5. Save the chatflow

**Option B: Import Updated Chatflow JSON**
1. Update `docs/Ortho_Chatflow_latest.json` with changes
2. In Flowise UI: Chatflows → Import → Select the JSON file

### Chatflow JSON Structure

```json
{
  "nodes": [
    {
      "id": "toolAgent_0",
      "data": {
        "inputs": {
          "systemMessage": "...SYSTEM PROMPT HERE..."
        }
      }
    }
  ]
}
```

---

## Validation Rules

### For JavaScript Files (tools):
- Syntax validation via `vm.compileFunction`
- Required pattern: `async function executeRequest()`
- Required ending: `return executeRequest();`
- Required: `const action = $action`
- Checks for undefined variables (e.g., `cleanedParams`)
- Duplicate case block detection

### For Markdown Files (prompts):
- Brace matching validation
- Empty content check

---

## Database Schema

```sql
-- Working copies (current state)
CREATE TABLE prompt_working_copies (
  id INTEGER PRIMARY KEY,
  file_key TEXT UNIQUE,      -- 'system_prompt', 'scheduling_tool', 'patient_tool'
  file_path TEXT,            -- Disk file path
  display_name TEXT,         -- UI display name
  content TEXT,              -- Current content
  version INTEGER,           -- Current version number
  last_fix_id TEXT,          -- Last applied fix ID
  updated_at TEXT            -- ISO timestamp
);

-- Version history
CREATE TABLE prompt_version_history (
  id INTEGER PRIMARY KEY,
  file_key TEXT,
  version INTEGER,
  content TEXT,
  fix_id TEXT,               -- Associated fix ID (if any)
  change_description TEXT,   -- What changed
  created_at TEXT
);
```

---

## Quick Reference Commands

```bash
# Check current file mappings (DO THIS FIRST!)
grep -A 15 "PROMPT_FILE_MAPPINGS" backend/src/services/promptService.ts

# View current versions
curl http://localhost:3001/api/test-monitor/prompts | jq

# Reset all prompts from disk files
cd backend && npx ts-node -e "
const ps = require('./src/services/promptService');
['system_prompt', 'scheduling_tool', 'patient_tool'].forEach(k => {
  console.log(k, '-> v' + ps.resetFromDisk(k).version);
});
"

# Get version history for system prompt
curl http://localhost:3001/api/test-monitor/prompts/system_prompt/history | jq

# Check current version
curl -s http://localhost:3001/api/test-monitor/prompts/system_prompt | jq '.data.version'
```

---

## Troubleshooting

| Issue | Symptom | Solution |
|-------|---------|----------|
| Prompts not updating in UI | Same version after changes | Check PROMPT_FILE_MAPPINGS points to correct files, then reset from disk |
| Version not incrementing | Same version number after save | Check `getNextVersion()` in promptService.ts |
| Changes not in Flowise | Tests still fail after update | Import updated chatflow JSON to Flowise |
| Validation error on save | "Content validation failed" | Fix brace balance or syntax errors |
| API returns 404 | Prompt file not found | Run `initializeWorkingCopies()` |
| Wrong file being edited | Changes don't appear | Verify file path matches PROMPT_FILE_MAPPINGS |

### Changing Source File Locations

If file names change (e.g., V3 → V4), update `backend/src/services/promptService.ts`:

```typescript
const PROMPT_FILE_MAPPINGS: Record<string, { path: string; displayName: string }> = {
  system_prompt: {
    path: path.resolve(__dirname, '../../../docs/YOUR_NEW_FILE.md'),
    displayName: 'System Prompt',
  },
  // ... etc
};
```

---

## Complete Update Workflow

When updating prompts after making changes:

### Step 1: Verify File Paths
```bash
grep -A 15 "PROMPT_FILE_MAPPINGS" backend/src/services/promptService.ts
```

### Step 2: Edit Source Files
Edit the files at the paths shown in PROMPT_FILE_MAPPINGS

### Step 3: Reset from Disk (Backend)
```bash
cd backend && npx ts-node -e "
const ps = require('./src/services/promptService');
['system_prompt', 'scheduling_tool', 'patient_tool'].forEach(k => {
  console.log(k, '-> v' + ps.resetFromDisk(k).version);
});
"
```

### Step 4: Update Flowise (MANUAL STEP)
Provide user with content to add to Flowise:
```
Add this to the System Prompt in Flowise (https://app.c1elly.ai):

[content here]

Steps:
1. Go to https://app.c1elly.ai
2. Open the Ortho chatflow
3. Edit the System Prompt in the Tool Agent node
4. Add/update the content
5. Save the chatflow
6. Confirm when done
```

### Step 5: Verify
```bash
curl http://localhost:3001/api/test-monitor/prompts | jq
```

---

## Related Files

| File | Purpose |
|------|---------|
| `backend/src/services/promptService.ts` | Core prompt management service + PROMPT_FILE_MAPPINGS |
| `backend/src/controllers/testMonitorController.ts` | API controller (lines 718-931) |
| `backend/src/routes/testMonitor.ts` | Route definitions (lines 77-106) |
| `test-agent/data/test-results.db` | SQLite database with prompt versions |
| `docs/Ortho_Chatflow_latest.json` | Flowise chatflow (import this) |
| `frontend/src/pages/TestMonitor/AgentTuning.tsx` | UI for prompt management |

---

## Important Notes

1. **Local files vs Flowise**: The backend prompt service and disk files are for version tracking. The LIVE chatbot uses whatever is in Flowise. Both must be updated.

2. **Cannot automate Flowise**: Browser automation to app.c1elly.ai is not reliable. Always provide content for manual update.

3. **Test after Flowise update**: Tests will fail until Flowise is manually updated with the new prompt content.

4. **Version history**: Even if Flowise is updated manually, always create a version in the backend service for tracking.

5. **Always verify file paths**: File names change between versions. Check PROMPT_FILE_MAPPINGS before every update.

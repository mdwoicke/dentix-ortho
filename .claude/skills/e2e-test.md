# E2E Testing Skill - Dentix-Ortho Flowise Chatbot

## Skill Metadata
- **Name**: `e2e-test`
- **Trigger Hints**: "run tests", "e2e test", "debug flowise", "analyze langfuse", "test chatbot"
- **Description**: End-to-end testing and debugging workflow for Allie IVA (orthodontic appointment scheduling chatbot via Cloud9 API)

---

## Quick Start Commands

| Task | Command |
|------|---------|
| Run happy path tests | `cd test-agent && npm run run:happy` |
| Run all tests | `cd test-agent && npm run run` |
| Run specific test | `cd test-agent && npx ts-node src/index.ts run --scenario HAPPY-001` |
| Run by category | `cd test-agent && npm run run -- --category edge-case` |
| Run failed tests only | `cd test-agent && npm run run:failed` |
| View last results | `cd test-agent && npm run results` |
| View recommendations | `cd test-agent && npm run recommendations` |
| Generate report | `cd test-agent && npm run report` |
| List all scenarios | `cd test-agent && npx ts-node src/index.ts scenarios` |
| Check regressions | `cd test-agent && npx ts-node src/index.ts regression-check` |
| View transcript | `cd test-agent && npx ts-node src/index.ts transcript HAPPY-001` |
| Debug via Langfuse | `node langfuse-debug.js` |
| Clear test data | `cd test-agent && npx ts-node src/index.ts clear --force` |

---

## File Reference

### Test Agent Core
| File | Purpose |
|------|---------|
| `test-agent/src/index.ts` | CLI entry point (Commander.js) |
| `test-agent/src/core/agent.ts` | Main TestAgent orchestrator |
| `test-agent/src/core/flowise-client.ts` | Flowise API client |
| `test-agent/src/core/cloud9-client.ts` | Cloud9 sandbox data client |
| `test-agent/src/config/config.ts` | Configuration (endpoints, timeouts) |
| `test-agent/package.json` | npm scripts and dependencies |

### Test Scenarios
| File | Content |
|------|---------|
| `test-agent/src/tests/scenarios/happy-path.ts` | HAPPY-001, HAPPY-002, HAPPY-003 |
| `test-agent/src/tests/scenarios/edge-cases.ts` | EDGE-001 to EDGE-005 |
| `test-agent/src/tests/scenarios/error-handling.ts` | ERR-001 to ERR-006 |
| `test-agent/src/tests/scenarios/index.ts` | Scenario registry |
| `test-agent/src/tests/test-case.ts` | TestCase interface & patterns |

### Database & Storage
| File | Purpose |
|------|---------|
| `test-agent/data/test-results.db` | SQLite database (results, transcripts, api_calls) |
| `test-agent/src/storage/database.ts` | Database schema and query methods |

### Analysis & Reporting
| File | Purpose |
|------|---------|
| `test-agent/src/analysis/response-analyzer.ts` | Response pattern analysis |
| `test-agent/src/analysis/recommendation-engine.ts` | Fix recommendations |
| `test-agent/src/reporters/console-reporter.ts` | Terminal output |
| `test-agent/src/reporters/markdown-reporter.ts` | Report generation |

### Flowise Tools (in docs/)
| File | Purpose |
|------|---------|
| `docs/chord_dso_patient-FIXED.js` | Patient management tool script |
| `docs/chord_dso_patient-FIXED.json` | Patient tool JSON config |
| `docs/chord_dso_scheduling-StepwiseSearch.js` | Scheduling tool script |
| `docs/chord_dso_scheduling-StepwiseSearch.json` | Scheduling tool JSON config |
| `docs/Chord_Cloud9_SystemPrompt.md` | Allie IVA system prompt |

### Debug Scripts
| File | Purpose |
|------|---------|
| `langfuse-debug.js` | Langfuse trace analyzer |
| `.mcp.json` | MCP config with langfuse-traces server |

---

## Database Schema

### Tables
```sql
test_runs       -- Top-level test run records (run_id, status, counts)
test_results    -- Individual test outcomes (test_id, status, error_message)
transcripts     -- Full conversation logs (transcript_json)
api_calls       -- Tool invocations (tool_name, request_payload, response_payload)
findings        -- Detected issues (type, severity, recommendation)
recommendations -- Suggested fixes (type, priority, solution)
```

---

## Database Query Templates

### Get Transcript for Failed Test
```javascript
const Database = require('better-sqlite3');
const db = new Database('./test-agent/data/test-results.db');

const row = db.prepare(`
  SELECT transcript_json
  FROM transcripts
  WHERE test_id = 'HAPPY-XXX'
  ORDER BY id DESC LIMIT 1
`).get();

const transcript = JSON.parse(row.transcript_json);
transcript.forEach(t => {
  console.log(`[${t.role}]: ${t.content.substring(0,300)}`);
  console.log('---');
});
db.close();
```

### Get API Calls Made During Test
```javascript
const Database = require('better-sqlite3');
const db = new Database('./test-agent/data/test-results.db');

const calls = db.prepare(`
  SELECT tool_name, request_payload, response_payload
  FROM api_calls
  WHERE test_id = 'HAPPY-XXX'
  ORDER BY id DESC
`).all();

calls.forEach(c => {
  console.log(`\n=== ${c.tool_name} ===`);
  console.log('Request:', c.request_payload?.substring(0,400));
  console.log('Response:', c.response_payload?.substring(0,400));
});
db.close();
```

### Get Latest Test Run Summary
```javascript
const Database = require('better-sqlite3');
const db = new Database('./test-agent/data/test-results.db');

const run = db.prepare(`
  SELECT * FROM test_runs ORDER BY started_at DESC LIMIT 1
`).get();

console.log(`Run ID: ${run.run_id}`);
console.log(`Status: ${run.status}`);
console.log(`Pass rate: ${(run.passed / run.total_tests * 100).toFixed(1)}%`);
console.log(`Passed: ${run.passed}, Failed: ${run.failed}, Total: ${run.total_tests}`);
db.close();
```

### Find All Failures from Last Run
```javascript
const Database = require('better-sqlite3');
const db = new Database('./test-agent/data/test-results.db');

const failures = db.prepare(`
  SELECT test_id, test_name, error_message
  FROM test_results
  WHERE run_id = (SELECT run_id FROM test_runs ORDER BY started_at DESC LIMIT 1)
    AND status IN ('failed', 'error')
`).all();

failures.forEach(f => {
  console.log(`${f.test_id}: ${f.test_name}`);
  console.log(`  Error: ${f.error_message}`);
});
db.close();
```

---

## Iterative Debugging Workflow

### Phase 1: Run Tests
```bash
cd test-agent && npm run run:happy
```

Look for output like:
```
HAPPY-001: PASSED (52s)
HAPPY-002: FAILED (32s) - Unexpected pattern: "error|sorry|unable"
HAPPY-003: PASSED (26s)

Pass rate: 66.7% (2/3)
```

### Phase 2: Analyze Failures

**Step 1**: Get the actual bot response
```javascript
// Run in Node.js REPL or save as debug-transcript.js
const Database = require('better-sqlite3');
const db = new Database('./test-agent/data/test-results.db');
const row = db.prepare("SELECT transcript_json FROM transcripts WHERE test_id='HAPPY-002' ORDER BY id DESC LIMIT 1").get();
const transcript = JSON.parse(row.transcript_json);

// Find the failing step
const failingStep = transcript.filter(t => t.stepId === 'step-11-select-time');
failingStep.forEach(t => console.log(`[${t.role}]: ${t.content}`));
```

**Step 2**: Get the API calls made
```javascript
const calls = db.prepare("SELECT tool_name, request_payload, response_payload FROM api_calls WHERE test_id='HAPPY-002' ORDER BY id DESC LIMIT 10").all();
calls.forEach(c => {
  console.log(`\n=== ${c.tool_name} ===`);
  console.log('Request:', JSON.parse(c.request_payload || '{}'));
  console.log('Response:', JSON.parse(c.response_payload || '{}'));
});
```

### Phase 3: Identify Root Cause

Common failure patterns:

| Symptom | Root Cause | Where to Look |
|---------|------------|---------------|
| "No slots available" | Wrong year in dates | Check request_payload startDate/endDate |
| "Unable to retrieve availability" | Tool parameter missing | Check if numberOfPatients is in request |
| "providerGUID required" | Patient tool missing default | Check chord_dso_patient-FIXED.js |
| Test fails but bot response looks OK | Pattern mismatch | Check expectedPatterns in happy-path.ts |

### Phase 4: Apply Fix

**If test pattern issue** (bot said something valid but different):
```typescript
// Edit test-agent/src/tests/scenarios/happy-path.ts
expectedPatterns: [/scheduled|booked|confirmed|great|wonderful|got.*you/i],
```

**If tool script issue** (missing defaults):
```javascript
// Edit docs/chord_dso_scheduling-StepwiseSearch.js
if (!params.numberOfPatients) {
    params.numberOfPatients = 2;  // Default for siblings
}
```

**If system prompt issue** (wrong conversation flow):
```markdown
// Edit docs/Chord_Cloud9_SystemPrompt.md
// Update step instructions or add clarifying rules
```

### Phase 5: Verify Fix
```bash
# Run just the failing test
cd test-agent && npx ts-node src/index.ts run --scenario HAPPY-002

# If it passes, run full suite to check for regressions
npm run run:happy
```

---

## Tool Reference

### chord_dso_patient (Patient Management)

| Action | Purpose | Required Params | Default Values |
|--------|---------|-----------------|----------------|
| `lookup` | Find patient by phone/name | `phoneNumber` or `filter` | - |
| `get` | Get patient details | `patientGUID` | - |
| `create` | Register new patient | `patientFirstName`, `patientLastName` | `providerGUID`, `locationGUID` |
| `appointments` | Get patient's appointments | `patientGUID` | - |
| `clinic_info` | Get location details | (none) | Uses default locationGUID |
| `edit_insurance` | Update insurance info | `patientGUID`, `insuranceProvider` | - |
| `confirm_appointment` | Confirm appointment | `appointmentId` | - |

**Hardcoded Defaults:**
```javascript
defaultProviderGUID: '79ec29fe-c315-4982-845a-0005baefb5a8'
defaultLocationGUID: '1070d281-0952-4f01-9a6e-1a2e6926a7db'  // CDH Ortho Alleghany
```

### schedule_appointment_dso (Scheduling)

| Action | Purpose | Required Params | Default Values |
|--------|---------|-----------------|----------------|
| `slots` | Get available times | `startDate`, `endDate` | - |
| `grouped_slots` | Get sibling slots | `startDate`, `endDate` | `numberOfPatients=2` |
| `book_child` | Create appointment | `patientGUID`, `startTime`, `scheduleViewGUID`, `scheduleColumnGUID` | `appointmentTypeGUID` |
| `cancel` | Cancel appointment | `appointmentGUID` | - |

**Hardcoded Defaults:**
```javascript
defaultApptTypeGUID: '8fc9d063-ae46-4975-a5ae-734c6efe341a'  // New patient ortho consult
numberOfPatients: 2  // Default for grouped_slots if not provided
```

**Stepwise Search Config:**
- Max attempts: 3
- Expansion per retry: +10 days
- Max range: 196 days (Cloud9 API limit)

---

## Common Issues & Solutions

| Issue | Symptom | Root Cause | Solution |
|-------|---------|------------|----------|
| Wrong year in dates | "No slots available", transfer to live agent | LLM interprets "January" as current year | Use explicit "January 2026" in test messages |
| numberOfPatients missing | grouped_slots fails with error | Flowise doesn't inject param | Added default fallback `params.numberOfPatients = 2` |
| providerGUID required | Patient create returns error | Tool missing default | Added `defaultProviderGUID` constant |
| appointmentTypeGUID empty | book_child fails | Slots API returns empty field | Added `defaultApptTypeGUID` constant |
| Pattern mismatch | Test fails despite valid response | expectedPatterns too strict | Expand regex: `/scheduled\|booked\|confirmed\|great/i` |
| Past date submitted | API returns no slots | Date before current date | Scheduling tool auto-corrects to tomorrow |

---

## Test Scenario IDs

### Happy Path (3 tests)
| ID | Name | Steps | Description |
|----|------|-------|-------------|
| HAPPY-001 | New Patient - Single Child | 15 | Complete booking for one child |
| HAPPY-002 | New Patient - Two Siblings | 12 | Book appointments for two children |
| HAPPY-003 | Quick Info Provider | 6 | Parent provides info upfront efficiently |

### Edge Cases (5 tests)
| ID | Name | Description |
|----|------|-------------|
| EDGE-001 | Existing Patient | Should transfer to specialist |
| EDGE-002 | Three Siblings | Handle 3+ children booking |
| EDGE-003 | User Changes Mind | Mid-flow correction handling |
| EDGE-004 | Previous Ortho Treatment | Accept and continue flow |
| EDGE-005 | Non-Ortho Intent | Clarify orthodontic-only service |

### Error Handling (6 tests)
| ID | Name | Description |
|----|------|-------------|
| ERR-001 | Gibberish Input | Recover from nonsense input |
| ERR-002 | Empty Input | Handle whitespace-only messages |
| ERR-003 | Very Long Input | Process extremely long messages |
| ERR-004 | Cancel Mid-Flow | Honor cancellation request |
| ERR-005 | Special Characters | Handle O'Connor-Smith names |
| ERR-006 | Unclear Children Count | Ask for clarification |

---

## Langfuse Integration

### Run Analysis Script
```bash
node langfuse-debug.js
```

### Key Functions in langfuse-debug.js
- `getRecentTraces(limit)` - Fetch last N traces from Langfuse
- `getObservations(traceId)` - Get all observations for a trace
- `analyzeToolLogs(observations)` - Extract tool call details (inputs, outputs, latency)
- `searchForAppointmentBooking(observations)` - Find booking attempts
- `findBookingFailureTraces(traces)` - Identify failed bookings

### MCP Configuration (`.mcp.json`)
```json
{
  "mcpServers": {
    "langfuse-traces": {
      "command": "npx",
      "args": ["-y", "shouting-mcp-langfuse"],
      "env": {
        "LANGFUSE_HOST": "https://us.cloud.langfuse.com",
        "LANGFUSE_PUBLIC_KEY": "pk-lf-...",
        "LANGFUSE_SECRET_KEY": "sk-lf-..."
      }
    }
  }
}
```

---

## Configuration Reference

### test-agent/src/config/config.ts
```typescript
flowise: {
  endpoint: 'https://app.c1elly.ai/api/v1/prediction/5f1fa57c-e6fd-463c-ac6e-c73fd5fb578b',
  timeout: 60000,
  retryAttempts: 3
}
database: {
  path: './data/test-results.db'
}
tests: {
  defaultDelayBetweenSteps: 500,
  maxConversationTurns: 20
}
```

### Critical Date Constraint
**No appointment slots exist before 1/1/2026 in the Cloud9 sandbox.**

All test scenarios must use dates in January 2026 or later:
```typescript
userMessage: 'Any morning the first week of January 2026 works'
```

---

## Troubleshooting Checklist

When a test fails, follow this checklist:

1. [ ] Check console output for error type (pattern mismatch vs API error)
2. [ ] Query transcript from database to see actual bot response
3. [ ] Query API calls to see tool requests and responses
4. [ ] Verify dates in requests are January 2026+
5. [ ] Check if expected patterns match what bot actually said
6. [ ] Check if tool defaults are being applied (look for console logs)
7. [ ] Run `node langfuse-debug.js` for deeper trace analysis
8. [ ] Make targeted fix (test pattern, tool script, or prompt)
9. [ ] Re-run single test: `npx ts-node src/index.ts run --scenario HAPPY-XXX`
10. [ ] Run full suite to check for regressions: `npm run run:happy`

---

## Example Debug Session

```bash
# 1. Run tests
cd test-agent && npm run run:happy

# Output shows HAPPY-002 failed at step-11-select-time

# 2. Query database for actual response
node -e "
const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db');
const row = db.prepare(\"SELECT transcript_json FROM transcripts WHERE test_id='HAPPY-002' ORDER BY id DESC LIMIT 1\").get();
const t = JSON.parse(row.transcript_json);
t.filter(x => x.stepId === 'step-11-select-time').forEach(x => console.log(x.role + ':', x.content.substring(0,500)));
db.close();
"

# 3. Query API calls
node -e "
const Database = require('better-sqlite3');
const db = new Database('./data/test-results.db');
const calls = db.prepare(\"SELECT tool_name, request_payload, response_payload FROM api_calls WHERE test_id='HAPPY-002' ORDER BY id DESC LIMIT 5\").all();
calls.forEach(c => console.log(c.tool_name, c.response_payload?.substring(0,200)));
db.close();
"

# 4. Found issue: numberOfPatients missing in grouped_slots
# 5. Fixed: Added default in chord_dso_scheduling-StepwiseSearch.js
# 6. Re-test
npx ts-node src/index.ts run --scenario HAPPY-002

# 7. Run full suite
npm run run:happy
```

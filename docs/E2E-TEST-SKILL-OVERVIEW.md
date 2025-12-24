# E2E Test Skill Overview

## What is This?

The `/e2e-test` skill is a comprehensive testing and debugging workflow for the **Dentix-Ortho Flowise Chatbot** (Allie IVA). It automates end-to-end testing of the orthodontic appointment scheduling chatbot and provides tools for analyzing failures.

---

## Purpose

- **Automate Testing**: Run predefined test scenarios against the Flowise chatbot
- **Analyze Failures**: Query conversation transcripts and API calls from a SQLite database
- **Debug Tool Calls**: Trace LLM tool invocations via Langfuse integration
- **Iterate Quickly**: Follow a structured workflow to identify and fix issues

---

## Components

### 1. Test Agent (`test-agent/`)
A Node.js/TypeScript CLI application that:
- Sends messages to the Flowise chatbot endpoint
- Validates responses against expected patterns
- Stores results in SQLite database
- Generates recommendations for fixes

### 2. Flowise Tools (`docs/`)
Two custom tools integrated with Flowise:
- **chord_dso_patient**: Patient management (lookup, create, get appointments)
- **schedule_appointment_dso**: Scheduling (get slots, book appointments, cancel)

### 3. Langfuse Integration (`langfuse-debug.js`)
Script to analyze LLM traces and tool call execution for deeper debugging.

---

## Test Scenarios

| Category | Count | Examples |
|----------|-------|----------|
| Happy Path | 3 | Single child booking, sibling booking, quick info provider |
| Edge Cases | 5 | Existing patient, 3+ siblings, user changes mind |
| Error Handling | 6 | Gibberish input, empty input, special characters |

**Total: 14 test scenarios**

---

## Key Commands

| Action | Command |
|--------|---------|
| Run happy path tests | `cd test-agent && npm run run:happy` |
| Run specific test | `npx ts-node src/index.ts run --scenario HAPPY-001` |
| View recommendations | `npm run recommendations` |
| Generate report | `npm run report` |
| Analyze Langfuse traces | `node langfuse-debug.js` |

---

## Debugging Workflow

```
1. RUN TESTS
   └── npm run run:happy

2. ANALYZE FAILURES
   └── Query database for transcripts & API calls

3. IDENTIFY ROOT CAUSE
   └── Pattern mismatch? Wrong dates? Missing params?

4. APPLY FIX
   └── Update test patterns OR tool scripts OR prompt

5. VERIFY
   └── Re-run specific test, then full suite
```

---

## Data Storage

All test data is stored in SQLite: `test-agent/data/test-results.db`

| Table | Purpose |
|-------|---------|
| `test_runs` | Test run metadata (status, pass/fail counts) |
| `test_results` | Individual test outcomes |
| `transcripts` | Full conversation logs (JSON) |
| `api_calls` | Tool invocations with request/response payloads |
| `findings` | Detected issues |
| `recommendations` | Suggested fixes |

---

## Common Issues Solved

| Problem | Cause | Solution |
|---------|-------|----------|
| No slots found | Wrong year (2025 vs 2026) | Use explicit "January 2026" |
| numberOfPatients missing | Flowise param injection | Added default fallback |
| providerGUID required | Tool missing default | Added hardcoded default |
| Pattern mismatch | Bot wording varies | Expanded regex patterns |

---

## Critical Constraint

**No appointment slots exist before January 1, 2026 in the Cloud9 sandbox.**

All test scenarios must use dates in January 2026 or later.

---

## File Structure

```
dentix-ortho/
├── test-agent/                     # Test automation
│   ├── src/
│   │   ├── index.ts               # CLI entry point
│   │   ├── core/                  # Agent, clients
│   │   ├── tests/scenarios/       # Test definitions
│   │   ├── analysis/              # Result analysis
│   │   └── storage/               # Database layer
│   └── data/test-results.db       # SQLite database
│
├── docs/                           # Flowise tools & prompts
│   ├── chord_dso_patient-FIXED.js
│   ├── chord_dso_scheduling-StepwiseSearch.js
│   └── Chord_Cloud9_SystemPrompt.md
│
├── langfuse-debug.js              # Trace analyzer
│
└── .claude/skills/
    └── e2e-test.md                # Full skill documentation
```

---

## Related Documentation

- **Full Skill Reference**: `.claude/skills/e2e-test.md`
- **System Prompt**: `docs/Chord_Cloud9_SystemPrompt.md`
- **Cloud9 API Guide**: `CLAUDE.md`

---

## Quick Start

```bash
# 1. Navigate to test agent
cd test-agent

# 2. Install dependencies (first time only)
npm install

# 3. Run happy path tests
npm run run:happy

# 4. If failures, check recommendations
npm run recommendations

# 5. For deeper debugging, query database or use Langfuse
node ../langfuse-debug.js
```

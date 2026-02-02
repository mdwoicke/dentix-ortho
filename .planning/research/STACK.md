# Technology Stack

**Project:** Call Trace Analysis & Diagnostic Agent for Dentix-Ortho IVA
**Researched:** 2026-02-02
**Mode:** Subsequent milestone (adding to existing Express/React/SQLite platform)

## Guiding Principle: Extend, Don't Replace

This project already has a mature stack. The goal is to add trace analysis, intent parsing, fulfillment verification, and diagnostic capabilities using libraries that integrate cleanly with what exists. No framework migrations. No new databases. No new runtimes.

## Recommended Stack

### Already In Place (Do Not Change)

| Technology | Version | Purpose | Status |
|------------|---------|---------|--------|
| Express.js | ^4.18 | Backend API | Stable, keep |
| React | ^19.2 | Frontend | Stable, keep |
| better-sqlite3 | ^9.4 | Local database | Stable, keep |
| @anthropic-ai/sdk | ^0.71 (backend) / ^0.52 (test-agent) | LLM calls | Align versions -- see below |
| langfuse | ^3.38 | Tracing/observability | Stable, keep |
| Zod | ^3.22 (backend) / ^4.2 (frontend) | Schema validation | Keep both |
| shared/llm-provider | N/A | LLM abstraction with Langfuse tracing | Core asset, extend |

### New: Trace Analysis & Intent Extraction

| Technology | Version | Purpose | Why This |
|------------|---------|---------|----------|
| **@anthropic-ai/sdk** | ^0.71 (align all packages) | Intent extraction, diagnostic reasoning, fulfillment verification | Already in use. Claude Haiku 3.5 for classification, Sonnet 4 for complex analysis. No need for another LLM provider. **HIGH confidence** |
| **Zod** (already present) | ^3.22 | Structured output parsing for intent schemas, verification results | Already used for schema validation. Use `.parse()` on LLM JSON outputs. **HIGH confidence** |

**What NOT to use:**
- **LangChain/LlamaIndex** -- Massive abstraction overhead for what is essentially "call Claude, parse JSON." The project already has `shared/llm-provider.ts` which does exactly this with Langfuse tracing built in. Adding LangChain would create two parallel LLM calling paths. Don't.
- **OpenAI SDK** -- No reason to add a second LLM provider. Claude handles all use cases here (classification, analysis, code reasoning).
- **spaCy/NLP libraries** -- The category-classifier already proves that pattern matching + LLM fallback works for this domain. Adding a Python NLP pipeline for intent extraction is over-engineering.

### New: Fulfillment Verification

| Technology | Version | Purpose | Why This |
|------------|---------|---------|----------|
| **xml2js** (already present) | ^0.6.2 | Parse Cloud9 XML responses for record verification | Already used for Cloud9 API integration. Reuse for comparing "what the IVA said it did" vs "what Cloud9 records show." **HIGH confidence** |
| **date-fns** (already in frontend) | ^4.1 | Date comparison for appointment verification | Add to backend/test-agent for comparing scheduled dates, time windows. Lightweight, tree-shakeable. **HIGH confidence** |

**What NOT to use:**
- **xml-js or fast-xml-parser** -- xml2js is already in the project and works. Don't add a second XML parser.

### New: Diagnostic Agent Runtime

| Technology | Version | Purpose | Why This |
|------------|---------|---------|----------|
| **@anthropic-ai/sdk** (tool_use) | ^0.71 | Agentic diagnostic loops -- Claude calls tools to inspect traces, read code, form hypotheses | Claude's native tool_use is the right pattern for diagnostic agents. The project already has the SDK. Define tools as functions, let Claude orchestrate. **HIGH confidence** |
| **diff** | ^7.0 | Compare expected vs actual outputs, show code diffs in diagnostics | Lightweight, well-maintained. Already has `@types/diff` in devDependencies. **MEDIUM confidence** |

**What NOT to use:**
- **AutoGen/CrewAI/other agent frameworks** -- These are Python-first, add massive complexity, and solve problems this project doesn't have (multi-agent coordination across orgs). A single diagnostic agent calling tools via Claude's tool_use API is sufficient and stays in TypeScript.
- **Flowise for diagnostic agents** -- Flowise is the system being diagnosed. Don't use the patient to operate on itself.

### New: Replay Test Harness

| Technology | Version | Purpose | Why This |
|------------|---------|---------|----------|
| **existing test-agent infra** | N/A | Generate and run replay tests from trace data | The test-agent already has goal-test-runner, Flowise API integration, and result storage. Extend it rather than building a new test framework. **HIGH confidence** |
| **@faker-js/faker** (already present) | ^10.1 | Generate variant test data for replay scenarios | Already in test-agent. Use for anonymizing real trace data into replayable test cases. **HIGH confidence** |

**What NOT to use:**
- **Playwright/Puppeteer** -- These are browser automation tools. The IVA is API-driven (Flowise chat API). The existing test-agent already drives conversations programmatically.
- **Jest/Vitest for replay** -- Unit test frameworks aren't the right abstraction for conversational replay. The goal-test-runner pattern (send message, classify response, decide next) is already proven.

### New: Frontend Visualization

| Technology | Version | Purpose | Why This |
|------------|---------|---------|----------|
| **recharts** (already present) | ^3.6 | Trace analysis dashboards, pass/fail trends | Already in frontend. **HIGH confidence** |
| **@monaco-editor/react** (already present) | ^4.7 | Code artifact viewer for diagnostics, diff display | Already in frontend for code editing. Extend for diagnostic code views. **HIGH confidence** |
| **allotment** (already present) | ^1.20 | Split pane layout for trace detail + analysis panel | Already in frontend. **HIGH confidence** |

**No new frontend libraries needed.** The existing component set covers all visualization needs.

## Version Alignment Issue

The `@anthropic-ai/sdk` has version skew:
- Backend: `^0.71.2`
- Test-agent: `^0.52.0`

**Recommendation:** Align both to `^0.71.2`. The test-agent's older version may lack tool_use improvements needed for diagnostic agents. This is a housekeeping task for Phase 1.

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| LLM orchestration | Direct Claude SDK + tool_use | LangChain | Already have llm-provider abstraction; LangChain adds 50+ deps for no benefit |
| Intent extraction | Claude Haiku 3.5 via existing llm-provider | spaCy / custom NLP | Domain is narrow (6 response categories already defined); LLM handles edge cases pattern matching can't |
| Agent framework | Claude tool_use (native) | AutoGen / CrewAI | Python dependency, multi-agent overhead unnecessary for single diagnostic agent |
| Structured output | Zod + JSON parsing | Instructor / Outlines | Already using Zod; Instructor is Python; Outlines is overkill |
| Record verification | Direct Cloud9 API via existing xml2js | Separate verification microservice | Over-architecture; backend already calls Cloud9 |
| Test replay | Extend existing goal-test-runner | New test framework | goal-test-runner already handles conversational E2E |

## Installation

```bash
# Backend -- add date-fns and diff
cd backend && npm install date-fns diff

# Test-agent -- align Anthropic SDK version, add date-fns
cd test-agent && npm install @anthropic-ai/sdk@^0.71.2 date-fns

# Frontend -- nothing new needed
```

Total new dependencies: **2** (date-fns for backend, diff for backend). Everything else is already present.

## Confidence Assessment

| Component | Confidence | Rationale |
|-----------|------------|-----------|
| LLM provider (extend existing) | HIGH | Verified in codebase -- llm-provider.ts with Langfuse tracing exists and works |
| Claude tool_use for diagnostics | HIGH | Anthropic SDK already in project, tool_use is stable API |
| Zod for structured outputs | HIGH | Already used throughout project |
| xml2js for verification | HIGH | Already used for Cloud9 API |
| date-fns | HIGH | Already in frontend, well-known library |
| diff library | MEDIUM | Types already in devDeps suggesting prior consideration; need to verify actual usage |

## Sources

- Codebase inspection: `backend/package.json`, `frontend/package.json`, `test-agent/package.json`
- Codebase inspection: `shared/services/llm-provider.ts` (existing LLM abstraction)
- Codebase inspection: `test-agent/src/services/category-classifier.ts` (existing intent classification)
- Codebase inspection: `backend/src/services/langfuseTraceService.ts` (existing trace import)

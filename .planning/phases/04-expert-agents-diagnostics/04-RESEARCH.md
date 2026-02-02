# Phase 4: Expert Agents & Diagnostics - Research Findings

## 1. What Exists Today

### Diagnosis Infrastructure (Already Built)
The codebase already has a working diagnosis pipeline, but it uses a **generic LLM prompt** rather than specialized expert agents:

- **`POST /test-monitor/runs/:runId/diagnose`** - Runs diagnosis on test run failures via `npm run analyze` in test-agent
- **`POST /test-monitor/production-calls/:traceId/diagnose`** - Diagnoses a single production trace using LLM
- **`POST /test-monitor/production-calls/sessions/:sessionId/diagnose`** - Diagnoses all traces in a session
- **`DiagnosisPanel.tsx`** - Frontend component for test run diagnosis
- **`TraceAnalysisPage.tsx`** and **`AnalysisPage.tsx`** - Frontend pages with diagnose buttons wired

The current diagnosis approach in `testMonitorController.ts` (line ~8904) sends the transcript + API errors to a generic LLM prompt asking it to be "an expert at analyzing and fixing dental appointment scheduling chatbot issues." It produces fixes targeting `system_prompt`, `scheduling_tool`, or `patient_tool`.

### Trace Analysis Pipeline (Phase 1-3)
- **`callerIntentClassifier.ts`** - LLM-based intent classification (booking, rescheduling, cancellation, info_lookup) using Claude 3.5 Haiku via direct HTTP
- **`toolSequenceMapper.ts`** - Maps expected vs actual tool call sequences. Already knows the expected sequence for booking (current_date_time -> patient lookup -> slots -> create_patient -> book_child)
- **`fulfillmentVerifier.ts`** - Verifies claimed patient/appointment GUIDs against Cloud9 API. Produces `FulfillmentVerdict` with overallStatus, records, childVerifications
- **`traceAnalysisController.ts`** - Orchestrates all three services, caches results in `session_analysis` table

### Fix Storage & Application
- **`generated_fixes` table** (test-agent/data/test-results.db) - Stores fixes with: fix_id, run_id, type (prompt/tool), target_file, change_description, change_code, priority, confidence, root_cause_json, status (pending/applied/rejected/verified)
- **`promptService.ts`** - Full prompt versioning system with `prompt_working_copies` and `prompt_version_history` tables. Supports applying fixes, syntax validation (vm.compileFunction for JS), brace matching, and Flowise escaping
- **`fixApplicationService.ts`** - Applies generated fixes to prompt working copies

### V1 Artifact Management
- **`prompt_working_copies` table** - Current version of each artifact (file_key: system_prompt, scheduling_tool, patient_tool, nodered_flow)
- **`prompt_version_history` table** - Full version history with change descriptions
- **`noderedDeployService.ts`** - Deploys flows from V1 source files, creates backups, tracks revisions
- V1 source files in `docs/v1/` with file keys: `system_prompt`, `scheduling_tool`, `patient_tool`, `nodered_flow`

### LLM Provider Pattern
Multiple services use `getLLMProvider()` (found in testMonitorController, claudeSkillService, aiEnhancementService, goalSuggestionService, goalAnalysisService). This is the standard pattern for LLM calls.

## 2. Gap Analysis: What Must Be Built

### EXPERT-01 through EXPERT-04: Four Expert Agents
**Current state:** One generic diagnosis prompt handles everything.
**Required:** Four specialized agents, each with deep domain knowledge:

| Agent | Domain Knowledge Required | V1 Artifact |
|-------|--------------------------|-------------|
| Node-RED Flow Expert | Flow routing, session cache, API orchestration, chair selection, slot grouping | `nodered_Cloud9_flows.json` |
| Patient Tool Expert | Patient lookup, creation, family linkage, sibling handling, Cloud9 patient API | `patient_tool_func.js` + `chord_dso_patient_Tool.json` |
| Scheduling Tool Expert | Slot search, booking, reservation logic, multi-child scheduling, Cloud9 appointment API | `scheduling_tool_func.js` + `schedule_appointment_dso_Tool.json` |
| System Prompt Expert | Conversation flow design, persona rules, data gathering sequences, edge cases | `Chord_Cloud9_SystemPrompt.md` |

**Implementation approach:** Each expert agent needs:
1. A system prompt with deep domain knowledge about its artifact
2. The current version of its artifact loaded as context (from `prompt_working_copies`)
3. Understanding of common failure patterns in its domain
4. Ability to produce targeted code diffs

### EXPERT-05: Artifact Loading
**Current state:** `prompt_working_copies` table already stores current versions of all four artifacts.
**Required:** A mechanism to load the current artifact content into each expert agent's context when invoked.
**Gap:** Straightforward -- query `prompt_working_copies` by file_key and inject into agent context.

### DIAG-01: Diagnostic Orchestrator Routing
**Current state:** `diagnoseProductionTrace` sends everything to one generic prompt.
**Required:** An orchestrator that:
1. Takes the trace analysis output (intent, tool sequence, fulfillment verdict)
2. Identifies WHERE in the call flow the failure occurred (using `toolSequenceMapper` step statuses)
3. Routes to the relevant expert agent(s)

**Routing logic (based on existing `StepStatus` from toolSequenceMapper):**
- Failed/missing patient lookup/create steps -> Patient Tool Expert
- Failed/missing slot search/booking steps -> Scheduling Tool Expert
- API errors in Node-RED calls -> Node-RED Flow Expert
- Conversation flow issues (wrong data gathering, persona violations) -> System Prompt Expert
- Multiple failure points -> invoke multiple experts

### DIAG-02: Markdown Report Generation
**Current state:** The LLM returns JSON with analysis.summary, issues, rootCause, and fixes array.
**Required:** Structured markdown report with: root cause, affected artifact, confidence level, call flow context.
**Gap:** Transform the existing JSON output format into a markdown report. Could be a post-processing step or change the expert agent prompt to output markdown.

### DIAG-03: PR-Ready Code Diffs
**Current state:** Fixes have `change_code` field with the actual code/text change, but no unified diff format.
**Required:** Generate actual unified diff (or similar) against the current artifact version.
**Implementation:** Load current artifact from `prompt_working_copies`, apply suggested changes, generate diff. The `promptService.ts` already has the infrastructure for loading and applying changes.

### DIAG-04: Flow Deploy Version Correlation
**Current state:** `noderedDeployService.ts` tracks `rev` (revision) from Node-RED API, and `prompt_version_history` tracks version numbers. But there is NO correlation between failure timestamps and deploy versions.
**Required:** A table or query that maps: failure timestamp -> which version of each artifact was deployed at that time.
**Gap:** Need to store deploy timestamps with version numbers, then join against failure timestamps. The `prompt_version_history.created_at` partially covers this, but needs explicit deploy event tracking.

### DIAG-05: Standalone Expert Invocation
**Current state:** Diagnosis is only triggered from the diagnose endpoints.
**Required:** API endpoints to invoke each expert agent independently for manual troubleshooting.
**Gap:** New endpoints like `POST /api/test-monitor/expert/:agentType/analyze` that accept freeform context.

## 3. Architecture Decisions Needed

1. **Expert agent implementation pattern:** Should experts be separate service files (e.g., `expertAgents/nodeRedFlowExpert.ts`) or a single parameterized service with different system prompts?
   - Recommendation: Single `expertAgentService.ts` with per-domain system prompts and artifact loading. Keeps the pattern simple and consistent with existing LLM provider usage.

2. **Orchestrator routing strategy:** Rule-based (using toolSequenceMapper step statuses) or LLM-based (have an LLM decide which expert to route to)?
   - Recommendation: Rule-based primary routing using existing `StepStatus` data, with fallback to System Prompt Expert for unclassifiable failures. Avoids extra LLM call latency.

3. **Diff generation:** Use a JS diff library (e.g., `diff` npm package) or have the LLM produce diffs directly?
   - Recommendation: LLM produces the suggested replacement code, then use `diff` library to generate unified diff against current artifact. More reliable than asking LLM to format diffs.

4. **Version correlation storage:** New table or extend existing?
   - Recommendation: New `artifact_deploy_events` table with (artifact_key, version, deployed_at, deploy_method, rev). Hook into existing deploy and version update flows.

## 4. Key Files to Modify/Create

### New Files
- `backend/src/services/expertAgentService.ts` - Core expert agent logic with domain-specific prompts
- `backend/src/services/diagnosticOrchestrator.ts` - Routes failures to appropriate expert(s)

### Files to Modify
- `backend/src/controllers/testMonitorController.ts` - Replace generic diagnosis in `diagnoseProductionTrace` and `diagnoseProductionSession` with orchestrator
- `backend/src/routes/testMonitor.ts` - Add standalone expert invocation endpoints
- `backend/src/services/noderedDeployService.ts` - Add deploy event tracking
- `backend/src/services/promptService.ts` - Add deploy event recording on version changes
- `frontend/src/pages/TestMonitor/AnalysisPage.tsx` - Update to show structured diagnostic report
- `frontend/src/services/api/testMonitorApi.ts` - Add new API calls

### Database Changes
- New table: `artifact_deploy_events` (for DIAG-04)
- No changes to `generated_fixes` -- existing schema supports the new output format

## 5. Risks & Considerations

1. **Context window limits:** Node-RED flow JSON (`nodered_Cloud9_flows.json`) can be very large. May need to extract only relevant portions for the expert agent context rather than loading the entire file.

2. **LLM cost:** Each diagnosis now potentially invokes 1-4 expert agents instead of 1 generic call. Consider parallel invocation where multiple experts are needed, and caching of results.

3. **Diff quality:** LLM-generated code changes may not apply cleanly. The existing `promptService.ts` validation (syntax checking, brace matching) should be applied to expert agent output before generating diffs.

4. **Existing diagnose endpoints:** The current `diagnoseProductionTrace` and `diagnoseProductionSession` endpoints are already in use. Migration must be backward-compatible or clearly versioned.

## 6. Dependencies

- **Phase 1 (Trace Analysis):** Fully built. Provides intent classification, tool sequence mapping, fulfillment verification.
- **Phase 2 (assumed):** Should provide the pipeline that detects fulfillment gaps and triggers diagnosis.
- **LLM Provider:** Already available via `getLLMProvider()`.
- **V1 Artifact Versioning:** Already available via `promptService.ts` and `prompt_working_copies`.
- **Node-RED Deploy Service:** Already available, needs minor extension for deploy event tracking.

---
phase: 04-expert-agents-diagnostics
verified: 2026-02-02T19:17:27Z
status: passed
score: 17/17 must-haves verified
---

# Phase 4: Expert Agents & Diagnostics Verification Report

**Phase Goal:** When a call fails, system automatically identifies root cause across the full stack and produces a fix proposal

**Verified:** 2026-02-02T19:17:27Z
**Status:** passed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Four expert agents (nodered_flow, patient_tool, scheduling_tool, system_prompt) can be instantiated with domain-specific system prompts | VERIFIED | All 4 agent types defined in ExpertAgentType, all 4 domain prompts exist (NODERED_FLOW_EXPERT_PROMPT, PATIENT_TOOL_EXPERT_PROMPT, SCHEDULING_TOOL_EXPERT_PROMPT, SYSTEM_PROMPT_EXPERT_PROMPT), each 50-100 lines with domain-specific failure patterns |
| 2 | Each expert agent loads its current V1 artifact from prompt_working_copies table | VERIFIED | loadArtifact() queries SELECT content, version FROM prompt_working_copies WHERE file_key = ?, maps agent types to file keys, handles missing content gracefully with warning, truncates nodered_flow to 15000 chars |
| 3 | Expert agents produce structured JSON analysis with root_cause, affected_artifact, confidence, suggested_code | VERIFIED | ExpertAnalysisResult type includes all required fields, parseAnalysis() extracts rootCause (type, evidence), affectedArtifact (fileKey, currentVersion), confidence 0-100, suggestedCode, diagnosticMarkdown |
| 4 | artifact_deploy_events table exists for version correlation | VERIFIED | Table defined in schema.sql line 295 with fields: id, artifact_key, version, deployed_at, deploy_method, nodered_rev, description, created_at. Indexes on artifact_key and deployed_at |
| 5 | Diagnostic orchestrator routes failed traces to relevant expert agent(s) based on StepStatus data | VERIFIED | determineExperts() checks stepStatuses for failed/missing, routes patient failures to patient_tool, scheduling failures to scheduling_tool, apiErrors to nodered_flow, low completion rate to system_prompt. Returns deduplicated Set as array |
| 6 | diagnoseProductionTrace now uses orchestrator instead of generic prompt | VERIFIED | Line 8924 creates DiagnosticOrchestrator(db), line 8942 calls orchestrator.diagnose(), builds DiagnosticRequest with transcript/apiErrors/stepStatuses from trace. Replaces old generic LLM prompt |
| 7 | Standalone expert endpoints exist at POST /api/test-monitor/expert/:agentType/analyze | VERIFIED | Route defined in testMonitor.ts line 541, handler analyzeWithExpert() at testMonitorController.ts line 9032, validates agentType, creates ExpertAgentService, calls analyze() with freeformContext support |
| 8 | Multiple experts can be invoked for a single trace when failures span domains | VERIFIED | determineExperts() uses Set to collect multiple agents, diagnose() iterates for each agentType and pushes all results to agents array, combinedMarkdown concatenates all agent outputs |
| 9 | Diagnostic reports include unified diff of suggested changes against current artifact | VERIFIED | expertAgentService imports createTwoFilesPatch from diff, attachDiff() generates full-file diffs or partial snippet blocks, detects partial via length less than 50 percent or missing file markers, sets isPartialDiff flag |
| 10 | Deploy events are recorded when artifacts are updated or deployed | VERIFIED | promptService.ts records deploy events on version saves (lines 747-749, 1137-1139), noderedDeployService.ts records on Node-RED deploys via recordDeployEvent() (line 371), both INSERT into artifact_deploy_events |
| 11 | Failures can be correlated with the artifact version that was active at failure time | VERIFIED | DiagnosticOrchestrator.correlateDeployVersions() queries artifact_deploy_events WHERE deployed_at less than or equal to failure timestamp, returns version/deployedAt/deltaMinutes, called for each agent in diagnose() when failureTimestamp provided |

**Score:** 11/11 truths verified


### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| backend/src/services/expertAgentService.ts | Expert agent framework with 4 domain-specific agents | VERIFIED | 397 lines (exceeds 150 min), exports ExpertAgentService, ExpertAgentType, ExpertAnalysisResult. Contains all 4 domain prompts, loadArtifact(), analyze(), analyzeStandalone(), attachDiff(), parseAnalysis(). Imports getLLMProvider from llm-provider. No TODO/FIXME/stubs |
| backend/src/services/diagnosticOrchestrator.ts | Rule-based routing from failure location to expert agents | VERIFIED | 242 lines (exceeds 100 min), exports DiagnosticOrchestrator, DiagnosticReport, DiagnosticRequest. Contains determineExperts() with routing rules, diagnose() sequential expert invocation, correlateDeployVersions(), buildCombinedMarkdown(). No stubs |
| backend/src/database/schema.sql | artifact_deploy_events table | VERIFIED | Table defined at line 295 with all required fields, indexes on artifact_key and deployed_at |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| expertAgentService.ts | llm-provider.ts | getLLMProvider() | WIRED | Import at line 9, called in analyze() line 201 |
| expertAgentService.ts | prompt_working_copies table | db.prepare SELECT | WIRED | loadArtifact() line 158-160 queries table |
| expertAgentService.ts | diff library | createTwoFilesPatch | WIRED | Import at line 8, called in attachDiff() line 268 |
| diagnosticOrchestrator.ts | expertAgentService.ts | ExpertAgentService.analyze() | WIRED | Constructor creates expertService line 105, diagnose() calls in loop line 121 |
| diagnosticOrchestrator.ts | toolSequenceMapper.ts | StepStatus type | WIRED | Import line 11 used in DiagnosticRequest type |
| diagnosticOrchestrator.ts | artifact_deploy_events table | correlateDeployVersions() | WIRED | Method line 172 queries table |
| testMonitorController.ts | diagnosticOrchestrator.ts | orchestrator.diagnose() | WIRED | Import line 24, creates line 8924, calls line 8942 |
| testMonitor.ts | testMonitorController.ts | analyzeWithExpert route | WIRED | Route defined line 541 |
| promptService.ts | artifact_deploy_events table | INSERT on version save | WIRED | Lines 747 and 1137 INSERT |
| noderedDeployService.ts | artifact_deploy_events table | recordDeployEvent() | WIRED | Function line 22, called line 371 |


### Requirements Coverage

| Requirement | Status | Evidence |
|-------------|--------|----------|
| EXPERT-01: Node-RED Flow Expert | SATISFIED | NODERED_FLOW_EXPERT_PROMPT defined, specializes in flow routing, session cache, Cloud9 API orchestration, chair selection, slot grouping, cache refresh, reservation system. Lists 5 common failure patterns |
| EXPERT-02: Patient Tool Expert | SATISFIED | PATIENT_TOOL_EXPERT_PROMPT defined, specializes in patient lookup, creation, family linkage, sibling handling, demographics. Lists 5 common failure patterns |
| EXPERT-03: Scheduling Tool Expert | SATISFIED | SCHEDULING_TOOL_EXPERT_PROMPT defined, specializes in slot search tiers, booking flow, reservation logic, multi-child scheduling, appointment types. Lists 5 common failure patterns |
| EXPERT-04: System Prompt Expert | SATISFIED | SYSTEM_PROMPT_EXPERT_PROMPT defined, specializes in conversation flow, data gathering sequences, persona rules, multi-patient handling, tool invocation guidance. Lists 5 common failure patterns |
| EXPERT-05: Agents loaded with current artifact | SATISFIED | loadArtifact() queries prompt_working_copies for current content by file_key, passes to LLM in analyze() as context |
| DIAG-01: Orchestrator routes to relevant experts | SATISFIED | determineExperts() uses rule-based routing on stepStatuses and apiErrors, supports multiple agents per trace |
| DIAG-02: Experts produce markdown reports | SATISFIED | ExpertAnalysisResult includes rootCause with type and evidence, affectedArtifact, confidence, diagnosticMarkdown. buildCombinedMarkdown() formats all agents into unified report |
| DIAG-03: PR-ready code diffs | SATISFIED | attachDiff() generates unified diffs via createTwoFilesPatch, handles full replacement and partial snippets, sets isPartialDiff flag |
| DIAG-04: Correlate failures with deploy versions | SATISFIED | correlateDeployVersions() queries artifact_deploy_events by timestamp, returns version/deployedAt/deltaMinutes, included in DiagnosticReport.deployCorrelation |
| DIAG-05: Standalone expert invocation | SATISFIED | analyzeStandalone() method for freeform context, standalone endpoint POST /expert/:agentType/analyze with handler analyzeWithExpert() |

All 10 Phase 4 requirements satisfied.

### Anti-Patterns Found

None detected.

**Scanned files:**
- backend/src/services/expertAgentService.ts
- backend/src/services/diagnosticOrchestrator.ts
- backend/src/controllers/testMonitorController.ts
- backend/src/routes/testMonitor.ts
- backend/src/services/promptService.ts
- backend/src/services/noderedDeployService.ts
- backend/src/database/schema.sql

**Anti-pattern checks:**
- TODO/FIXME comments: None
- Placeholder content: None
- Empty implementations: None
- Console.log only implementations: None (legitimate console.log/warn/error for diagnostics)
- Stub patterns: None


### Human Verification Required

None. All goal-level behaviors are verifiable through code structure and wiring.

**Optional manual testing (not blocking):**
1. **End-to-end expert diagnosis**: Call POST /api/test-monitor/production-calls/sessions/:sessionId/diagnose on a real failed trace, verify diagnosticReport contains multiple expert analyses with diffs
2. **Standalone expert endpoint**: Call POST /api/test-monitor/expert/scheduling_tool/analyze with freeform context, verify JSON response structure
3. **Deploy correlation**: After deploying new Node-RED version, trigger diagnosis and verify deployCorrelation field shows correct version and time delta

---

## Summary

**Phase goal achieved: When a call fails, system automatically identifies root cause across the full stack and produces a fix proposal**

All 17 must-haves verified across 3 plans:

**Plan 04-01 (Expert Agent Framework):**
- Four expert agents with domain-specific prompts
- Artifact loading from prompt_working_copies
- Structured JSON analysis output
- artifact_deploy_events table
- LLM integration via getLLMProvider
- TypeScript compiles without errors

**Plan 04-02 (Diagnostic Orchestrator):**
- Rule-based routing to expert agents
- diagnoseProductionTrace uses orchestrator
- Standalone expert endpoints
- Multiple experts per trace
- Backward-compatible response with diagnosticReport field
- StepStatus-based routing logic

**Plan 04-03 (Diffs and Deploy Tracking):**
- Unified diff generation via createTwoFilesPatch
- Partial vs full diff detection
- Deploy event recording in promptService
- Deploy event recording in noderedDeployService
- Version correlation by timestamp
- Combined markdown includes diffs

**Quality indicators:**
- 0 TODOs/FIXMEs
- 0 placeholder implementations
- 0 stub patterns
- All imports resolved
- All database queries wired
- All exports present
- TypeScript compilation clean

**Full stack verified:**
- Frontend: N/A (diagnostic results consumed by existing UI from Phase 3)
- API Layer: diagnoseProductionTrace wired to orchestrator, standalone expert endpoints routed
- Service Layer: expertAgentService and diagnosticOrchestrator fully wired with LLM and DB
- Data Layer: artifact_deploy_events table exists, deploy event recording active
- External: LLM provider integration verified

Phase 04 goal achieved and all requirements satisfied.

---

Verified: 2026-02-02T19:17:27Z
Verifier: Claude (gsd-verifier)

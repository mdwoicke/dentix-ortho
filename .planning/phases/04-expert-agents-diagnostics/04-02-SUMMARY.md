---
phase: "04"
plan: "02"
subsystem: "diagnostics"
tags: ["orchestrator", "expert-routing", "failure-analysis", "step-status"]
dependency-graph:
  requires: ["expertAgentService.ts", "toolSequenceMapper.ts", "callerIntentClassifier.ts"]
  provides: ["DiagnosticOrchestrator", "DiagnosticReport", "analyzeWithExpert endpoint"]
  affects: ["04-03"]
tech-stack:
  added: []
  patterns: ["rule-based-routing", "multi-expert-diagnosis", "deploy-correlation"]
key-files:
  created: ["backend/src/services/diagnosticOrchestrator.ts"]
  modified: ["backend/src/controllers/testMonitorController.ts", "backend/src/routes/testMonitor.ts"]
decisions:
  - "Sequential expert execution to avoid LLM rate limiting"
  - "StepStatus from session_analysis cache with on-the-fly fallback via classifyCallerIntent + mapToolSequence"
  - "Backward-compatible response: all original fields preserved, diagnosticReport added"
metrics:
  duration: "~4 min"
  completed: "2026-02-02"
---

# Phase 4 Plan 2: Diagnostic Orchestrator Summary

**One-liner:** Rule-based orchestrator routes failed traces to domain-specific expert agents based on StepStatus data, with deploy version correlation and combined markdown reports.

## What Was Built

1. **diagnosticOrchestrator.ts** (233 lines) - Core orchestrator with:
   - `determineExperts()` routing rules: patient tool failures -> patient_tool, scheduling failures -> scheduling_tool, API errors -> nodered_flow, low completion -> system_prompt
   - `DiagnosticOrchestrator.diagnose()` runs experts sequentially, combines results
   - `correlateDeployVersions()` queries artifact_deploy_events to find recent deploys near failure time
   - Combined markdown report with per-agent sections

2. **diagnoseProductionTrace updated** - Replaced generic LLM prompt with orchestrator:
   - Builds StepStatus from session_analysis cache or on-the-fly classification
   - Stores expert fixes in generated_fixes table for backward compatibility
   - Response includes all original fields plus new `diagnosticReport` field

3. **Standalone expert endpoint** - `POST /api/test-monitor/expert/:agentType/analyze`
   - Accepts transcript, apiErrors, stepStatuses, and freeform context
   - Returns structured ExpertAnalysisResult

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 3db49f0 | Create diagnosticOrchestrator.ts with rule-based expert routing |
| 2 | 3549e1f | Wire orchestrator into diagnoseProductionTrace and add standalone expert endpoint |

## Deviations from Plan

None - plan executed exactly as written.

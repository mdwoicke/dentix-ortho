---
phase: "04"
plan: "01"
subsystem: "diagnostics"
tags: ["expert-agents", "llm", "failure-analysis", "domain-specific"]
dependency-graph:
  requires: ["shared/services/llm-provider.ts", "prompt_working_copies table"]
  provides: ["ExpertAgentService", "ExpertAgentType", "ExpertAnalysisResult", "artifact_deploy_events table"]
  affects: ["04-02", "04-03"]
tech-stack:
  added: []
  patterns: ["domain-specific-agents", "structured-json-analysis"]
key-files:
  created: ["backend/src/services/expertAgentService.ts"]
  modified: ["backend/src/database/schema.sql"]
decisions: []
metrics:
  duration: "~3 min"
  completed: "2026-02-02"
---

# Phase 4 Plan 1: Expert Agent Service Summary

**One-liner:** Four domain-specific LLM agents (nodered_flow, patient_tool, scheduling_tool, system_prompt) with structured JSON root cause analysis via shared LLM provider.

## What Was Built

1. **expertAgentService.ts** (243 lines) - Core service with:
   - `ExpertAgentType` union of 4 agent types
   - `ExpertAnalysisResult` interface with rootCause, affectedArtifact, confidence, suggestedCode, diagnosticMarkdown
   - `ExpertAgentService` class that loads artifacts from `prompt_working_copies` table and calls `getLLMProvider().execute()`
   - Domain-specific system prompts for each agent type covering their area of expertise
   - Graceful error handling: LLM failures return fallback results, unparseable JSON wrapped as diagnostic markdown

2. **artifact_deploy_events table** - Schema addition for correlating artifact versions with deployment times, indexed by artifact_key and deployed_at.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | e6348d0 | Expert agent service with 4 domain agents |
| 2 | e660ced | artifact_deploy_events table in schema |

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

- ExpertAgentService ready for integration into diagnosis pipeline (04-02)
- artifact_deploy_events table ready for version correlation queries (04-03)

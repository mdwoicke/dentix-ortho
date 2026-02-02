# Phase 1 Plan 1: Intent Classification and Tool Sequence Mapping Summary

**One-liner:** Caller intent classifier via Anthropic Haiku + tool sequence mapper with per-child occurrence tracking

## What Was Built

### CallerIntentClassifier (`backend/src/services/callerIntentClassifier.ts`)
- **ConversationTurn** type matching backend's existing interface pattern
- **BookingDetails** type: childCount, childNames, parentName, parentPhone, requestedDates
- **CallerIntent** type: type (booking|rescheduling|cancellation|info_lookup), confidence, bookingDetails, summary
- `classifyCallerIntent(transcript)` - sends transcript to Claude 3.5 Haiku via direct HTTP fetch to Anthropic API
- Graceful fallbacks: empty transcript returns info_lookup@0.5, missing API key returns info_lookup@0, LLM errors return info_lookup@0
- Uses `ANTHROPIC_API_KEY` env var (matches existing backend pattern)

### ToolSequenceMapper (`backend/src/services/toolSequenceMapper.ts`)
- **ExpectedStep** type with toolName, action, description, occurrences (once|per_child), optional flag
- **StepStatus** type with completion tracking, observation IDs, and error details
- **ToolSequenceResult** with expectedSteps, stepStatuses, completionRate
- `getExpectedSequence(intent)` - returns expected tool sequence for each intent type
- `mapToolSequence(intent, observations)` - matches observations against expected sequence
- Error detection: level=ERROR, success:false, _debug_error patterns (matches existing codebase conventions)
- Optional steps (e.g., create_patient) excluded from completion rate when missing

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Direct HTTP fetch to Anthropic API | Backend doesn't have shared LLM provider like test-agent; matches simplicity needed |
| ConversationTurn defined locally | Avoids circular dependency with testMonitorController; fields are compatible |
| Optional flag on create_patient step | Not all bookings require new patient creation |
| Completion rate excludes optional missing | More accurate representation of actual failures |

## Deviations from Plan

None - plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes with zero errors
- Both files export all public interfaces and functions

## Files Created

- `backend/src/services/callerIntentClassifier.ts`
- `backend/src/services/toolSequenceMapper.ts`

## Commit

- `daa7e6a`: feat(01-01): add caller intent classifier and tool sequence mapper

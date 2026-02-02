# Phase 2: Fulfillment Verification - Research

**Researched:** 2026-02-02
**Domain:** Cloud9 API verification against Langfuse trace tool outputs
**Confidence:** HIGH

## Summary

This phase verifies that IVA call outcomes (patient creation, appointment booking) actually materialized in the Cloud9 system. Phase 1 already classifies intent and maps tool sequences from Langfuse traces. Phase 2 extracts the claimed GUIDs and data from tool call outputs (observations), then queries the Cloud9 API to confirm records exist and match.

The backend already has a complete `Cloud9Client` (`backend/src/services/cloud9/client.ts`) with methods for `searchPatients`, `getPatientInformation`, and `getPatientAppointments`. The trace analysis controller already fetches and caches session observations. The work is connecting these two systems with a verification layer.

**Primary recommendation:** Build a `fulfillmentVerifier.ts` service that extracts claimed records from observation outputs, queries Cloud9 via the existing client, and returns a structured verdict. Extend the existing `/api/trace-analysis/:sessionId` endpoint with a `verification` field.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Cloud9Client (existing) | N/A | Query Cloud9 API for patient/appointment records | Already built, tested, handles XML parsing |
| LangfuseTraceService (existing) | N/A | Fetch session observations with tool outputs | Phase 1 dependency, already working |
| BetterSqlite3 (existing) | N/A | Cache verification results | Already used for session_analysis table |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None new needed | - | - | All infrastructure exists |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── services/
│   ├── fulfillmentVerifier.ts        # NEW - Core verification logic
│   ├── callerIntentClassifier.ts     # Existing Phase 1
│   ├── toolSequenceMapper.ts         # Existing Phase 1
│   └── cloud9/
│       └── client.ts                 # Existing - Cloud9 API client
├── controllers/
│   └── traceAnalysisController.ts    # EXTEND - Add verification endpoint
```

### Pattern 1: Claim Extraction from Observations

**What:** Parse tool call observation outputs to extract claimed GUIDs and data.
**When to use:** For every verification request.

The Langfuse observations contain tool inputs and outputs. For booking flows, the key observations are:

1. `chord_ortho_patient` with action `create_patient` - output contains new patient GUID
2. `schedule_appointment_ortho` with action `book_child` - output contains appointment GUID
3. `chord_ortho_patient` with action `lookup` - output contains existing patient GUID

Extract from observation `output` field (JSON string):
- PatientGUID from create_patient response
- AppointmentGUID from book_child response
- Names, dates from both input and output

```typescript
interface ClaimedRecord {
  type: 'patient' | 'appointment';
  guid: string;
  sourceTool: string;
  sourceAction: string;
  observationId: string;
  claimedData: {
    firstName?: string;
    lastName?: string;
    appointmentDate?: string;
    appointmentType?: string;
    childName?: string;
  };
}
```

### Pattern 2: Verification Result Structure

**What:** Structured pass/fail/partial verdict per record and per session.

```typescript
type VerificationStatus = 'pass' | 'fail' | 'partial' | 'skipped';

interface RecordVerification {
  claimed: ClaimedRecord;
  status: VerificationStatus;
  cloud9Record: any | null;  // Actual record from Cloud9
  mismatches: FieldMismatch[];
  error?: string;
}

interface FieldMismatch {
  field: string;
  expected: string;
  actual: string;
}

interface FulfillmentVerdict {
  sessionId: string;
  overallStatus: VerificationStatus;
  summary: string;
  records: RecordVerification[];
  childVerifications: ChildVerification[];  // Per-child rollup for VERIFY-05
  verifiedAt: string;
}

interface ChildVerification {
  childName: string;
  patientRecordStatus: VerificationStatus;
  appointmentRecordStatus: VerificationStatus;
  details: RecordVerification[];
}
```

### Pattern 3: Cloud9 Query Strategy

**What:** Use existing Cloud9Client methods in specific order.
**When to use:** For each claimed GUID.

For patient verification:
1. `client.getPatientInformation(patientGuid)` - returns full patient details
2. Compare firstName, lastName, birthDate against claimed data

For appointment verification:
1. `client.getPatientAppointments(patientGuid)` - returns all appointments for patient
2. Filter to find the specific appointment by GUID or by date match
3. Compare appointmentDate, appointmentType against claimed data

**Important:** Use `production` environment since traces come from production calls. The existing `Cloud9Client` constructor takes environment parameter.

### Pattern 4: Caching Verification Results

**What:** Extend `session_analysis` table or add new `verification_results` table.
**Recommendation:** Add columns to session_analysis: `verification_json TEXT`, `verification_status TEXT`, `verified_at TEXT`.

This avoids creating a new table and keeps the single-session-single-row pattern.

### Anti-Patterns to Avoid
- **Querying Cloud9 for every page load:** Cache verification results. Cloud9 has rate limits.
- **Assuming GUIDs are always in outputs:** Some tool calls fail; handle missing GUIDs gracefully.
- **Blocking on Cloud9 timeouts:** Cloud9 API can be slow (30s default timeout). Make verification async-friendly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| XML request building | Custom XML strings | Existing `xmlBuilder.ts` | Already handles all Cloud9 procedures |
| Patient search | Custom HTTP calls | `Cloud9Client.searchPatients()` | Already handles auth, parsing, caching |
| Appointment lookup | Custom HTTP calls | `Cloud9Client.getPatientAppointments()` | Already handles XML response parsing |
| Observation parsing | Custom Langfuse fetching | `LangfuseTraceService` + existing observation data | Phase 1 already fetches and stores this |

## Common Pitfalls

### Pitfall 1: Observation Output Format Varies
**What goes wrong:** Tool outputs are stored as JSON strings but format varies between tool types and versions.
**Why it happens:** Node-RED tools evolved over time; output shape is not strictly typed.
**How to avoid:** Parse defensively with fallback paths. Check for both `output.patientGuid` and `output.PatientGUID` style variations. The existing `cloud9-client.ts` in test-agent shows this normalization pattern.
**Warning signs:** `undefined` GUIDs after parsing.

### Pitfall 2: Cloud9 API Rate Limiting
**What goes wrong:** Too many verification requests in quick succession get throttled.
**Why it happens:** Each child verification requires 2+ API calls (patient info + appointments).
**How to avoid:** Serial execution with small delays, or batch by patient. Cache results aggressively. The existing `patientInfoCache` in Cloud9Client already helps (60s TTL).
**Warning signs:** HTTP 429 or timeout errors from Cloud9.

### Pitfall 3: Production vs Sandbox Environment Mismatch
**What goes wrong:** Verification queries sandbox but trace was from production.
**Why it happens:** Default Cloud9Client environment is sandbox.
**How to avoid:** Always instantiate `new Cloud9Client('production')` for verification. Per CLAUDE.md, Node-RED prd endpoints point to Production.

### Pitfall 4: Multi-Child Verification Completeness (VERIFY-05)
**What goes wrong:** Checking only the first child and reporting pass.
**Why it happens:** Traces may have N create_patient + N book_child calls; easy to just check first.
**How to avoid:** Group observations by child name (from input), verify each group independently, report per-child status.

### Pitfall 5: Timing Gap Between Trace and Verification
**What goes wrong:** Records may not exist yet when verification runs immediately after call.
**Why it happens:** Cloud9 API has propagation delay.
**How to avoid:** Allow re-verification (force refresh). Show "pending" status if records not found within a few minutes of call completion.

## Code Examples

### Extracting Claimed GUIDs from Observations
```typescript
// Source: Based on toolSequenceMapper.ts observation parsing pattern
function extractClaimedRecords(observations: any[], intent: CallerIntent): ClaimedRecord[] {
  const records: ClaimedRecord[] = [];

  for (const obs of observations) {
    const input = parseJson(obs.input);
    const output = parseJson(obs.output);
    if (!output) continue;

    // Patient creation
    if (obs.name === 'chord_ortho_patient' && input?.action === 'create_patient') {
      const guid = output.patientGuid || output.PatientGUID || output.guid;
      if (guid) {
        records.push({
          type: 'patient',
          guid,
          sourceTool: obs.name,
          sourceAction: 'create_patient',
          observationId: obs.observation_id,
          claimedData: {
            firstName: input.firstName || input.patientFirstName,
            lastName: input.lastName || input.patientLastName,
            childName: input.childName,
          },
        });
      }
    }

    // Appointment booking
    if (obs.name === 'schedule_appointment_ortho' && input?.action === 'book_child') {
      const guid = output.appointmentGuid || output.AppointmentGUID;
      if (guid) {
        records.push({
          type: 'appointment',
          guid,
          sourceTool: obs.name,
          sourceAction: 'book_child',
          observationId: obs.observation_id,
          claimedData: {
            appointmentDate: input.startTime || input.appointmentDate,
            childName: input.childName,
          },
        });
      }
    }
  }

  return records;
}
```

### Verifying a Patient Record Against Cloud9
```typescript
// Source: Uses existing Cloud9Client.getPatientInformation()
async function verifyPatientRecord(
  client: Cloud9Client,
  claimed: ClaimedRecord
): Promise<RecordVerification> {
  try {
    const response = await client.getPatientInformation(claimed.guid);

    if (response.status !== 'Success' || response.records.length === 0) {
      return { claimed, status: 'fail', cloud9Record: null, mismatches: [], error: 'Patient not found in Cloud9' };
    }

    const record = response.records[0];
    const mismatches: FieldMismatch[] = [];

    if (claimed.claimedData.firstName && !nameMatch(claimed.claimedData.firstName, record.persFirstName)) {
      mismatches.push({ field: 'firstName', expected: claimed.claimedData.firstName, actual: record.persFirstName });
    }
    if (claimed.claimedData.lastName && !nameMatch(claimed.claimedData.lastName, record.persLastName)) {
      mismatches.push({ field: 'lastName', expected: claimed.claimedData.lastName, actual: record.persLastName });
    }

    return {
      claimed,
      status: mismatches.length === 0 ? 'pass' : 'partial',
      cloud9Record: record,
      mismatches,
    };
  } catch (err: any) {
    return { claimed, status: 'fail', cloud9Record: null, mismatches: [], error: err.message };
  }
}

function nameMatch(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b?.trim().toLowerCase();
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual trace review | Phase 1 auto-classification | Phase 1 | Intent + tool sequence automated |
| No record verification | Phase 2 auto-verification | This phase | Closes the loop between trace claims and reality |

## Open Questions

1. **Exact output format of create_patient and book_child observations**
   - What we know: Observations have `input` and `output` JSON fields
   - What's unclear: Exact field names in output (varies by Node-RED version)
   - Recommendation: Parse a few real observations to confirm field paths before implementing. Add defensive fallbacks.

2. **Should verification be triggered automatically or on-demand?**
   - What we know: Phase 1 analysis is on-demand (GET endpoint with caching)
   - Recommendation: Same pattern -- on-demand with caching. Add `?verify=true` query param to existing endpoint.

3. **How to handle the responsible party (parent) patient record**
   - What we know: VERIFY-02 requires "adult patient record exists"
   - What's unclear: Whether the parent GUID comes from `lookup` output or `create_patient` output
   - Recommendation: Extract from the lookup observation output, verify separately.

## Sources

### Primary (HIGH confidence)
- `backend/src/services/cloud9/client.ts` - Full Cloud9Client API with all needed methods
- `backend/src/services/cloud9/procedures.ts` - All Cloud9 procedures enumerated
- `backend/src/types/cloud9.ts` - TypeScript types for Cloud9 responses
- `backend/src/controllers/traceAnalysisController.ts` - Phase 1 endpoint pattern
- `backend/src/services/toolSequenceMapper.ts` - Observation parsing pattern
- `backend/src/services/callerIntentClassifier.ts` - BookingDetails type with childNames

### Secondary (MEDIUM confidence)
- `backend/src/config/cloud9.ts` - Environment configuration (production vs sandbox)
- `test-agent/src/core/cloud9-client.ts` - Alternative client showing normalization patterns

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All infrastructure exists in codebase, no new libraries needed
- Architecture: HIGH - Follows established patterns from Phase 1
- Pitfalls: HIGH - Based on actual codebase patterns and CLAUDE.md warnings

**Research date:** 2026-02-02
**Valid until:** 2026-03-02 (stable domain, internal codebase)

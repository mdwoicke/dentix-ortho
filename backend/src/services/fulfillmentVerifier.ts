/**
 * Fulfillment Verifier Service
 *
 * Extracts claimed patient/appointment GUIDs from Langfuse observation outputs,
 * then queries Cloud9 production API to verify each record actually exists
 * and that claimed data (names, dates) matches actual records.
 *
 * SMOKE TEST (2026-02-02): Verified end-to-end with session 00b7d788.
 * Pipeline works: returns no_claims for sessions without tool observations (correct).
 * Sessions with actual booking tool calls (create_patient, book_child) will produce
 * claims and trigger Cloud9 verification. Full booking session testing requires
 * a session that completed the booking flow (reached tool invocation stage).
 */

import { Cloud9Client } from './cloud9/client';
import type { CallerIntent } from './callerIntentClassifier';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ClaimedRecord {
  type: 'patient' | 'appointment';
  guid: string;
  /** The patient GUID this record belongs to (for appointments, the patient it was booked for) */
  patientGuid?: string;
  claimedName?: string;
  claimedDate?: string;
  /** Child name extracted from tool input/output — used for grouping */
  childName?: string;
  source: string; // observation ID or description of where we found this
}

export interface FieldMismatch {
  field: string;
  claimed: string;
  actual: string;
}

export interface RecordVerification {
  claimed: ClaimedRecord;
  exists: boolean;
  mismatches: FieldMismatch[];
  error?: string;
}

export interface ChildVerification {
  childName: string;
  patientRecordStatus: 'pass' | 'fail' | 'skipped';
  appointmentRecordStatus: 'pass' | 'fail' | 'skipped';
  patientVerification?: RecordVerification;
  appointmentVerification?: RecordVerification;
  details: RecordVerification[];
}

export type FulfillmentStatus = 'verified' | 'partial' | 'failed' | 'no_claims';

export interface FulfillmentVerdict {
  status: FulfillmentStatus;
  verifications: RecordVerification[];
  childVerifications: ChildVerification[];
  summary: string;
  verifiedAt: string;
}

// ============================================================================
// HELPERS
// ============================================================================

function parseJson(value: any): any {
  if (!value) return null;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function nameMatch(a: string | undefined | null, b: string | undefined | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Try to extract a GUID-like value from an object using multiple field name variations.
 */
function extractGuid(obj: any, ...keys: string[]): string | undefined {
  if (!obj || typeof obj !== 'object') return undefined;
  for (const key of keys) {
    const val = obj[key];
    if (typeof val === 'string' && val.length > 8) return val;
  }
  return undefined;
}

// ============================================================================
// CLAIM EXTRACTION
// ============================================================================

/**
 * Extract claimed patient and appointment records from Langfuse observations.
 * Parses observation input/output JSON defensively, looking for GUIDs in
 * create_patient, lookup, and book_child tool outputs.
 */
export function extractClaimedRecords(observations: any[], _intent: CallerIntent): ClaimedRecord[] {
  const claims: ClaimedRecord[] = [];

  for (const obs of observations) {
    const obsId = obs.observation_id || obs.id || 'unknown';
    const input = parseJson(obs.input);
    const output = parseJson(obs.output);

    if (!input && !output) continue;

    const action = input?.action;

    // --- Patient lookup: extract patient GUID from output ---
    if ((action === 'lookup' || action === 'clinic_info') && output) {
      const patients = output.patients || output.results || (Array.isArray(output) ? output : null);
      if (Array.isArray(patients)) {
        for (const p of patients) {
          const guid = extractGuid(p, 'patientGuid', 'PatientGUID', 'guid', 'GUID', 'patGUID', 'PatientId', 'patientId');
          if (guid) {
            claims.push({
              type: 'patient',
              guid,
              claimedName: p.name || p.PatientName || p.patientName || p.FullName || undefined,
              source: `lookup:${obsId}`,
            });
          }
        }
      }
    }

    // --- Create patient: extract newly created patient GUID ---
    if (action === 'create_patient' && output) {
      const guid = extractGuid(output, 'patientGuid', 'PatientGUID', 'guid', 'GUID', 'patGUID', 'patientId', 'PatientId');
      if (guid) {
        const name = input?.firstName && input?.lastName
          ? `${input.firstName} ${input.lastName}`
          : output.name || output.patientName || undefined;
        // Use childName from input if present, otherwise fall back to the constructed name
        const childName = input?.childName || name || undefined;
        claims.push({
          type: 'patient',
          guid,
          claimedName: name,
          childName,
          source: `create_patient:${obsId}`,
        });
      }
    }

    // --- Book child: extract appointment GUID(s) ---
    if (action === 'book_child' && output) {
      // New format: output.children[] array with per-child results + output.parent
      if (Array.isArray(output.children)) {
        // Extract parent claim if present
        if (output.parent) {
          const parentGuid = extractGuid(output.parent, 'patientGUID', 'patientGuid', 'PatientGUID', 'guid');
          if (parentGuid) {
            const parentName = output.parent.firstName && output.parent.lastName
              ? `${output.parent.firstName} ${output.parent.lastName}`
              : output.parent.name || undefined;
            claims.push({
              type: 'patient',
              guid: parentGuid,
              claimedName: parentName,
              source: `book_child_parent:${obsId}`,
            });
          }
        }

        // Extract per-child claims
        for (const child of output.children) {
          const childName = child.firstName || child.childName || child.name || undefined;

          // Patient claim from child
          const childPatGuid = extractGuid(child, 'patientGUID', 'patientGuid', 'PatientGUID', 'guid');
          if (childPatGuid) {
            claims.push({
              type: 'patient',
              guid: childPatGuid,
              claimedName: childName,
              childName,
              source: `book_child_patient:${obsId}`,
            });
          }

          // Appointment claim from child.appointment
          const appt = child.appointment || child;
          const apptGuid = extractGuid(appt, 'appointmentGUID', 'appointmentGuid', 'AppointmentGUID', 'apptGuid', 'guid');
          if (apptGuid) {
            claims.push({
              type: 'appointment',
              guid: apptGuid,
              patientGuid: childPatGuid,
              claimedName: childName,
              childName,
              claimedDate: appt.startTime || appt.date || undefined,
              source: `book_child_appt:${obsId}`,
            });
          } else if (child.status === 'queued' || child.queued) {
            // Child was queued but no appointment GUID yet — record as claim with empty guid for tracking
            // Don't push a claim since we have no GUID to verify
          }
        }
      } else {
        // Legacy flat format: single GUID at top level
        const apptGuid = extractGuid(output, 'appointmentGuid', 'AppointmentGUID', 'apptGuid', 'apptGUID', 'guid', 'GUID');
        if (apptGuid) {
          const patGuid = extractGuid(output, 'patientGuid', 'PatientGUID', 'patGUID')
            || extractGuid(input, 'patientGuid', 'PatientGUID', 'patGUID');

          const childName = input?.childName || output?.childName || undefined;
          claims.push({
            type: 'appointment',
            guid: apptGuid,
            patientGuid: patGuid,
            claimedName: childName,
            childName,
            claimedDate: input?.date || input?.startTime || output?.date || output?.startTime || undefined,
            source: `book_child:${obsId}`,
          });
        }
      }
    }
  }

  return claims;
}

// ============================================================================
// RECORD VERIFICATION
// ============================================================================

async function verifyPatientRecord(client: Cloud9Client, claimed: ClaimedRecord): Promise<RecordVerification> {
  try {
    const response = await client.getPatientInformation(claimed.guid);

    if (response.status !== 'Success' || response.records.length === 0) {
      return { claimed, exists: false, mismatches: [], error: response.errorMessage || 'Patient not found' };
    }

    const record = response.records[0];
    const mismatches: FieldMismatch[] = [];

    // Compare names if we have a claimed name
    if (claimed.claimedName) {
      const actualName = record.FullName || record.fullName
        || `${record.persFirstName || record.FirstName || ''} ${record.persLastName || record.LastName || ''}`.trim();

      if (actualName && !nameMatch(claimed.claimedName, actualName)) {
        // Also check partial match (first name only, last name only)
        const claimedParts = claimed.claimedName.trim().toLowerCase().split(/\s+/);
        const actualLower = actualName.toLowerCase();
        const partialMatch = claimedParts.some((part) => actualLower.includes(part));

        if (!partialMatch) {
          mismatches.push({ field: 'name', claimed: claimed.claimedName, actual: actualName });
        }
      }
    }

    return { claimed, exists: true, mismatches };
  } catch (err: any) {
    return { claimed, exists: false, mismatches: [], error: err.message };
  }
}

async function verifyAppointmentRecord(client: Cloud9Client, claimed: ClaimedRecord): Promise<RecordVerification> {
  if (!claimed.patientGuid) {
    return { claimed, exists: false, mismatches: [], error: 'No patient GUID to look up appointments' };
  }

  try {
    const response = await client.getPatientAppointments(claimed.patientGuid);

    if (response.status !== 'Success') {
      return { claimed, exists: false, mismatches: [], error: response.errorMessage || 'Appointment query failed' };
    }

    // Find matching appointment by GUID
    const match = response.records.find((r: any) => {
      const apptGuid = r.AppointmentGUID || r.appointmentGuid || r.apptGUID || r.GUID || '';
      return apptGuid.toLowerCase() === claimed.guid.toLowerCase();
    });

    if (!match) {
      return { claimed, exists: false, mismatches: [], error: 'Appointment GUID not found in patient appointments' };
    }

    const mismatches: FieldMismatch[] = [];

    // Compare date if claimed
    if (claimed.claimedDate) {
      const actualDate = match.AppointmentDate || match.appointmentDate || match.StartTime || match.startTime || '';
      if (actualDate && !actualDate.includes(claimed.claimedDate) && !claimed.claimedDate.includes(actualDate)) {
        mismatches.push({ field: 'date', claimed: claimed.claimedDate, actual: actualDate });
      }
    }

    return { claimed, exists: true, mismatches };
  } catch (err: any) {
    return { claimed, exists: false, mismatches: [], error: err.message };
  }
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

// ============================================================================
// MULTI-CHILD GROUPING HELPERS
// ============================================================================

function recordStatus(v: RecordVerification | undefined): 'pass' | 'fail' | 'skipped' {
  if (!v) return 'skipped';
  if (v.exists && v.mismatches.length === 0) return 'pass';
  return 'fail';
}

/**
 * Normalize a child name for grouping (lowercase, trimmed).
 * Records with no childName are grouped under null (responsible_party).
 */
function normalizeChildKey(name: string | undefined | null): string | null {
  if (!name) return null;
  return name.trim().toLowerCase();
}

/**
 * Build per-child verifications from grouped record verifications.
 */
function buildChildVerifications(
  claims: ClaimedRecord[],
  verifications: RecordVerification[],
  intent: CallerIntent,
): { childVerifications: ChildVerification[]; parentVerifications: RecordVerification[] } {
  // Group claims by normalized child name. null key = responsible_party (parent)
  const groups = new Map<string | null, ClaimedRecord[]>();
  for (const claim of claims) {
    const key = normalizeChildKey(claim.childName);
    const group = groups.get(key) || [];
    group.push(claim);
    groups.set(key, group);
  }

  // Extract parent (responsible_party) verifications — key is null
  const parentClaims = groups.get(null) || [];
  const parentVerifications = parentClaims
    .map((c) => verifications.find((v) => v.claimed === c))
    .filter((v): v is RecordVerification => !!v);
  groups.delete(null);

  // Build ChildVerification for each child group
  const childVerifications: ChildVerification[] = [];
  const processedKeys = new Set<string>();

  for (const [key, groupClaims] of groups) {
    if (key === null) continue;
    processedKeys.add(key);

    const groupVerifications = groupClaims
      .map((c) => verifications.find((v) => v.claimed === c))
      .filter((v): v is RecordVerification => !!v);

    const patientV = groupVerifications.find((v) => v.claimed.type === 'patient');
    const appointmentV = groupVerifications.find((v) => v.claimed.type === 'appointment');

    // Use the original casing from the first claim in the group
    const displayName = groupClaims[0].childName || key;

    childVerifications.push({
      childName: displayName,
      patientRecordStatus: recordStatus(patientV),
      appointmentRecordStatus: recordStatus(appointmentV),
      patientVerification: patientV,
      appointmentVerification: appointmentV,
      details: groupVerifications,
    });
  }

  // Cross-reference with intent's childNames — add 'fail' for missing children
  const intentChildNames = intent.bookingDetails?.childNames || [];
  for (const intentChild of intentChildNames) {
    const normalizedIntentChild = normalizeChildKey(intentChild);
    if (normalizedIntentChild && !processedKeys.has(normalizedIntentChild)) {
      childVerifications.push({
        childName: intentChild,
        patientRecordStatus: 'fail',
        appointmentRecordStatus: 'fail',
        details: [],
      });
    }
  }

  return { childVerifications, parentVerifications };
}

/**
 * Build a human-readable summary string.
 */
function buildSummary(
  childVerifications: ChildVerification[],
  parentVerifications: RecordVerification[],
  isBookingIntent: boolean,
): string {
  if (!isBookingIntent) {
    return 'No booking records to verify';
  }

  const parts: string[] = [];

  // Parent status
  if (parentVerifications.length > 0) {
    const parentOk = parentVerifications.every((v) => v.exists && v.mismatches.length === 0);
    parts.push(`Parent record: ${parentOk ? 'verified' : 'not found'}`);
  }

  // Child summary
  if (childVerifications.length === 0) {
    parts.push('No child records found');
  } else if (childVerifications.length === 1) {
    const cv = childVerifications[0];
    parts.push(`Verified: patient record ${cv.patientRecordStatus}, appointment ${cv.appointmentRecordStatus}`);
  } else {
    const fullyVerified = childVerifications.filter(
      (cv) => cv.patientRecordStatus === 'pass' && cv.appointmentRecordStatus === 'pass'
    ).length;
    const total = childVerifications.length;
    const childDetails = childVerifications
      .map((cv) => {
        const ok = cv.patientRecordStatus === 'pass' && cv.appointmentRecordStatus === 'pass';
        if (ok) return `${cv.childName}: pass`;
        const failures: string[] = [];
        if (cv.patientRecordStatus !== 'pass') failures.push('no patient record');
        if (cv.appointmentRecordStatus !== 'pass') failures.push('no appointment record');
        return `${cv.childName}: fail - ${failures.join(', ')}`;
      })
      .join(', ');
    parts.push(`Verified ${fullyVerified}/${total} children fully (${childDetails})`);
  }

  return parts.join('. ');
}

/**
 * Verify fulfillment for a session by extracting claimed records from observations
 * and checking them against Cloud9 production API.
 */
export async function verifyFulfillment(
  _sessionId: string,
  observations: any[],
  intent: CallerIntent,
): Promise<FulfillmentVerdict> {
  const claims = extractClaimedRecords(observations, intent);
  const isBookingIntent = intent.type === 'booking' || intent.type === 'rescheduling';

  if (claims.length === 0) {
    return {
      status: 'no_claims',
      verifications: [],
      childVerifications: [],
      summary: isBookingIntent
        ? 'Booking intent detected but no verifiable claims found in session observations'
        : 'No verifiable claims found in session observations',
      verifiedAt: new Date().toISOString(),
    };
  }

  const client = new Cloud9Client('production');
  const verifications: RecordVerification[] = [];

  // Verify each claim serially with delay to avoid rate limiting
  for (const claim of claims) {
    let verification: RecordVerification;

    if (claim.type === 'patient') {
      verification = await verifyPatientRecord(client, claim);
    } else {
      verification = await verifyAppointmentRecord(client, claim);
    }

    verifications.push(verification);
    await sleep(200);
  }

  // Build per-child verifications with multi-child grouping
  const { childVerifications, parentVerifications } = buildChildVerifications(claims, verifications, intent);

  // Compute overall status with multi-child awareness
  let status: FulfillmentStatus;

  if (!isBookingIntent && claims.length === 0) {
    status = 'no_claims';
  } else if (childVerifications.length === 0 && parentVerifications.length === 0) {
    // Only parent lookups, no child booking records
    const allParentOk = parentVerifications.every((v) => v.exists && v.mismatches.length === 0);
    status = allParentOk ? 'verified' : 'failed';
  } else if (childVerifications.length > 0) {
    const allChildrenPass = childVerifications.every(
      (cv) => cv.patientRecordStatus === 'pass' && cv.appointmentRecordStatus === 'pass'
    );
    const anyChildPass = childVerifications.some(
      (cv) => cv.patientRecordStatus === 'pass' || cv.appointmentRecordStatus === 'pass'
    );

    if (allChildrenPass) {
      status = 'verified';
    } else if (anyChildPass) {
      status = 'partial';
    } else {
      status = 'failed';
    }
  } else {
    // Fallback: use record-level check
    const verified = verifications.filter((v) => v.exists && v.mismatches.length === 0).length;
    status = verified > 0 ? (verified === verifications.length ? 'verified' : 'partial') : 'failed';
  }

  const summary = buildSummary(childVerifications, parentVerifications, isBookingIntent);

  return {
    status,
    verifications,
    childVerifications,
    summary,
    verifiedAt: new Date().toISOString(),
  };
}

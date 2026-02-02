/**
 * Fulfillment Verifier Service
 *
 * Extracts claimed patient/appointment GUIDs from Langfuse observation outputs,
 * then queries Cloud9 production API to verify each record actually exists
 * and that claimed data (names, dates) matches actual records.
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
  patientVerification?: RecordVerification;
  appointmentVerification?: RecordVerification;
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
export function extractClaimedRecords(observations: any[], intent: CallerIntent): ClaimedRecord[] {
  const claims: ClaimedRecord[] = [];

  for (const obs of observations) {
    const obsId = obs.observation_id || obs.id || 'unknown';
    const input = parseJson(obs.input);
    const output = parseJson(obs.output);

    if (!input && !output) continue;

    const action = input?.action;

    // --- Patient lookup: extract patient GUID from output ---
    if (action === 'lookup' && output) {
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
        claims.push({
          type: 'patient',
          guid,
          claimedName: input?.firstName && input?.lastName
            ? `${input.firstName} ${input.lastName}`
            : output.name || output.patientName || undefined,
          source: `create_patient:${obsId}`,
        });
      }
    }

    // --- Book child: extract appointment GUID ---
    if (action === 'book_child' && output) {
      const apptGuid = extractGuid(output, 'appointmentGuid', 'AppointmentGUID', 'apptGuid', 'apptGUID', 'guid', 'GUID');
      if (apptGuid) {
        const patGuid = extractGuid(output, 'patientGuid', 'PatientGUID', 'patGUID')
          || extractGuid(input, 'patientGuid', 'PatientGUID', 'patGUID');

        claims.push({
          type: 'appointment',
          guid: apptGuid,
          patientGuid: patGuid,
          claimedName: input?.childName || output?.childName || undefined,
          claimedDate: input?.date || input?.startTime || output?.date || output?.startTime || undefined,
          source: `book_child:${obsId}`,
        });
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

/**
 * Verify fulfillment for a session by extracting claimed records from observations
 * and checking them against Cloud9 production API.
 */
export async function verifyFulfillment(
  sessionId: string,
  observations: any[],
  intent: CallerIntent,
): Promise<FulfillmentVerdict> {
  const claims = extractClaimedRecords(observations, intent);

  if (claims.length === 0) {
    return {
      status: 'no_claims',
      verifications: [],
      childVerifications: [],
      summary: 'No verifiable claims found in session observations',
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

  // Build child verifications by grouping patient + appointment per child
  const childVerifications: ChildVerification[] = [];
  const apptClaims = claims.filter((c) => c.type === 'appointment');

  for (const apptClaim of apptClaims) {
    const childName = apptClaim.claimedName || 'Unknown';
    const apptVerification = verifications.find((v) => v.claimed === apptClaim);

    // Find associated patient verification
    let patientVerification: RecordVerification | undefined;
    if (apptClaim.patientGuid) {
      patientVerification = verifications.find(
        (v) => v.claimed.type === 'patient' && v.claimed.guid === apptClaim.patientGuid
      );
    }

    childVerifications.push({
      childName,
      patientVerification,
      appointmentVerification: apptVerification,
    });
  }

  // Compute overall status
  const totalChecks = verifications.length;
  const verified = verifications.filter((v) => v.exists && v.mismatches.length === 0).length;
  const existsWithMismatch = verifications.filter((v) => v.exists && v.mismatches.length > 0).length;

  let status: FulfillmentStatus;
  if (verified === totalChecks) {
    status = 'verified';
  } else if (verified > 0 || existsWithMismatch > 0) {
    status = 'partial';
  } else {
    status = 'failed';
  }

  const summary = `${verified}/${totalChecks} records verified` +
    (existsWithMismatch > 0 ? `, ${existsWithMismatch} with mismatches` : '') +
    (totalChecks - verified - existsWithMismatch > 0
      ? `, ${totalChecks - verified - existsWithMismatch} not found`
      : '');

  return {
    status,
    verifications,
    childVerifications,
    summary,
    verifiedAt: new Date().toISOString(),
  };
}

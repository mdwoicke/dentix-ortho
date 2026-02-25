/**
 * Trace Analysis Controller
 *
 * Provides session-level analysis combining transcript extraction,
 * caller intent classification, and tool sequence mapping.
 */

import { Request, Response } from 'express';
import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import { LangfuseTraceService } from '../services/langfuseTraceService';
import { classifyCallerIntent, CallerIntent, ConversationTurn, enhanceIntentWithObservations } from '../services/callerIntentClassifier';
import { mapToolSequence, ToolSequenceResult } from '../services/toolSequenceMapper';
import { getAllKnownToolNames, getToolNamesForConfig } from '../services/toolNameResolver';
import {
  transformToConversationTurns,
  filterInternalTraces,
} from './testMonitorController';
import { verifyFulfillment, FulfillmentVerdict } from '../services/fulfillmentVerifier';
import { createCloud9Client } from '../services/cloud9/client';
import { getCloud9ConfigForTenant } from '../middleware/tenantContext';
import { ProdTestRecordService } from '../services/prodTestRecordService';

// Path to test-agent database
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

function getDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(TEST_AGENT_DB_PATH);
  // Ensure session_analysis table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS session_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      caller_intent_type TEXT,
      caller_intent_confidence REAL,
      caller_intent_summary TEXT,
      booking_details_json TEXT,
      tool_sequence_json TEXT,
      completion_rate REAL,
      analyzed_at TEXT NOT NULL DEFAULT (datetime('now')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(session_id)
    );
    CREATE INDEX IF NOT EXISTS idx_session_analysis_session ON session_analysis(session_id);
    CREATE INDEX IF NOT EXISTS idx_session_analysis_intent ON session_analysis(caller_intent_type);
  `);
  // Add verification columns if missing (ALTER TABLE is idempotent with try/catch)
  const verificationColumns = [
    'verification_status TEXT',
    'verification_json TEXT',
    'verified_at TEXT',
  ];
  for (const col of verificationColumns) {
    try {
      db.exec(`ALTER TABLE session_analysis ADD COLUMN ${col}`);
    } catch {
      // Column already exists - ignore
    }
  }

  // Ensure booking_corrections table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS booking_corrections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      action TEXT NOT NULL,
      child_name TEXT,
      patient_guid TEXT,
      appointment_guid_before TEXT,
      appointment_guid_after TEXT,
      slot_before TEXT,
      slot_after TEXT,
      status TEXT NOT NULL,
      error TEXT,
      performed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_booking_corrections_session ON booking_corrections(session_id);
  `);

  return db;
}

// Cache TTL: 1 hour in milliseconds
const CACHE_TTL_MS = 60 * 60 * 1000;

/**
 * Auto-detect configId from the session's stored langfuse_config_id when not specified in query.
 * Falls back to 1 (Ortho production) if session not found.
 */
function resolveConfigId(db: BetterSqlite3.Database, req: Request, sessionId: string): number {
  const raw = req.query.configId ? parseInt(req.query.configId as string) : undefined;
  if (raw) return raw;
  const row = db.prepare('SELECT langfuse_config_id FROM production_sessions WHERE session_id = ?').get(sessionId) as any;
  return row?.langfuse_config_id || 1;
}

interface CallReportToolCall {
  name: string;
  action: string;
  timestamp: string;
  durationMs: number | null;
  inputSummary: string;
  outputSummary: string;
  status: 'success' | 'error' | 'partial';
  fullInput?: Record<string, any>;
  fullOutput?: Record<string, any>;
  statusMessage?: string;
  errorAnalysis?: string;
}

function analyzeToolError(_name: string, action: string, _input: any, output: any, statusMessage: string | null): string {
  if (statusMessage?.includes('phoneNumber is required')) {
    return 'The patient lookup action requires a phone number, but none was provided. This typically happens early in the call before the caller shares their phone number.';
  }
  if (statusMessage?.includes('not found') || output?.error?.includes?.('not found')) {
    return `No matching record found for the ${action} request. The search criteria may not match any existing records.`;
  }
  if (output?.success === false && output?.error) {
    return `Tool returned an error: ${output.error}`;
  }
  if (!output || Object.keys(output).length === 0) {
    return 'The tool returned an empty response, which may indicate a timeout or connectivity issue with the upstream API.';
  }
  return statusMessage || 'Tool call encountered an error. Review the input/output for details.';
}

interface CallReportBookingResult {
  childName: string | null;
  patientGUID: string | null;
  appointmentGUID: string | null;
  booked: boolean;
  queued: boolean;
  error: string | null;
  slot: string | null;
  scheduleViewGUID?: string;
  scheduleColumnGUID?: string;
  appointmentTypeGUID?: string;
}

interface CallReport {
  callerName: string | null;
  callerPhone: string | null;
  callerDOB: string | null;
  callerEmail: string | null;
  parentPatientGUID: string | null;
  children: Array<{ name: string; dob: string | null }>;
  location: string | null;
  insurance: string | null;
  toolCalls: CallReportToolCall[];
  bookingResults: CallReportBookingResult[];
  bookingElapsedMs: number | null;
  bookingOverall: 'success' | 'partial' | 'failed' | 'none';
  discrepancies: Array<{ aspect: string; said: string; actual: string }>;
  issues: string[];
}

// ============================================================================
// INTENT VS DELIVERY COMPARISON TYPES
// ============================================================================

interface ChildComparison {
  childName: string;
  requested: {
    name: string;
    date: string | null;
  };
  delivered: {
    appointmentBooked: boolean;
    appointmentGUID: string | null;
    actualSlot: string | null;
    error: string | null;
  };
  status: 'match' | 'date_mismatch' | 'failed' | 'queued' | 'not_attempted';
  discrepancy: string | null;
}

interface TransferComparison {
  requested: boolean;
  delivered: boolean;
  status: 'match' | 'mismatch';
}

interface IntentDeliveryComparison {
  children: ChildComparison[];
  transfer: TransferComparison | null;
  overallStatus: 'match' | 'partial' | 'mismatch' | 'pending';
}

/**
 * Fuzzy name matching: checks if two names refer to the same person
 * Handles case insensitivity and partial matches
 */
function fuzzyNameMatch(name1: string | null, name2: string | null): boolean {
  if (!name1 || !name2) return false;
  const n1 = name1.toLowerCase().trim();
  const n2 = name2.toLowerCase().trim();
  // Exact match
  if (n1 === n2) return true;
  // One contains the other (handles "Johnny" vs "Johnny Smith")
  if (n1.includes(n2) || n2.includes(n1)) return true;
  // First name match (split by space and compare first parts)
  const parts1 = n1.split(/\s+/);
  const parts2 = n2.split(/\s+/);
  if (parts1[0] === parts2[0]) return true;
  return false;
}

/**
 * Build a comparison between caller intent and system delivery
 */
function buildIntentDeliveryComparison(
  intent: CallerIntent | null,
  callReport: CallReport,
  hasTransfer: boolean
): IntentDeliveryComparison {
  const comparison: IntentDeliveryComparison = {
    children: [],
    transfer: null,
    overallStatus: 'match',
  };

  // Handle booking intent comparison
  if (intent?.bookingDetails?.childNames && intent.bookingDetails.childNames.length > 0) {
    const requestedChildren = intent.bookingDetails.childNames;
    const requestedDates = intent.bookingDetails.requestedDates || [];

    for (const requestedName of requestedChildren) {
      // Find matching booking result (fuzzy match on name)
      const matchingResult = callReport.bookingResults.find(br =>
        fuzzyNameMatch(br.childName, requestedName)
      );

      // Get the first requested date for this child (if any)
      const requestedDate = requestedDates.length > 0 ? requestedDates[0] : null;

      if (!matchingResult) {
        // Child mentioned but no booking attempt found
        comparison.children.push({
          childName: requestedName,
          requested: { name: requestedName, date: requestedDate },
          delivered: {
            appointmentBooked: false,
            appointmentGUID: null,
            actualSlot: null,
            error: 'No booking attempt found for this child',
          },
          status: 'not_attempted',
          discrepancy: `Caller mentioned ${requestedName} but no booking was attempted`,
        });
      } else {
        // Found a matching booking result
        const isBooked = matchingResult.booked;
        const isQueued = matchingResult.queued && !matchingResult.booked;
        const actualSlot = matchingResult.slot;

        let status: ChildComparison['status'] = 'match';
        let discrepancy: string | null = null;

        if (!isBooked && !isQueued) {
          status = 'failed';
          discrepancy = matchingResult.error || 'Booking failed';
        } else if (isQueued) {
          status = 'queued';
          discrepancy = 'Booking was queued for async processing';
        } else if (isBooked && requestedDate && actualSlot) {
          // Check if the booked date matches the requested date
          const requestedDateLower = requestedDate.toLowerCase();
          const actualSlotLower = actualSlot.toLowerCase();

          // Simple date comparison - extract date portion
          const requestedDateParts = requestedDateLower.match(/(\d{1,2})[\/\-](\d{1,2})|(\w+)\s+(\d{1,2})/);
          const actualDateParts = actualSlotLower.match(/(\d{1,2})[\/\-](\d{1,2})|(\w+)\s+(\d{1,2})/);

          if (requestedDateParts && actualDateParts) {
            const reqMatch = requestedDateParts[0];
            const actMatch = actualDateParts[0];
            if (reqMatch !== actMatch && !actualSlotLower.includes(requestedDateLower)) {
              status = 'date_mismatch';
              discrepancy = `Requested: ${requestedDate}, Got: ${actualSlot}`;
            }
          }
        }

        comparison.children.push({
          childName: requestedName,
          requested: { name: requestedName, date: requestedDate },
          delivered: {
            appointmentBooked: isBooked,
            appointmentGUID: matchingResult.appointmentGUID,
            actualSlot: actualSlot,
            error: matchingResult.error,
          },
          status,
          discrepancy,
        });
      }
    }

    // Also check for children in bookingResults that weren't in the intent
    for (const br of callReport.bookingResults) {
      const alreadyCompared = comparison.children.some(c =>
        fuzzyNameMatch(c.childName, br.childName)
      );
      if (!alreadyCompared && br.childName) {
        comparison.children.push({
          childName: br.childName,
          requested: { name: br.childName, date: null },
          delivered: {
            appointmentBooked: br.booked,
            appointmentGUID: br.appointmentGUID,
            actualSlot: br.slot,
            error: br.error,
          },
          status: br.booked ? 'match' : br.queued ? 'queued' : 'failed',
          discrepancy: null,
        });
      }
    }
  } else if (callReport.bookingResults.length > 0) {
    // No intent booking details but we have booking results — only include entries where booking was attempted
    const attemptedOrBooked = callReport.bookingResults.filter(br =>
      br.booked || br.queued || (br.error && br.error !== 'No booking attempted - available for manual booking')
    );
    for (const br of attemptedOrBooked) {
      comparison.children.push({
        childName: br.childName || 'Unknown',
        requested: { name: br.childName || 'Unknown', date: null },
        delivered: {
          appointmentBooked: br.booked,
          appointmentGUID: br.appointmentGUID,
          actualSlot: br.slot,
          error: br.error,
        },
        status: br.booked ? 'match' : br.queued ? 'queued' : 'failed',
        discrepancy: null,
      });
    }
  }

  // Handle transfer comparison
  // Note: 'info_lookup' intent type may indicate the caller wanted information rather than booking,
  // which often results in transfer to a human agent
  const transferExpected = intent?.type === 'info_lookup';
  if (transferExpected || hasTransfer) {
    comparison.transfer = {
      requested: transferExpected,
      delivered: hasTransfer,
      status: transferExpected === hasTransfer ? 'match' : 'mismatch',
    };
  }

  // Calculate overall status
  if (comparison.children.length === 0 && !comparison.transfer) {
    comparison.overallStatus = 'match'; // Nothing to compare
  } else {
    const hasFailures = comparison.children.some(c => c.status === 'failed' || c.status === 'not_attempted');
    const hasMismatches = comparison.children.some(c => c.status === 'date_mismatch');
    const hasQueued = comparison.children.some(c => c.status === 'queued');
    const transferMismatch = comparison.transfer?.status === 'mismatch';

    if (hasFailures || transferMismatch) {
      comparison.overallStatus = 'mismatch';
    } else if (hasMismatches) {
      comparison.overallStatus = 'partial';
    } else if (hasQueued) {
      comparison.overallStatus = 'pending';
    } else {
      comparison.overallStatus = 'match';
    }
  }

  return comparison;
}

interface CurrentBookingData {
  parent: {
    patientGUID: string;
    name: string;
    dob: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  children: Array<{
    patientGUID: string;
    name: string;
    dob: string | null;
    appointments: Array<{
      appointmentGUID: string;
      dateTime: string;
      type: string | null;
      status: string | null;
      location: string | null;
    }>;
  }>;
  queriedAt: string;
  errors: string[];
}

function buildCallReport(_traces: any[], observations: any[], transcript: any[], sessionId?: string): CallReport {
  const report: CallReport = {
    callerName: null, callerPhone: null, callerDOB: null, callerEmail: null,
    parentPatientGUID: null,
    children: [], location: null, insurance: null,
    toolCalls: [], bookingResults: [],
    bookingElapsedMs: null, bookingOverall: 'none',
    discrepancies: [], issues: [],
  };

  // Extract caller info from transcript (assistant messages)
  for (const turn of transcript) {
    if (turn.role !== 'assistant') continue;
    const c = turn.content;
    if (!report.callerName) {
      const m = c.match(/Thanks,\s+([A-Z][a-z]+)/);
      if (m) report.callerName = m[1];
    }
    if (!report.callerPhone) {
      const m = c.match(/calling from\s+([\d\s,]+)/);
      if (m) report.callerPhone = m[1].replace(/[\s,]/g, '');
    }
  }

  // Extract tool calls from observations
  const knownTools = getAllKnownToolNames();
  const filtered = observations.filter(o => knownTools.includes(o.name));

  for (const obs of filtered) {
    const input = (() => { try { return typeof obs.input === 'string' ? JSON.parse(obs.input) : obs.input || {}; } catch { return {}; } })();
    const output = (() => { try { return typeof obs.output === 'string' ? JSON.parse(obs.output) : obs.output || {}; } catch { return {}; } })();
    const action = input?.action || 'unknown';

    let status: 'success' | 'error' | 'partial' = 'success';
    if (output?.partialSuccess) status = 'partial';
    else if (output?.success === false || obs.level === 'ERROR') status = 'error';

    const startTime = obs.started_at || obs.start_time || '';
    const endTime = obs.ended_at || obs.end_time || '';
    const durationMs = startTime && endTime ? new Date(endTime).getTime() - new Date(startTime).getTime() : null;

    let inputSummary = '';
    if (action === 'clinic_info' || action === 'lookup') {
      inputSummary = `action: ${action}`;
    } else if (action === 'grouped_slots') {
      inputSummary = `startDate: ${input.startDate || '?'}, endDate: ${input.endDate || '?'}, patients: ${input.numberOfPatients || '?'}`;
    } else if (action === 'book_child') {
      const children = Array.isArray(input.children) ? input.children : [];
      const childNames = children.map((c: any) => c.firstName).join(', ') || 'unknown';
      inputSummary = `parent: ${input.parentFirstName || '?'} ${input.parentLastName || ''}, children: [${childNames}]`;
    } else {
      inputSummary = `action: ${action}`;
    }

    let outputSummary = '';
    if (action === 'clinic_info') {
      outputSummary = output.locationName || output.name || 'location info returned';
    } else if (action === 'grouped_slots') {
      const totalSlots = output.totalSlotsFound || output.slots?.length || '?';
      const cacheStatus = output.cacheStatus || '';
      outputSummary = `${totalSlots} slots found${cacheStatus ? `, cache: ${cacheStatus}` : ''}`;
    } else if (action === 'book_child') {
      if (output.children && Array.isArray(output.children)) {
        const results = output.children.map((c: any) => {
          const apptId = c.appointment?.appointmentGUID || c.appointment?.appointmentId || c.appointmentId;
          if (apptId) return `${c.firstName}: booked (${String(apptId).substring(0,8)}...)`;
          if (c.queued || c.status === 'queued') return `${c.firstName}: queued`;
          return `${c.firstName}: ${c.status || 'unknown'}`;
        }).join(', ');
        outputSummary = `${output.partialSuccess ? 'PARTIAL' : output.success ? 'SUCCESS' : 'FAILED'}: ${results}`;
      } else {
        // NexHealth K8 raw pass-through: top-level id + patient_id + start_time
        const apptRef = output.appointmentGuid || output.appointmentId || (output.id && output.patient_id ? output.id : null);
        outputSummary = apptRef ? `booked: ${String(apptRef).substring(0,8)}...` : 'no GUID returned';
      }
    } else {
      outputSummary = JSON.stringify(output).substring(0, 100);
    }

    const toolCall: CallReportToolCall = { name: obs.name, action, timestamp: startTime, durationMs, inputSummary, outputSummary, status };
    toolCall.fullInput = input;
    toolCall.fullOutput = output;
    if (status === 'error' || status === 'partial') {
      toolCall.statusMessage = obs.status_message || undefined;
      toolCall.errorAnalysis = analyzeToolError(obs.name, action, input, output, obs.status_message || null);
    }
    report.toolCalls.push(toolCall);

    // Extract booking results from book_child output
    if (action === 'book_child' && output.children && Array.isArray(output.children)) {
      if (input.parentFirstName) {
        report.callerName = `${input.parentFirstName} ${input.parentLastName || ''}`.trim();
      }
      if (input.parentDOB) report.callerDOB = input.parentDOB;
      if (input.parentEmail) report.callerEmail = input.parentEmail;
      if (input.parentPhone) report.callerPhone = input.parentPhone;
      // Cloud9: parent.patientGUID (UUID), NexHealth: parent.patientId (integer)
      if (output.parent?.patientGUID) report.parentPatientGUID = output.parent.patientGUID;
      else if (output.parent?.patientId) report.parentPatientGUID = String(output.parent.patientId);

      for (const child of output.children) {
        const inputChildren = Array.isArray(input.children) ? input.children : [];
        const childInput = inputChildren.find((c: any) => c.firstName === child.firstName);
        report.children.push({ name: `${child.firstName || ''} ${child.lastName || childInput?.lastName || ''}`.trim(), dob: childInput?.dob || null });

        // Cloud9: patientGUID (UUID), NexHealth: patientId (integer)
        const patientId = child.patientGUID || child.patientId || null;
        // Cloud9: appointment.appointmentGUID (UUID), NexHealth: appointment.appointmentId or child.appointmentId (integer)
        const appointmentId = child.appointment?.appointmentGUID || child.appointment?.appointmentId || child.appointmentId || null;

        report.bookingResults.push({
          childName: child.firstName || null,
          patientGUID: patientId ? String(patientId) : null,
          appointmentGUID: appointmentId ? String(appointmentId) : null,
          booked: !!appointmentId,
          queued: child.queued === true || child.status === 'queued',
          error: child.error || child.appointment?.error || null,
          slot: child.appointment?.startTime || child.appointment?.start_time || childInput?.startTime || null,
          scheduleViewGUID: childInput?.scheduleViewGUID || child.appointment?.scheduleViewGUID || undefined,
          scheduleColumnGUID: childInput?.scheduleColumnGUID || child.appointment?.scheduleColumnGUID || undefined,
          appointmentTypeGUID: childInput?.appointmentTypeGUID || child.appointment?.appointmentTypeGUID || undefined,
        });
      }
      report.bookingElapsedMs = output.elapsedMs || durationMs;
    }

    // NexHealth K8 raw pass-through: scheduling tool returns top-level {id, patient_id, provider_id, start_time}
    // without wrapping in children[] array
    if (action === 'book_child' && !output.children && output.patient_id && output.start_time) {
      const apptId = output.id || output.appointmentId || null;
      const patId = output.patient_id || null;
      if (apptId && !report.bookingResults.some(br => br.appointmentGUID === String(apptId))) {
        report.bookingResults.push({
          childName: output.firstName || output.patient_name || null,
          patientGUID: patId ? String(patId) : null,
          appointmentGUID: String(apptId),
          booked: true,
          queued: false,
          error: null,
          slot: output.start_time || null,
        });
      }
      if (!report.bookingElapsedMs) report.bookingElapsedMs = durationMs;
    }

    // Extract location from clinic_info
    if (action === 'clinic_info' && output.locationName) {
      report.location = `${output.locationName}${output.address ? ', ' + output.address : ''}`;
    }

    // Extract patient GUIDs from lookup action (even if no booking was attempted)
    // This allows booking corrections when we have a GUID but booking failed/never happened
    if (action === 'lookup' && output.success) {
      // Cloud9 format: { success: true, parent: {...}, children: [...] }
      const parentGuid = output.parent?.patientGUID || output.parent?.patientId;
      if (parentGuid && !report.parentPatientGUID) {
        report.parentPatientGUID = String(parentGuid);
        if (output.parent.firstName) {
          report.callerName = `${output.parent.firstName} ${output.parent.lastName || ''}`.trim();
        }
        if (output.parent.dob) report.callerDOB = output.parent.dob;
        if (output.parent.email) report.callerEmail = output.parent.email;
        if (output.parent.phone) report.callerPhone = output.parent.phone;
      }

      const lookupChildren = output.children || output.patients || [];
      for (const child of lookupChildren) {
        const childGuid = child.patientGUID || child.patientId;
        if (!childGuid) continue;
        const childGuidStr = String(childGuid);
        const existingResult = report.bookingResults.find(br => br.patientGUID === childGuidStr);
        if (existingResult) continue;

        const childName = `${child.firstName || ''} ${child.lastName || ''}`.trim();
        report.children.push({ name: childName, dob: child.dob || null });
        report.bookingResults.push({
          childName: child.firstName || childName || null,
          patientGUID: childGuidStr,
          appointmentGUID: null,
          booked: false,
          queued: false,
          error: 'No booking attempted - available for manual booking',
          slot: null,
        });
      }

      if (output.family?.children) {
        for (const child of output.family.children) {
          const famChildGuid = child.patientGUID || child.patientId;
          if (!famChildGuid) continue;
          const famChildGuidStr = String(famChildGuid);
          const existingResult = report.bookingResults.find(br => br.patientGUID === famChildGuidStr);
          if (existingResult) continue;

          const childName = `${child.firstName || ''} ${child.lastName || ''}`.trim();
          report.children.push({ name: childName, dob: child.dob || null });
          report.bookingResults.push({
            childName: child.firstName || childName || null,
            patientGUID: famChildGuidStr,
            appointmentGUID: null,
            booked: false,
            queued: false,
            error: 'No booking attempted - available for manual booking',
            slot: null,
          });
        }
      }
    }

    // NexHealth format: lookup returns flat array [{id, first_name, last_name, guarantor_id, date_of_birth, ...}, ...]
    // Only extract the guarantor (parent) ID — do NOT add all lookup patients as children.
    // The lookup returns every patient under a guarantor, but only the ones discussed in
    // the call should appear in the report. PAYLOAD extraction handles adding actual children.
    if (action === 'lookup' && Array.isArray(output) && output.length > 0) {
      const firstPatient = output[0];
      if (firstPatient.guarantor_id && !report.parentPatientGUID) {
        report.parentPatientGUID = String(firstPatient.guarantor_id);
      }
    }
  }

  // NEW: Extract booking results from LLM PAYLOAD outputs (for cases where book_child observation wasn't captured)
  // This handles sibling bookings where appointmentGUIDs appear in the PAYLOAD as Child1_appointmentGUID, Child2_appointmentGUID
  // IMPORTANT: Only search GENERATION observations that contain "PAYLOAD" to avoid matching system prompt examples
  // Check for no booked results (not just empty array) — lookup may have populated unbooked entries
  // GUARD: Only trust PAYLOAD appointment IDs if a booking tool call (book_child/book) actually exists.
  // Without this guard, LLM hallucinations of appointment IDs create false positive bookings.
  const hasBookingToolCall = filtered.some(o => {
    const inp = (() => { try { return typeof o.input === 'string' ? JSON.parse(o.input) : o.input || {}; } catch { return {}; } })();
    return inp.action === 'book_child' || inp.action === 'book';
  });
  if (!report.bookingResults.some(br => br.booked) && hasBookingToolCall) {
    const payloadObs = observations.filter(o => o.type === 'GENERATION');
    for (const obs of payloadObs) {
      const output = typeof obs.output === 'string' ? obs.output : JSON.stringify(obs.output || '');
      // Skip observations without PAYLOAD content (avoids matching example data in system prompts)
      if (!output.includes('PAYLOAD')) continue;

      // Look for Child_appointmentGUID patterns in PAYLOAD (Cloud9 UUID format)
      // Note: GENERATION outputs may have escaped quotes (\") so we handle both " and \"
      const child1GuidMatch = output.match(/Child1_appointmentGUID\\?["']?\s*[:=]\s*\\?["']?([0-9A-Fa-f-]{36})/);
      const child2GuidMatch = output.match(/Child2_appointmentGUID\\?["']?\s*[:=]\s*\\?["']?([0-9A-Fa-f-]{36})/);
      // NexHealth/Chord: Child_appointmentId (may be integer or alphanumeric like "APPT123456")
      const child1IdMatch = output.match(/Child1_appointmentId\\?["']?\s*[:=]\s*\\?["']?([A-Za-z0-9_-]+)/);
      const child2IdMatch = output.match(/Child2_appointmentId\\?["']?\s*[:=]\s*\\?["']?([A-Za-z0-9_-]+)/);
      const child1PatientMatch = output.match(/Child1_patientGUID\\?["']?\s*[:=]\s*\\?["']?([0-9A-Fa-f-]{36})/);
      const child2PatientMatch = output.match(/Child2_patientGUID\\?["']?\s*[:=]\s*\\?["']?([0-9A-Fa-f-]{36})/);
      // NexHealth/Chord: Child_patientId (integer)
      const child1PatientIdMatch = output.match(/Child1_patientId\\?["']?\s*[:=]\s*\\?["']?(\d+)/);
      const child2PatientIdMatch = output.match(/Child2_patientId\\?["']?\s*[:=]\s*\\?["']?(\d+)/);
      // Chord uses Child1_FirstName not Child1_Name
      const child1NameMatch = output.match(/Child1_(?:First)?Name\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/);
      const child2NameMatch = output.match(/Child2_(?:First)?Name\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/);
      const child1LastNameMatch = output.match(/Child1_LastName\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/);
      const child2LastNameMatch = output.match(/Child2_LastName\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/);
      const child1DobMatch = output.match(/Child1_DOB\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/);
      const child2DobMatch = output.match(/Child2_DOB\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/);
      // Ortho: Child1_startTime string, Chord: Child1_Appointment_Details { date, time }
      const child1SlotMatch = output.match(/Child1_startTime\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/);
      const child2SlotMatch = output.match(/Child2_startTime\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/);
      // Chord: extract date+time from Child1_Appointment_Details nested object
      const child1ApptDetailsMatch = output.match(/Child1_Appointment_Details\\?["']?\s*[:=]\s*\{([^}]+)\}/);
      const child2ApptDetailsMatch = output.match(/Child2_Appointment_Details\\?["']?\s*[:=]\s*\{([^}]+)\}/);
      // Chord: Parent_patientId and Caller_Name in PAYLOAD
      const parentPatientIdMatch = output.match(/Parent_patientId\\?["']?\s*[:=]\s*\\?["']?(\d+)/);
      const callerNameMatch = output.match(/Caller_Name\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/);

      // Helper: extract slot from Appointment_Details object { "date": "2026-03-17", "time": "2:30 PM" }
      const extractSlotFromDetails = (detailsMatch: RegExpMatchArray | null): string | null => {
        if (!detailsMatch) return null;
        const details = detailsMatch[1];
        const dateM = details.match(/date\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/);
        const timeM = details.match(/time\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/);
        if (dateM && timeM) return `${dateM[1].trim()} ${timeM[1].trim()}`;
        if (dateM) return dateM[1].trim();
        return null;
      };

      // Use Cloud9 GUID first, fallback to NexHealth/Chord ID
      const child1Appt = child1GuidMatch?.[1] || child1IdMatch?.[1] || null;
      const child2Appt = child2GuidMatch?.[1] || child2IdMatch?.[1] || null;
      const child1Patient = child1PatientMatch?.[1] || child1PatientIdMatch?.[1] || null;
      const child2Patient = child2PatientMatch?.[1] || child2PatientIdMatch?.[1] || null;
      // Slot: prefer startTime string, fallback to Appointment_Details object
      const child1Slot = child1SlotMatch?.[1]?.trim() || extractSlotFromDetails(child1ApptDetailsMatch);
      const child2Slot = child2SlotMatch?.[1]?.trim() || extractSlotFromDetails(child2ApptDetailsMatch);

      // Populate caller name and parent ID from PAYLOAD (PAYLOAD has full name, override partial transcript extraction)
      if (callerNameMatch) {
        report.callerName = callerNameMatch[1].trim();
      }
      if (parentPatientIdMatch && !report.parentPatientGUID) {
        report.parentPatientGUID = parentPatientIdMatch[1];
      }

      let foundBooking = false;

      if (child1Appt) {
        foundBooking = true;
        const childFirst = child1NameMatch ? child1NameMatch[1].trim() : 'Child 1';
        const childLast = child1LastNameMatch ? child1LastNameMatch[1].trim() : '';
        const fullName = childLast ? `${childFirst} ${childLast}` : childFirst;
        // Update existing lookup entry if patientGUID matches, otherwise add new
        const existingByPatient = child1Patient ? report.bookingResults.find(br => br.patientGUID === child1Patient) : null;
        if (existingByPatient) {
          existingByPatient.appointmentGUID = child1Appt;
          existingByPatient.slot = child1Slot;
          existingByPatient.booked = true;
          existingByPatient.error = null;
          if (childFirst !== 'Child 1') existingByPatient.childName = childFirst;
        } else {
          report.children.push({ name: fullName, dob: child1DobMatch ? child1DobMatch[1].trim() : null });
          report.bookingResults.push({
            childName: childFirst,
            patientGUID: child1Patient,
            appointmentGUID: child1Appt,
            slot: child1Slot,
            booked: true,
            queued: false,
            error: null,
          });
        }
      }

      if (child2Appt) {
        foundBooking = true;
        const childFirst = child2NameMatch ? child2NameMatch[1].trim() : 'Child 2';
        const childLast = child2LastNameMatch ? child2LastNameMatch[1].trim() : '';
        const fullName = childLast ? `${childFirst} ${childLast}` : childFirst;
        const existingByPatient = child2Patient ? report.bookingResults.find(br => br.patientGUID === child2Patient) : null;
        if (existingByPatient) {
          existingByPatient.appointmentGUID = child2Appt;
          existingByPatient.slot = child2Slot;
          existingByPatient.booked = true;
          existingByPatient.error = null;
          if (childFirst !== 'Child 2') existingByPatient.childName = childFirst;
        } else {
          report.children.push({ name: fullName, dob: child2DobMatch ? child2DobMatch[1].trim() : null });
          report.bookingResults.push({
            childName: childFirst,
            patientGUID: child2Patient,
            appointmentGUID: child2Appt,
            slot: child2Slot,
            booked: true,
            queued: false,
            error: null,
          });
        }
      }

      // If we found booking results from PAYLOAD, break out of the loop
      if (foundBooking) break;
    }
  }

  // FALLBACK: Check prod_test_records table for booking data when observations don't contain the GUIDs
  // This handles cases where the booking succeeded but the appointment GUIDs weren't logged to Langfuse
  if (report.bookingResults.length === 0 && sessionId) {
    try {
      const testDb = new BetterSqlite3(path.join(__dirname, '../../test-agent/data/test-results.db'));
      const bookingRecords = testDb.prepare(`
        SELECT patient_guid, appointment_guid, patient_first_name, patient_last_name,
               appointment_datetime, is_child, status
        FROM prod_test_records
        WHERE session_id = ? AND record_type = 'appointment' AND appointment_guid IS NOT NULL
      `).all(sessionId) as Array<{
        patient_guid: string;
        appointment_guid: string;
        patient_first_name: string;
        patient_last_name: string;
        appointment_datetime: string;
        is_child: number;
        status: string;
      }>;
      testDb.close();

      for (const rec of bookingRecords) {
        const childName = `${rec.patient_first_name || ''} ${rec.patient_last_name || ''}`.trim();
        report.bookingResults.push({
          childName: childName || 'Unknown',
          patientGUID: rec.patient_guid,
          appointmentGUID: rec.appointment_guid,
          slot: rec.appointment_datetime,
          booked: rec.status === 'active',
          queued: false,
          error: null,
        });
      }

      // Also populate children array if empty
      if (report.children.length === 0 && bookingRecords.length > 0) {
        for (const rec of bookingRecords) {
          if (rec.is_child) {
            report.children.push({
              name: `${rec.patient_first_name || ''} ${rec.patient_last_name || ''}`.trim(),
              dob: null,
            });
          }
        }
      }
    } catch (dbError) {
      // Silently fail - this is a fallback mechanism
      console.error('Failed to check prod_test_records for booking data:', dbError);
    }
  }

  // Determine overall booking status (only consider entries where booking was attempted, not lookup-only entries)
  const attemptedBookings = report.bookingResults.filter(r => r.booked || r.queued || (r.error && r.error !== 'No booking attempted - available for manual booking'));
  if (attemptedBookings.length > 0) {
    const allBooked = attemptedBookings.every(r => r.booked);
    const anyBooked = attemptedBookings.some(r => r.booked);
    report.bookingOverall = allBooked ? 'success' : anyBooked ? 'partial' : 'failed';
  } else if (report.bookingResults.length > 0) {
    // All entries are from lookup only — no booking was attempted
    report.bookingOverall = 'none';
  }

  // Build discrepancies by comparing transcript with tool results
  if (report.bookingResults.length > 0) {
    for (const br of report.bookingResults) {
      if (br.queued && !br.booked) {
        const lastTurn = transcript[transcript.length - 1];
        if (lastTurn?.content?.includes('being processed') || lastTurn?.content?.includes('confirmation shortly')) {
          report.discrepancies.push({
            aspect: `${br.childName} booking`,
            said: 'Appointment is being processed, confirmation shortly',
            actual: `Appointment was queued (not confirmed). Operation ID assigned for async retry.`,
          });
        }
      }
    }
  }

  // Build issues list
  if (report.bookingOverall === 'partial') {
    const queued = report.bookingResults.filter(r => r.queued && !r.booked);
    report.issues.push(`Partial booking: ${queued.map(r => r.childName).join(', ')} appointment(s) queued instead of confirmed`);
  }
  if (report.bookingOverall === 'failed') {
    report.issues.push('All booking attempts failed');
  }
  const partialTool = report.toolCalls.find(t => t.status === 'partial');
  if (partialTool) {
    report.issues.push(`Tool call ${partialTool.name}→${partialTool.action} returned partial success (${partialTool.durationMs || '?'}ms elapsed)`);
  }

  return report;
}

/**
 * Fetch current booking data from Cloud9 for patient GUIDs found in the call report.
 * For non-Cloud9 tenants (tenantId !== 1), populates from call report data only.
 */
async function fetchCurrentBookingData(callReport: CallReport, cloud9ConfigOverride?: import('../config/cloud9').Cloud9Config, tenantId?: number): Promise<CurrentBookingData> {
  const result: CurrentBookingData = {
    parent: null,
    children: [],
    queriedAt: new Date().toISOString(),
    errors: [],
  };

  // Non-Cloud9 tenants: populate from call report data (no live API)
  if (tenantId && tenantId !== 1) {
    if (callReport.parentPatientGUID) {
      result.parent = {
        patientGUID: callReport.parentPatientGUID,
        name: callReport.callerName || 'Unknown',
        dob: callReport.callerDOB,
        phone: callReport.callerPhone,
        email: callReport.callerEmail,
      };
    }
    for (const br of callReport.bookingResults) {
      if (br.patientGUID) {
        result.children.push({
          patientGUID: br.patientGUID,
          name: br.childName || 'Unknown',
          dob: null,
          appointments: br.appointmentGUID ? [{
            appointmentGUID: br.appointmentGUID,
            dateTime: br.slot || '',
            type: null,
            status: br.booked ? 'booked' : br.queued ? 'queued' : 'unknown',
            location: null,
          }] : [],
        });
      }
    }
    result.errors.push('Live NexHealth lookup not available — data from tool observations');
    return result;
  }

  try {
    const client = createCloud9Client('production', cloud9ConfigOverride);

    const childGuids = new Set<string>();
    for (const br of callReport.bookingResults) {
      if (br.patientGUID) childGuids.add(br.patientGUID);
    }

    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    const extractPatient = (rec: any) => ({
      name: (rec.PatientFullName || rec.FullName
        || `${rec.PatientFirstName || rec.persFirstName || ''} ${rec.PatientLastName || rec.persLastName || ''}`.trim()
        || 'Unknown').trim(),
      dob: rec.PatientBirthDate || rec.BirthDate || null,
      phone: rec.PatientPhone || rec.PhoneNumber || null,
      email: rec.PatientEmail || rec.Email || null,
    });
    const extractAppt = (appt: any) => ({
      appointmentGUID: appt.AppointmentGUID || appt.appointmentGuid || '',
      dateTime: appt.AppointmentDateTime || appt.AppointmentDate || appt.StartTime || '',
      type: appt.AppointmentTypeDescription || appt.AppointmentType || null,
      status: appt.AppointmentStatusDescription || appt.Status || appt.AppointmentConfirmation || null,
      location: appt.LocationName || null,
    });

    // Fetch parent info first
    if (callReport.parentPatientGUID) {
      try {
        const resp = await client.getPatientInformation(callReport.parentPatientGUID);
        if (resp.status === 'Success' && resp.records?.length > 0) {
          const p = extractPatient(resp.records[0]);
          result.parent = { patientGUID: callReport.parentPatientGUID, ...p };
        }
      } catch (err: any) {
        result.errors.push(`Parent lookup failed: ${err.message}`);
      }
    }

    // Fetch children sequentially with delays to avoid Cloud9 rate limits
    for (const guid of childGuids) {
      const br = callReport.bookingResults.find(b => b.patientGUID === guid);
      let childName = br?.childName || 'Unknown';
      let childDob: string | null = null;
      const appointments: CurrentBookingData['children'][0]['appointments'] = [];

      // Delay before each child to avoid rate limiting (Cloud9 needs ~15s between same-procedure calls)
      await delay(15000);

      // Run info first, then appointments with delay
      const infoResult = await Promise.resolve(client.getPatientInformation(guid)).then(
        v => ({ status: 'fulfilled' as const, value: v }),
        r => ({ status: 'rejected' as const, reason: r }),
      );

      await delay(10000);

      const apptResult = await Promise.resolve(client.getPatientAppointments(guid)).then(
        v => ({ status: 'fulfilled' as const, value: v }),
        r => ({ status: 'rejected' as const, reason: r }),
      );

      if (infoResult.status === 'fulfilled' && infoResult.value.status === 'Success' && infoResult.value.records?.length > 0) {
        const p = extractPatient(infoResult.value.records[0]);
        childName = p.name || childName;
        childDob = p.dob;
      } else if (infoResult.status === 'rejected') {
        result.errors.push(`Child info failed for ${guid.substring(0, 8)}: ${infoResult.reason?.message}`);
      }

      if (apptResult.status === 'fulfilled' && apptResult.value.status === 'Success' && apptResult.value.records) {
        for (const appt of apptResult.value.records) {
          appointments.push(extractAppt(appt));
        }
      } else if (apptResult.status === 'rejected') {
        result.errors.push(`Appointments failed for ${guid.substring(0, 8)}: ${apptResult.reason?.message}`);
      }

      result.children.push({ patientGUID: guid, name: childName, dob: childDob, appointments });
    }
  } catch (err: any) {
    result.errors.push(`Cloud9 client error: ${err.message}`);
  }

  return result;
}

/**
 * GET /api/trace-analysis/:sessionId
 *
 * Full session analysis: transcript, intent classification, tool sequence mapping.
 * Results are cached for 1 hour. Use ?force=true to bypass cache.
 */
export async function analyzeSession(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  const force = req.query.force === 'true';
  const verify = req.query.verify === 'true';

  let db: BetterSqlite3.Database | null = null;

  try {
    db = getDb();
    const configId = resolveConfigId(db, req, sessionId);

    // Resolve tenant ID from config for tenant-aware behavior
    const tenantRow = db.prepare('SELECT tenant_id FROM langfuse_configs WHERE id = ?').get(configId) as any;
    const tenantId: number = tenantRow?.tenant_id || 1;

    // Check cache (unless force refresh)
    if (!force) {
      const cached = db.prepare(
        'SELECT * FROM session_analysis WHERE session_id = ?'
      ).get(sessionId) as any;

      if (cached) {
        const analyzedAt = new Date(cached.analyzed_at).getTime();
        if (Date.now() - analyzedAt < CACHE_TTL_MS) {
          // Return cached result
          const service = new LangfuseTraceService(db);
          const sessionData = service.getSession(sessionId, configId);

          if (!sessionData) {
            res.status(404).json({ error: 'Session not found' });
            return;
          }

          const traces = sessionData.traces.map((t: any) => ({
            traceId: t.trace_id,
            timestamp: t.started_at,
            name: t.name,
          }));

          // Rebuild transcript from traces
          const transcript = buildTranscript(sessionData.traces, sessionData.observations);

          const callReport = buildCallReport(sessionData.traces, sessionData.observations, transcript, sessionId);

          // Include cached verification if available
          let verification: FulfillmentVerdict | null = null;
          if (verify && cached.verification_json) {
            verification = JSON.parse(cached.verification_json);
          } else if (verify) {
            // Run verification on demand even for cached analysis
            const allObs = filterInternalTraces(sessionData.observations);
            const cachedIntent = {
              type: cached.caller_intent_type as any,
              confidence: cached.caller_intent_confidence,
              summary: cached.caller_intent_summary,
              bookingDetails: cached.booking_details_json ? JSON.parse(cached.booking_details_json) : undefined,
            };
            try {
              verification = await verifyFulfillment(sessionId, allObs, cachedIntent, tenantId);
              // Cache verification result
              db.prepare(`UPDATE session_analysis SET verification_status = ?, verification_json = ?, verified_at = ? WHERE session_id = ?`)
                .run(verification.status, JSON.stringify(verification), verification.verifiedAt, sessionId);
            } catch (verifyErr: any) {
              console.error(`Verification failed for cached session ${sessionId}:`, verifyErr.message);
            }
          }

          // Fetch current booking data (Cloud9 for Ortho, observation-based for NexHealth)
          let currentBookingData: CurrentBookingData | null = null;
          if (callReport.bookingResults.length > 0 || callReport.parentPatientGUID) {
            try {
              currentBookingData = await fetchCurrentBookingData(callReport, req.tenantContext ? getCloud9ConfigForTenant(req.tenantContext, 'production') : undefined, tenantId);
            } catch (err: any) {
              console.error(`CurrentBookingData fetch failed for cached session ${sessionId}:`, err.message);
            }
          }

          // Build intent vs delivery comparison
          const cachedIntentForComparison: CallerIntent | null = cached.caller_intent_type ? {
            type: cached.caller_intent_type,
            confidence: cached.caller_intent_confidence,
            summary: cached.caller_intent_summary,
            bookingDetails: cached.booking_details_json ? JSON.parse(cached.booking_details_json) : undefined,
          } : null;
          const hasTransfer = sessionData.traces.some((t: any) => t.has_transfer === 1);
          const intentDeliveryComparison = buildIntentDeliveryComparison(cachedIntentForComparison, callReport, hasTransfer);

          res.json({
            sessionId,
            traces,
            transcript,
            callReport,
            currentBookingData,
            intent: {
              type: cached.caller_intent_type,
              confidence: cached.caller_intent_confidence,
              summary: cached.caller_intent_summary,
              bookingDetails: cached.booking_details_json ? JSON.parse(cached.booking_details_json) : undefined,
            },
            toolSequence: cached.tool_sequence_json ? JSON.parse(cached.tool_sequence_json) : null,
            intentDeliveryComparison,
            ...(verify && verification ? { verification } : {}),
            analyzedAt: cached.analyzed_at,
            cached: true,
          });
          return;
        }
      }
    }

    // Import session if needed
    const service = new LangfuseTraceService(db);
    let sessionData = service.getSession(sessionId, configId);
    let wasJustImported = false;

    // Reverse-lookup: sessionId may be an original Langfuse ID regrouped into a conv_ session
    if (!sessionData) {
      sessionData = service.getSessionByOriginalId(sessionId, configId);
    }

    if (!sessionData) {
      // Try importing from Langfuse
      try {
        sessionData = await service.importSessionTraces(sessionId, configId);
        wasJustImported = true;
      } catch (importErr: any) {
        res.status(404).json({ error: `Session not found in Langfuse: ${importErr.message}` });
        return;
      }
    }

    if (!sessionData || !sessionData.traces || sessionData.traces.length === 0) {
      res.status(404).json({ error: 'Session not found or has no traces' });
      return;
    }

    // Auto-sync session bookings to Prod Tracker when session is newly imported
    if (wasJustImported) {
      try {
        const prodTrackerService = new ProdTestRecordService(db);
        const syncResult = await prodTrackerService.syncSessionToProdTracker(sessionId);
        console.log(`[TraceAnalysis] Auto-synced session ${sessionId} to Prod Tracker: ${syncResult.patientsFound} patients, ${syncResult.appointmentsFound} appointments`);
      } catch (syncErr: any) {
        console.warn(`[TraceAnalysis] Failed to sync session ${sessionId} to Prod Tracker: ${syncErr.message}`);
        // Non-fatal - continue with analysis
      }
    }

    const traces = sessionData.traces.map((t: any) => ({
      traceId: t.trace_id,
      timestamp: t.started_at,
      name: t.name,
    }));

    // Build transcript from all traces
    const transcript = buildTranscript(sessionData.traces, sessionData.observations);

    const callReport = buildCallReport(sessionData.traces, sessionData.observations, transcript, sessionId);

    // Classify intent
    let intent: CallerIntent | null = null;
    try {
      intent = await classifyCallerIntent(transcript);
      // Enhance with child names from tool observations (more reliable than transcript extraction)
      if (intent) {
        const allObs = filterInternalTraces(sessionData.observations);
        intent = enhanceIntentWithObservations(intent, allObs);
      }
    } catch (err: any) {
      // LLM failure is non-fatal; return trace data without intent
      console.error(`Intent classification failed for session ${sessionId}:`, err.message);
    }

    // Map tool sequence with tenant-specific tool names
    let toolSequence: ToolSequenceResult | null = null;
    if (intent) {
      const allObservations = filterInternalTraces(sessionData.observations);
      const traceConfigId = sessionData.traces[0]?.langfuse_config_id;
      const toolNames = traceConfigId ? getToolNamesForConfig(db, traceConfigId) : undefined;
      toolSequence = mapToolSequence(intent, allObservations, toolNames);
    }

    // Run fulfillment verification if requested (tenant-aware)
    let verification: FulfillmentVerdict | null = null;
    if (verify && intent) {
      try {
        const allObs = filterInternalTraces(sessionData.observations);
        verification = await verifyFulfillment(sessionId, allObs, intent, tenantId);

        // For non-Cloud9 tenants: if verifier found no claims but callReport has successful bookings
        // (booking data from PAYLOAD, not tool observations), build verification from callReport
        if (tenantId && tenantId !== 1 && verification.status === 'no_claims' && callReport.bookingOverall === 'success') {
          const bookedResults = callReport.bookingResults.filter(br => br.booked);
          if (bookedResults.length > 0) {
            verification = {
              status: 'observation_verified' as any,
              verifications: bookedResults.map(br => ({
                claimed: {
                  type: 'appointment' as const,
                  guid: br.appointmentGUID || '',
                  patientGuid: br.patientGUID || undefined,
                  claimedName: br.childName || undefined,
                  claimedDate: br.slot || undefined,
                  childName: br.childName || undefined,
                  source: 'payload_extraction',
                },
                exists: true,
                mismatches: [],
              })),
              childVerifications: bookedResults.map(br => ({
                childName: br.childName || 'Unknown',
                patientRecordStatus: (br.patientGUID ? 'pass' : 'skipped') as 'pass' | 'fail' | 'skipped',
                appointmentRecordStatus: (br.appointmentGUID ? 'pass' : 'skipped') as 'pass' | 'fail' | 'skipped',
                details: [],
              })),
              summary: `Verified from PAYLOAD outputs (NexHealth — no live API check). ${bookedResults.length} booking(s) confirmed.`,
              verifiedAt: new Date().toISOString(),
            };
          }
        }
      } catch (verifyErr: any) {
        console.error(`Verification failed for session ${sessionId}:`, verifyErr.message);
      }
    }

    const analyzedAt = new Date().toISOString();

    // Cache results
    db.prepare(`
      INSERT OR REPLACE INTO session_analysis
        (session_id, caller_intent_type, caller_intent_confidence, caller_intent_summary,
         booking_details_json, tool_sequence_json, completion_rate, analyzed_at,
         verification_status, verification_json, verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      intent?.type ?? null,
      intent?.confidence ?? null,
      intent?.summary ?? null,
      intent?.bookingDetails ? JSON.stringify(intent.bookingDetails) : null,
      toolSequence ? JSON.stringify(toolSequence) : null,
      toolSequence?.completionRate ?? null,
      analyzedAt,
      verification?.status ?? null,
      verification ? JSON.stringify(verification) : null,
      verification?.verifiedAt ?? null,
    );

    // Fetch current booking data (Cloud9 for Ortho, observation-based for NexHealth)
    let currentBookingData: CurrentBookingData | null = null;
    if (callReport.bookingResults.length > 0 || callReport.parentPatientGUID) {
      try {
        currentBookingData = await fetchCurrentBookingData(callReport, req.tenantContext ? getCloud9ConfigForTenant(req.tenantContext, 'production') : undefined, tenantId);
      } catch (err: any) {
        console.error(`CurrentBookingData fetch failed for session ${sessionId}:`, err.message);
      }
    }

    // Build intent vs delivery comparison
    const hasTransfer = sessionData.traces.some((t: any) => t.has_transfer === 1);
    const intentDeliveryComparison = buildIntentDeliveryComparison(intent, callReport, hasTransfer);

    res.json({
      sessionId,
      traces,
      transcript,
      callReport,
      currentBookingData,
      intent,
      toolSequence,
      intentDeliveryComparison,
      ...(verify && verification ? { verification } : {}),
      analyzedAt,
      cached: false,
    });
  } catch (err: any) {
    console.error(`Error analyzing session ${sessionId}:`, err);
    res.status(500).json({ error: err.message });
  } finally {
    if (db) db.close();
  }
}

/**
 * GET /api/trace-analysis/:sessionId/intent
 *
 * Lightweight endpoint returning just the intent classification.
 */
export async function getIntent(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  const force = req.query.force === 'true';

  let db: BetterSqlite3.Database | null = null;

  try {
    db = getDb();
    const configId = resolveConfigId(db, req, sessionId);

    // Check cache
    if (!force) {
      const cached = db.prepare(
        'SELECT caller_intent_type, caller_intent_confidence, caller_intent_summary, booking_details_json, analyzed_at FROM session_analysis WHERE session_id = ?'
      ).get(sessionId) as any;

      if (cached) {
        const analyzedAt = new Date(cached.analyzed_at).getTime();
        if (Date.now() - analyzedAt < CACHE_TTL_MS) {
          res.json({
            sessionId,
            intent: {
              type: cached.caller_intent_type,
              confidence: cached.caller_intent_confidence,
              summary: cached.caller_intent_summary,
              bookingDetails: cached.booking_details_json ? JSON.parse(cached.booking_details_json) : undefined,
            },
            analyzedAt: cached.analyzed_at,
            cached: true,
          });
          return;
        }
      }
    }

    // Get session data
    const service = new LangfuseTraceService(db);
    let sessionData = service.getSession(sessionId, configId);
    let wasJustImported = false;

    // Reverse-lookup: sessionId may be an original Langfuse ID regrouped into a conv_ session
    if (!sessionData) {
      sessionData = service.getSessionByOriginalId(sessionId, configId);
    }

    if (!sessionData) {
      try {
        sessionData = await service.importSessionTraces(sessionId, configId);
        wasJustImported = true;
      } catch (importErr: any) {
        res.status(404).json({ error: `Session not found: ${importErr.message}` });
        return;
      }
    }

    if (!sessionData || !sessionData.traces || sessionData.traces.length === 0) {
      res.status(404).json({ error: 'Session not found or has no traces' });
      return;
    }

    // Auto-sync session bookings to Prod Tracker when session is newly imported
    if (wasJustImported) {
      try {
        const prodTrackerService = new ProdTestRecordService(db);
        await prodTrackerService.syncSessionToProdTracker(sessionId);
      } catch (syncErr: any) {
        console.warn(`[TraceAnalysis] Failed to sync session ${sessionId} to Prod Tracker: ${syncErr.message}`);
      }
    }

    const transcript = buildTranscript(sessionData.traces, sessionData.observations);

    let intent: CallerIntent | null = null;
    try {
      intent = await classifyCallerIntent(transcript);
      // Enhance with child names from tool observations (more reliable than transcript extraction)
      if (intent) {
        const allObs = filterInternalTraces(sessionData.observations);
        intent = enhanceIntentWithObservations(intent, allObs);
      }
    } catch (err: any) {
      res.status(500).json({ error: `Intent classification failed: ${err.message}` });
      return;
    }

    const analyzedAt = new Date().toISOString();

    // Update cache with intent data
    db.prepare(`
      INSERT OR REPLACE INTO session_analysis
        (session_id, caller_intent_type, caller_intent_confidence, caller_intent_summary,
         booking_details_json, analyzed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      sessionId,
      intent?.type ?? null,
      intent?.confidence ?? null,
      intent?.summary ?? null,
      intent?.bookingDetails ? JSON.stringify(intent.bookingDetails) : null,
      analyzedAt,
    );

    res.json({
      sessionId,
      intent,
      analyzedAt,
      cached: false,
    });
  } catch (err: any) {
    console.error(`Error getting intent for session ${sessionId}:`, err);
    res.status(500).json({ error: err.message });
  } finally {
    if (db) db.close();
  }
}

/**
 * GET /api/trace-analysis/:sessionId/verify
 *
 * Dedicated verification endpoint. Runs fulfillment verification against Cloud9.
 * Uses cached analysis data if available, otherwise runs full analysis first.
 */
export async function verifySession(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  const force = req.query.force === 'true';

  let db: BetterSqlite3.Database | null = null;

  try {
    db = getDb();
    const configId = resolveConfigId(db, req, sessionId);

    // Resolve tenant ID from config for tenant-aware verification
    const tenantRow2 = db.prepare('SELECT tenant_id FROM langfuse_configs WHERE id = ?').get(configId) as any;
    const verifyTenantId: number = tenantRow2?.tenant_id || 1;

    // Check for cached verification (unless force)
    if (!force) {
      const cached = db.prepare(
        'SELECT verification_status, verification_json, verified_at FROM session_analysis WHERE session_id = ? AND verification_json IS NOT NULL'
      ).get(sessionId) as any;

      if (cached?.verification_json) {
        res.json({
          sessionId,
          verification: JSON.parse(cached.verification_json),
          cached: true,
        });
        return;
      }
    }

    // Get session data
    const service = new LangfuseTraceService(db);
    let sessionData = service.getSession(sessionId, configId);
    let wasJustImported = false;

    // Reverse-lookup: sessionId may be an original Langfuse ID regrouped into a conv_ session
    if (!sessionData) {
      sessionData = service.getSessionByOriginalId(sessionId, configId);
    }

    if (!sessionData) {
      try {
        sessionData = await service.importSessionTraces(sessionId, configId);
        wasJustImported = true;
      } catch (importErr: any) {
        res.status(404).json({ error: `Session not found: ${importErr.message}` });
        return;
      }
    }

    if (!sessionData || !sessionData.traces || sessionData.traces.length === 0) {
      res.status(404).json({ error: 'Session not found or has no traces' });
      return;
    }

    // Auto-sync session bookings to Prod Tracker when session is newly imported
    if (wasJustImported) {
      try {
        const prodTrackerService = new ProdTestRecordService(db);
        await prodTrackerService.syncSessionToProdTracker(sessionId);
      } catch (syncErr: any) {
        console.warn(`[TraceAnalysis] Failed to sync session ${sessionId} to Prod Tracker: ${syncErr.message}`);
      }
    }

    // Get or compute intent
    let intent: any = null;
    const cachedAnalysis = db.prepare(
      'SELECT caller_intent_type, caller_intent_confidence, caller_intent_summary, booking_details_json FROM session_analysis WHERE session_id = ?'
    ).get(sessionId) as any;

    const allObs = filterInternalTraces(sessionData.observations);

    if (cachedAnalysis?.caller_intent_type) {
      intent = {
        type: cachedAnalysis.caller_intent_type,
        confidence: cachedAnalysis.caller_intent_confidence,
        summary: cachedAnalysis.caller_intent_summary,
        bookingDetails: cachedAnalysis.booking_details_json ? JSON.parse(cachedAnalysis.booking_details_json) : undefined,
      };
    } else {
      const transcript = buildTranscript(sessionData.traces, sessionData.observations);
      try {
        intent = await classifyCallerIntent(transcript);
        // Enhance with child names from tool observations (more reliable than transcript extraction)
        if (intent) {
          intent = enhanceIntentWithObservations(intent, allObs);
        }
      } catch (err: any) {
        res.status(500).json({ error: `Intent classification failed: ${err.message}` });
        return;
      }
    }

    const verification = await verifyFulfillment(sessionId, allObs, intent, verifyTenantId);

    // Cache verification
    db.prepare(`UPDATE session_analysis SET verification_status = ?, verification_json = ?, verified_at = ? WHERE session_id = ?`)
      .run(verification.status, JSON.stringify(verification), verification.verifiedAt, sessionId);

    res.json({
      sessionId,
      verification,
      cached: false,
    });
  } catch (err: any) {
    console.error(`Error verifying session ${sessionId}:`, err);
    res.status(500).json({ error: err.message });
  } finally {
    if (db) db.close();
  }
}

/**
 * GET /api/trace-analysis/monitoring-results
 *
 * Query session_analysis with filters: dateFrom, dateTo, status, intentType, sessionId, limit, offset.
 * Note: Originally this queried monitoring_results, but that table was never populated.
 * Now uses session_analysis directly with column mapping.
 */
export async function getMonitoringResults(req: Request, res: Response): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    db = getDb();

    const {
      dateFrom,
      dateTo,
      status,
      intentType,
      sessionId,
      limit: limitStr,
      offset: offsetStr,
    } = req.query as Record<string, string | undefined>;

    const limit = limitStr ? parseInt(limitStr) : 50;
    const offset = offsetStr ? parseInt(offsetStr) : 0;

    const conditions: string[] = [];
    const params: any[] = [];

    if (dateFrom) {
      conditions.push('sa.analyzed_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('sa.analyzed_at <= ?');
      params.push(dateTo + 'T23:59:59');
    }
    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      conditions.push(`sa.verification_status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
    if (intentType) {
      const types = intentType.split(',').map(s => s.trim());
      conditions.push(`sa.caller_intent_type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }
    if (sessionId) {
      conditions.push('sa.session_id LIKE ?');
      params.push(`%${sessionId}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM session_analysis sa ${whereClause}`
    ).get(...params) as any;
    const total = countRow?.total || 0;

    // Fetch results from session_analysis with column mapping to match MonitoringResult interface
    const results = db.prepare(`
      SELECT
        sa.id,
        sa.session_id,
        sa.caller_intent_type as intent_type,
        sa.caller_intent_confidence as intent_confidence,
        sa.verification_status,
        NULL as verdict_summary,
        NULL as diagnostic_status,
        sa.analyzed_at,
        sa.caller_intent_summary
      FROM session_analysis sa
      ${whereClause}
      ORDER BY sa.analyzed_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({ results, total });
  } catch (err: any) {
    console.error('Error fetching monitoring results:', err);
    res.status(500).json({ error: err.message });
  } finally {
    if (db) db.close();
  }
}

// ============================================================================
// BOOKING CORRECTION ENDPOINTS
// ============================================================================

/**
 * Check if the configId belongs to a non-Cloud9 tenant.
 * Returns the tenant_id or null if correction endpoints should be blocked.
 */
function getNonCloud9TenantId(configId: number): number | null {
  let db: BetterSqlite3.Database | null = null;
  try {
    db = getDb();
    const row = db.prepare('SELECT tenant_id FROM langfuse_configs WHERE id = ?').get(configId) as any;
    const tid = row?.tenant_id || 1;
    return tid !== 1 ? tid : null;
  } catch {
    return null;
  } finally {
    if (db) db.close();
  }
}

const DEFAULT_LOCATION_GUID = '3D44BD41-4E94-4E93-A157-C7E3A0024286';
const DEFAULT_APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705';
const CHAIR_8_GUID = '07687884-7e37-49aa-8028-d43b751c9034'; // Only show Chair 8 slots (matches Node-RED slot logic)
const DEFAULT_MINUTES = 40;
const VENDOR_USERNAME = 'Intelepeer';

/**
 * POST /api/trace-analysis/:sessionId/correction/check-slot
 */
export async function checkSlotAvailability(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  const { intendedStartTime, date } = req.body;
  const corrConfigId = req.query.configId ? parseInt(req.query.configId as string) : 1;

  // Block non-Cloud9 tenants
  const nonCloud9Tenant = getNonCloud9TenantId(corrConfigId);
  if (nonCloud9Tenant) {
    res.status(501).json({ error: 'Booking corrections not available for NexHealth tenants', tenant: 'chord' });
    return;
  }

  if (!date) {
    res.status(400).json({ error: 'date is required' });
    return;
  }

  try {
    const tenantCloud9 = req.tenantContext ? getCloud9ConfigForTenant(req.tenantContext, 'production') : undefined;
    const client = createCloud9Client('production', tenantCloud9);
    // Use same parameters as Node-RED slot lookup:
    // - appointmentTypeGuid: required for consultation slots
    // - No providerGuid filter (we filter to Chair 8 after)
    const resp = await client.getAvailableAppts({
      locationGuid: DEFAULT_LOCATION_GUID, // Note: Not used by API, location is from credentials
      appointmentTypeGuid: DEFAULT_APPT_TYPE_GUID, // Required: filters to consultation appointment type
      startDate: date,
      endDate: date,
    });

    const allSlots = resp.records || [];

    // Filter to Chair 8 only (same as Node-RED slot logic)
    const slots = allSlots.filter(slot => {
      const colGUID = (slot.ScheduleColumnGUID || slot.schdcolGUID || '').toLowerCase();
      return colGUID === CHAIR_8_GUID.toLowerCase();
    });

    console.log(`[checkSlotAvailability] Found ${allSlots.length} total slots, ${slots.length} Chair 8 slots for ${date}`);

    let intendedSlot: any = null;
    const alternatives: any[] = [];

    // Parse intended time for comparison
    let intendedMs = 0;
    if (intendedStartTime) {
      try { intendedMs = new Date(intendedStartTime).getTime(); } catch { intendedMs = 0; }
    }

    for (const slot of slots) {
      const slotTime = slot.StartTime || slot.AppointmentDateTime || '';
      let slotMs = 0;
      try { slotMs = new Date(slotTime).getTime(); } catch { continue; }

      const entry = {
        startTime: slotTime,
        scheduleViewGUID: slot.ScheduleViewGUID || slot.schdvwGUID || '',
        scheduleColumnGUID: slot.ScheduleColumnGUID || slot.schdcolGUID || '',
        minutesFromIntended: intendedMs ? Math.round((slotMs - intendedMs) / 60000) : 0,
      };

      // Check exact match (within 1 minute)
      if (intendedMs && Math.abs(slotMs - intendedMs) < 60000) {
        intendedSlot = entry;
      }
      alternatives.push(entry);
    }

    // Sort all slots chronologically
    alternatives.sort((a, b) => {
      const aMs = new Date(a.startTime).getTime();
      const bMs = new Date(b.startTime).getTime();
      return aMs - bMs;
    });

    res.json({
      slotAvailable: !!intendedSlot,
      intendedSlot,
      alternatives, // Return ALL slots for the day
    });
  } catch (err: any) {
    console.error(`Check slot failed for session ${sessionId}:`, err);
    res.status(500).json({ error: err.message });
  }
}

/**
 * POST /api/trace-analysis/:sessionId/correction/book
 */
export async function bookCorrection(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  const {
    patientGUID, startTime, scheduleViewGUID, scheduleColumnGUID,
    appointmentTypeGUID, minutes, childName,
  } = req.body;
  const bookCorrConfigId = req.query.configId ? parseInt(req.query.configId as string) : 1;

  // Block non-Cloud9 tenants
  const nonCloud9Tenant2 = getNonCloud9TenantId(bookCorrConfigId);
  if (nonCloud9Tenant2) {
    res.status(501).json({ error: 'Booking corrections not available for NexHealth tenants', tenant: 'chord' });
    return;
  }

  if (!patientGUID || !startTime || !scheduleViewGUID || !scheduleColumnGUID) {
    res.status(400).json({ error: 'patientGUID, startTime, scheduleViewGUID, scheduleColumnGUID are required' });
    return;
  }

  let db: BetterSqlite3.Database | null = null;
  try {
    const tenantCloud9 = req.tenantContext ? getCloud9ConfigForTenant(req.tenantContext, 'production') : undefined;
    const client = createCloud9Client('production', tenantCloud9);
    const createResp = await client.createAppointment({
      PatientGUID: patientGUID,
      StartTime: startTime,
      ScheduleViewGUID: scheduleViewGUID,
      ScheduleColumnGUID: scheduleColumnGUID,
      AppointmentTypeGUID: appointmentTypeGUID || DEFAULT_APPT_TYPE_GUID,
      Minutes: minutes || DEFAULT_MINUTES,
      VendorUserName: VENDOR_USERNAME,
    });

    let appointmentGUID: string | null = null;
    if (createResp.status === 'Success' && createResp.records?.length > 0) {
      const raw = createResp.records[0]?.ResponseMessage || createResp.records[0]?.Message || JSON.stringify(createResp.records[0]);
      const guidMatch = raw.match(/([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})/);
      if (guidMatch) appointmentGUID = guidMatch[1];
    }

    // Try to confirm
    if (appointmentGUID) {
      try {
        await new Promise(r => setTimeout(r, 5000));
        await client.confirmAppointment(appointmentGUID);
      } catch (confirmErr: any) {
        console.warn(`Confirm failed for ${appointmentGUID}:`, confirmErr.message);
      }
    }

    // Audit log
    db = getDb();
    db.prepare(`INSERT INTO booking_corrections (session_id, action, child_name, patient_guid, appointment_guid_after, slot_after, status) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(sessionId, 'book', childName || null, patientGUID, appointmentGUID, startTime, appointmentGUID ? 'success' : 'failed');

    res.json({
      success: !!appointmentGUID,
      appointmentGUID,
      message: appointmentGUID ? `Appointment ${appointmentGUID} created and confirmed` : 'Appointment creation returned no GUID',
    });
  } catch (err: any) {
    console.error(`Book correction failed for session ${sessionId}:`, err);
    // Log failure
    try {
      if (!db) db = getDb();
      db.prepare(`INSERT INTO booking_corrections (session_id, action, child_name, patient_guid, slot_after, status, error) VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(sessionId, 'book', childName || null, patientGUID, startTime, 'failed', err.message);
    } catch { /* ignore audit errors */ }
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (db) db.close();
  }
}

/**
 * POST /api/trace-analysis/:sessionId/correction/cancel
 */
export async function cancelCorrection(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  const { appointmentGUID, childName } = req.body;
  const cancelCorrConfigId = req.query.configId ? parseInt(req.query.configId as string) : 1;

  // Block non-Cloud9 tenants
  const nonCloud9Tenant3 = getNonCloud9TenantId(cancelCorrConfigId);
  if (nonCloud9Tenant3) {
    res.status(501).json({ error: 'Booking corrections not available for NexHealth tenants', tenant: 'chord' });
    return;
  }

  if (!appointmentGUID) {
    res.status(400).json({ error: 'appointmentGUID is required' });
    return;
  }

  let db: BetterSqlite3.Database | null = null;
  try {
    const tenantCloud9 = req.tenantContext ? getCloud9ConfigForTenant(req.tenantContext, 'production') : undefined;
    const client = createCloud9Client('production', tenantCloud9);
    const resp = await client.cancelAppointment(appointmentGUID);

    const success = resp.status === 'Success';

    db = getDb();
    db.prepare(`INSERT INTO booking_corrections (session_id, action, child_name, appointment_guid_before, status, error) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(sessionId, 'cancel', childName || null, appointmentGUID, success ? 'success' : 'failed', success ? null : JSON.stringify(resp));

    res.json({ success, message: success ? `Appointment ${appointmentGUID} cancelled` : 'Cancellation failed' });
  } catch (err: any) {
    console.error(`Cancel correction failed for session ${sessionId}:`, err);
    try {
      if (!db) db = getDb();
      db.prepare(`INSERT INTO booking_corrections (session_id, action, child_name, appointment_guid_before, status, error) VALUES (?, ?, ?, ?, ?, ?)`)
        .run(sessionId, 'cancel', childName || null, appointmentGUID, 'failed', err.message);
    } catch { /* ignore */ }
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (db) db.close();
  }
}

/**
 * POST /api/trace-analysis/:sessionId/correction/reschedule
 */
export async function rescheduleCorrection(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  const {
    appointmentGUID, patientGUID, newStartTime,
    scheduleViewGUID, scheduleColumnGUID, childName,
  } = req.body;
  const reschCorrConfigId = req.query.configId ? parseInt(req.query.configId as string) : 1;

  // Block non-Cloud9 tenants
  const nonCloud9Tenant4 = getNonCloud9TenantId(reschCorrConfigId);
  if (nonCloud9Tenant4) {
    res.status(501).json({ error: 'Booking corrections not available for NexHealth tenants', tenant: 'chord' });
    return;
  }

  if (!appointmentGUID || !patientGUID || !newStartTime || !scheduleViewGUID || !scheduleColumnGUID) {
    res.status(400).json({ error: 'appointmentGUID, patientGUID, newStartTime, scheduleViewGUID, scheduleColumnGUID are required' });
    return;
  }

  let db: BetterSqlite3.Database | null = null;
  try {
    const tenantCloud9 = req.tenantContext ? getCloud9ConfigForTenant(req.tenantContext, 'production') : undefined;
    const client = createCloud9Client('production', tenantCloud9);

    // Cancel existing
    await client.cancelAppointment(appointmentGUID);
    await new Promise(r => setTimeout(r, 15000));

    // Book new
    const createResp = await client.createAppointment({
      PatientGUID: patientGUID,
      StartTime: newStartTime,
      ScheduleViewGUID: scheduleViewGUID,
      ScheduleColumnGUID: scheduleColumnGUID,
      AppointmentTypeGUID: DEFAULT_APPT_TYPE_GUID,
      Minutes: DEFAULT_MINUTES,
      VendorUserName: VENDOR_USERNAME,
    });

    let newApptGUID: string | null = null;
    if (createResp.status === 'Success' && createResp.records?.length > 0) {
      const raw = createResp.records[0]?.ResponseMessage || createResp.records[0]?.Message || JSON.stringify(createResp.records[0]);
      const guidMatch = raw.match(/([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})/);
      if (guidMatch) newApptGUID = guidMatch[1];
    }

    // Confirm
    if (newApptGUID) {
      try {
        await new Promise(r => setTimeout(r, 5000));
        await client.confirmAppointment(newApptGUID);
      } catch { /* ignore confirm errors */ }
    }

    db = getDb();
    db.prepare(`INSERT INTO booking_corrections (session_id, action, child_name, patient_guid, appointment_guid_before, appointment_guid_after, slot_after, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(sessionId, 'reschedule', childName || null, patientGUID, appointmentGUID, newApptGUID, newStartTime, newApptGUID ? 'success' : 'failed');

    res.json({
      success: !!newApptGUID,
      oldAppointmentGUID: appointmentGUID,
      newAppointmentGUID: newApptGUID,
      message: newApptGUID ? `Rescheduled: cancelled ${appointmentGUID}, created ${newApptGUID}` : 'Reschedule partially failed - old cancelled but new booking failed',
    });
  } catch (err: any) {
    console.error(`Reschedule correction failed for session ${sessionId}:`, err);
    try {
      if (!db) db = getDb();
      db.prepare(`INSERT INTO booking_corrections (session_id, action, child_name, patient_guid, appointment_guid_before, slot_after, status, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(sessionId, 'reschedule', childName || null, patientGUID, appointmentGUID, newStartTime, 'failed', err.message);
    } catch { /* ignore */ }
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (db) db.close();
  }
}

/**
 * GET /api/trace-analysis/:sessionId/correction/history
 */
export async function getCorrectionHistory(req: Request, res: Response): Promise<void> {
  const { sessionId } = req.params;
  let db: BetterSqlite3.Database | null = null;
  try {
    db = getDb();
    const rows = db.prepare('SELECT * FROM booking_corrections WHERE session_id = ? ORDER BY performed_at DESC').all(sessionId);
    res.json({ corrections: rows });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    if (db) db.close();
  }
}

/**
 * Build a unified transcript from all traces in a session, ordered chronologically.
 */
function buildTranscript(traces: any[], observations: any[]): ConversationTurn[] {
  const allTurns: ConversationTurn[] = [];

  // Sort traces chronologically
  const sortedTraces = [...traces].sort((a, b) =>
    new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  );

  for (const trace of sortedTraces) {
    // Get observations for this trace
    const traceObs = observations.filter((o: any) => o.trace_id === trace.trace_id);
    const filtered = filterInternalTraces(traceObs);
    const turns = transformToConversationTurns(trace, filtered);
    allTurns.push(...turns);
  }

  return allTurns;
}

// ── Booking Investigation Endpoint ──────────────────────────────────────────

const SCHEDULING_TOOLS_INV = ['chord_scheduling_v08', 'chord_scheduling_v07_dev'];
const ALL_KNOWN_TOOLS_INV = [...SCHEDULING_TOOLS_INV, 'chord_patient_v07_stage', 'CurrentDateTime', 'chord_OGHandleEscalation', 'chord_handleEscalation'];
const KNOWN_PLACEHOLDERS = ['123456789', '987654321', '1234567890', 'APPT123456', 'null', 'undefined', 'N/A', 'TBD'];

function isPlaceholderId(id: string): boolean {
  return KNOWN_PLACEHOLDERS.includes(id) || /^(APPT|TEST|FAKE|DEMO)\d+$/i.test(id) || id === 'null';
}

interface InvestigationToolCall {
  index: number;
  name: string;
  action: string;
  level: string;
  isError: boolean;
  statusMessage: string | null;
  input: Record<string, any>;
  output: Record<string, any>;
  timestamp: string;
}

interface PayloadFinding {
  traceId: string;
  timestamp: string;
  apptIds: string[];
  apptGuids: string[];
  patientIds: string[];
  childNames: string[];
  callerName: string | null;
  parentPatientId: string | null;
  payloadJson: any;
}

interface InvestigationResult {
  sessionId: string;
  classification: 'CLEAN' | 'LEGITIMATE' | 'FALSE_POSITIVE' | 'FALSE_POSITIVE_WITH_TOOL' | 'INCONCLUSIVE';
  configName: string;
  session: {
    configId: number;
    hasSuccessfulBooking: number;
    hasTransfer: number;
    hasOrder: number;
    traceCount: number;
    errorCount: number;
    firstTraceAt: string;
    lastTraceAt: string;
    userId: string | null;
  };
  toolCalls: InvestigationToolCall[];
  bookingToolCallCount: number;
  payloadFindings: PayloadFinding[];
  allExtractedIds: string[];
  placeholderIds: string[];
  callerName: string | null;
  childNames: string[];
  phone: string | null;
}

/**
 * GET /api/trace-analysis/:sessionId/investigate
 *
 * Investigates a session for false positive booking detection.
 * Checks if PAYLOAD appointment IDs exist without corresponding booking tool calls.
 */
export const investigateSession = async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  const db = getDb();

  try {
    const session = db.prepare(`
      SELECT session_id, langfuse_config_id, has_successful_booking, has_transfer, has_order,
             trace_count, error_count, first_trace_at, last_trace_at, user_id
      FROM production_sessions WHERE session_id = ?
    `).get(sessionId) as any;

    if (!session) {
      db.close();
      res.status(404).json({ error: `Session "${sessionId}" not found` });
      return;
    }

    const traces = db.prepare(`
      SELECT trace_id, name, started_at FROM production_traces
      WHERE session_id = ? ORDER BY started_at ASC
    `).all(sessionId) as any[];

    if (traces.length === 0) {
      db.close();
      res.json({ data: { sessionId, classification: 'CLEAN', toolCalls: [], payloadFindings: [], allExtractedIds: [], placeholderIds: [], session: { configId: session.langfuse_config_id, hasSuccessfulBooking: session.has_successful_booking, hasTransfer: session.has_transfer, hasOrder: session.has_order, traceCount: session.trace_count, errorCount: session.error_count, firstTraceAt: session.first_trace_at, lastTraceAt: session.last_trace_at, userId: session.user_id }, bookingToolCallCount: 0, callerName: null, childNames: [], phone: null } });
      return;
    }

    const traceIds = traces.map((t: any) => t.trace_id);
    const ph = traceIds.map(() => '?').join(',');

    // Load all observations
    const allObs = db.prepare(`
      SELECT name, type, level, input, output, status_message, started_at, trace_id
      FROM production_trace_observations WHERE trace_id IN (${ph}) ORDER BY started_at ASC
    `).all(...traceIds) as any[];

    // Tool calls
    const toolObs = allObs.filter((o: any) => ALL_KNOWN_TOOLS_INV.includes(o.name));
    const toolCalls: InvestigationToolCall[] = toolObs.map((obs: any, idx: number) => {
      let input: any = {};
      try { input = typeof obs.input === 'string' ? JSON.parse(obs.input) : obs.input || {}; } catch {}
      let output: any = {};
      try { output = typeof obs.output === 'string' ? JSON.parse(obs.output) : obs.output || {}; } catch {}
      const action = input?.action || (obs.name === 'CurrentDateTime' ? 'getDateTime' : obs.name.includes('Escalation') || obs.name.includes('HandleEscalation') ? 'escalation' : 'unknown');
      const level = obs.level || 'DEFAULT';
      const isError = level === 'ERROR' || (obs.status_message || '').includes('required');
      return { index: idx + 1, name: obs.name, action, level, isError, statusMessage: obs.status_message || null, input, output, timestamp: obs.started_at || '' };
    });

    // Booking tool calls
    const bookingToolCalls = toolCalls.filter(tc =>
      SCHEDULING_TOOLS_INV.includes(tc.name) && (tc.action === 'book_child' || tc.action === 'book')
    );

    // PAYLOAD scanning
    const generationObs = allObs.filter((o: any) => o.type === 'GENERATION' && o.output);
    const childApptIdRegex = /Child[12]_appointmentId\\?["']?\s*[:=]\s*\\?["']?([A-Za-z0-9_-]+)/g;
    const childApptGuidRegex = /Child[12]_appointmentGUID\\?["']?\s*[:=]\s*\\?["']?([0-9A-Fa-f-]{36})/g;
    const childPatientIdRegex = /Child[12]_patientId\\?["']?\s*[:=]\s*\\?["']?(\d+)/g;
    const childNameRegex = /Child[12]_(?:First)?Name\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/g;
    const callerNameRegex = /Caller_Name\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/;
    const parentPatientIdRegex = /Parent_patientId\\?["']?\s*[:=]\s*\\?["']?(\d+)/;

    const payloadFindings: PayloadFinding[] = [];
    for (const gen of generationObs) {
      const out = typeof gen.output === 'string' ? gen.output : JSON.stringify(gen.output || '');
      if (!out.includes('PAYLOAD')) continue;

      const apptIds: string[] = [];
      const apptGuids: string[] = [];
      const patientIds: string[] = [];
      const childNames: string[] = [];
      let m: RegExpExecArray | null;

      const r1 = new RegExp(childApptIdRegex.source, 'g');
      while ((m = r1.exec(out)) !== null) apptIds.push(m[1]);
      const r2 = new RegExp(childApptGuidRegex.source, 'g');
      while ((m = r2.exec(out)) !== null) apptGuids.push(m[1]);
      const r3 = new RegExp(childPatientIdRegex.source, 'g');
      while ((m = r3.exec(out)) !== null) patientIds.push(m[1]);
      const r4 = new RegExp(childNameRegex.source, 'g');
      while ((m = r4.exec(out)) !== null) childNames.push(m[1].trim());

      const callerMatch = out.match(callerNameRegex);
      const parentMatch = out.match(parentPatientIdRegex);

      // Extract PAYLOAD JSON
      let payloadJson: any = null;
      const payloadStart = out.indexOf('PAYLOAD');
      if (payloadStart !== -1) {
        const braceStart = out.indexOf('{', payloadStart);
        if (braceStart !== -1) {
          let depth = 0; let braceEnd = -1;
          for (let i = braceStart; i < out.length; i++) {
            if (out[i] === '{') depth++;
            else if (out[i] === '}') { depth--; if (depth === 0) { braceEnd = i + 1; break; } }
          }
          if (braceEnd !== -1) {
            try { payloadJson = JSON.parse(out.substring(braceStart, braceEnd).replace(/\\"/g, '"').replace(/\\n/g, '\n')); }
            catch { payloadJson = out.substring(braceStart, Math.min(braceEnd, braceStart + 2000)); }
          }
        }
      }

      if (apptIds.length > 0 || apptGuids.length > 0) {
        payloadFindings.push({
          traceId: gen.trace_id,
          timestamp: gen.started_at || '',
          apptIds, apptGuids, patientIds, childNames,
          callerName: callerMatch ? callerMatch[1].trim() : null,
          parentPatientId: parentMatch ? parentMatch[1] : null,
          payloadJson,
        });
      }
    }

    // Classification
    const allExtractedIds = payloadFindings.flatMap(f => [...f.apptIds, ...f.apptGuids]);
    const placeholderIds = allExtractedIds.filter(isPlaceholderId);
    const realLookingIds = allExtractedIds.filter(id => !isPlaceholderId(id));
    const hasBookingTool = bookingToolCalls.length > 0;

    let classification: InvestigationResult['classification'];
    if (payloadFindings.length === 0) {
      classification = 'CLEAN';
    } else if (hasBookingTool && realLookingIds.length > 0) {
      classification = 'LEGITIMATE';
    } else if (!hasBookingTool && realLookingIds.length > 0) {
      // Non-placeholder IDs exist but no booking tool was called = hallucinated
      classification = 'FALSE_POSITIVE';
    } else if (!hasBookingTool && allExtractedIds.length > 0 && realLookingIds.length === 0) {
      // Only placeholder IDs (null, N/A, TBD, etc.) with no booking tool = empty PAYLOAD template
      classification = 'CLEAN';
    } else if (hasBookingTool && placeholderIds.length > 0 && realLookingIds.length === 0) {
      classification = 'FALSE_POSITIVE_WITH_TOOL';
    } else {
      classification = 'INCONCLUSIVE';
    }

    const phoneMatch = sessionId.match(/\+\d+/);
    const callerName = payloadFindings.find(f => f.callerName)?.callerName || session.user_id || null;
    const childNamesList = [...new Set(payloadFindings.flatMap(f => f.childNames))];
    const configRow = db.prepare('SELECT name FROM langfuse_configs WHERE id = ?').get(session.langfuse_config_id) as any;

    const result: InvestigationResult = {
      sessionId,
      classification,
      configName: configRow?.name || `Config ${session.langfuse_config_id}`,
      session: {
        configId: session.langfuse_config_id,
        hasSuccessfulBooking: session.has_successful_booking,
        hasTransfer: session.has_transfer,
        hasOrder: session.has_order,
        traceCount: session.trace_count,
        errorCount: session.error_count,
        firstTraceAt: session.first_trace_at,
        lastTraceAt: session.last_trace_at,
        userId: session.user_id,
      },
      toolCalls,
      bookingToolCallCount: bookingToolCalls.length,
      payloadFindings,
      allExtractedIds,
      placeholderIds,
      callerName,
      childNames: childNamesList,
      phone: phoneMatch ? phoneMatch[0] : null,
    };

    db.close();
    res.json({ data: result });
  } catch (err: any) {
    db.close();
    res.status(500).json({ error: err.message });
  }
};

// ── Markdown Report Generation ──────────────────────────────────────────────

// Classification labels (used by chat skill)
const CLASSIFICATION_LABEL: Record<string, string> = {
  CLEAN: 'Clean (No PAYLOAD IDs)',
  LEGITIMATE: 'Legitimate Booking',
  FALSE_POSITIVE: 'FALSE POSITIVE - Hallucinated Booking',
  FALSE_POSITIVE_WITH_TOOL: 'Suspicious - Placeholder IDs with Tool Call',
  INCONCLUSIVE: 'Inconclusive - Manual Review Needed',
};
void CLASSIFICATION_LABEL; // exported via investigateSession JSON response

function getToolCallDetail(tc: InvestigationToolCall): string {
  if (tc.isError) {
    // Try to extract a clean error message
    let detail = tc.statusMessage || '';
    if (!detail) {
      const out = tc.output;
      if (out?.message) detail = out.message;
      else if (out?.error) detail = typeof out.error === 'string' ? out.error : JSON.stringify(out.error);
      else detail = 'ERROR';
    }
    // Try to parse JSON error strings for a clean message
    if (detail.startsWith('{') || detail.startsWith('Error:')) {
      try {
        const parsed = JSON.parse(detail.replace(/^Error:\s*/, ''));
        detail = parsed.message || parsed.error || detail;
      } catch { /* keep original */ }
    }
    if (detail.length > 50) detail = detail.substring(0, 47) + '...';
    return detail;
  }
  if (tc.name === 'CurrentDateTime') {
    return tc.output?.iso8601 || tc.output?.currentDateTime || `${tc.output?.date}T${tc.output?.time || ''}Z` || 'time returned';
  }
  if (tc.action === 'lookup') {
    const names: string[] = [];
    if (Array.isArray(tc.output)) {
      tc.output.slice(0, 3).forEach((p: any) => { if (p.first_name) names.push(p.first_name); });
    } else if (tc.output?.patients) {
      tc.output.patients.slice(0, 3).forEach((p: any) => { if (p.firstName) names.push(p.firstName); });
    }
    return names.length > 0 ? `Found: ${names.join(', ')}` : 'lookup returned';
  }
  if (tc.action === 'clinic_info') {
    return tc.output?.locationBehaviors?.office_name || tc.output?.locationInfo?.name || tc.output?.locationName || tc.output?.name || 'location info';
  }
  if (tc.action === 'slots' || tc.action === 'grouped_slots') {
    const count = tc.output?.totalSlotsFound || tc.output?.slots?.length || (Array.isArray(tc.output) ? tc.output.length : '?');
    return `${count} slots returned`;
  }
  if (tc.action === 'book_child' || tc.action === 'book') {
    const id = tc.output?.appointmentId || tc.output?.appointmentGUID || tc.output?.id;
    return `success=${tc.output?.success}, id=${id || 'none'}`;
  }
  if (tc.action === 'escalation') {
    return tc.output?.message || tc.output?.status || 'call transferred';
  }
  if (tc.action === 'create') {
    const id = tc.output?.id || tc.output?.patientId || '';
    return id ? `patient created (ID: ${id})` : 'patient created';
  }
  return JSON.stringify(tc.output).substring(0, 60);
}

function formatInvestigationMarkdown(r: InvestigationResult): string {
  const lines: string[] = [];
  const firstTime = r.session.firstTraceAt ? new Date(r.session.firstTraceAt) : null;
  const lastTime = r.session.lastTraceAt ? new Date(r.session.lastTraceAt) : null;
  const dateStr = firstTime ? `${firstTime.toISOString().slice(0, 10)} ${firstTime.toISOString().slice(11, 16)} - ${lastTime ? lastTime.toISOString().slice(11, 16) : '??:??'} UTC` : 'Unknown';

  // Extract location name from clinic_info tool call output
  let locationStr = '';
  const clinicCall = r.toolCalls.find(tc => tc.action === 'clinic_info' && !tc.isError);
  if (clinicCall?.output) {
    const lb = clinicCall.output.locationBehaviors || clinicCall.output;
    const li = clinicCall.output.locationInfo || {};
    const officeName = lb?.office_name || li?.name || '';
    const addr = li?.street_address || lb?.address_line1 || '';
    const city = li?.city || lb?.city || '';
    const state = li?.state || lb?.state || '';
    if (officeName) locationStr = addr ? `${officeName} (${addr}, ${city} ${state})` : officeName;
  }

  // Extract patient info from lookup tool call
  const patientInfoList: string[] = [];
  const lookupCalls = r.toolCalls.filter(tc => tc.action === 'lookup' && !tc.isError);
  for (const lc of lookupCalls) {
    const patients = Array.isArray(lc.output) ? lc.output : lc.output?.patients || [];
    for (const p of patients) {
      const fn = p.first_name || p.firstName || '';
      const ln = p.last_name || p.lastName || '';
      const id = p.id || p.patientId || '';
      const dob = p.date_of_birth || p.birthDate || '';
      if (fn) patientInfoList.push(`${fn} ${ln}${id ? ` (ID: ${id})` : ''}${dob ? `, DOB: ${dob}` : ''}`);
    }
  }

  // ── Dynamic title based on classification ──
  const TITLE_MAP: Record<string, string> = {
    CLEAN: 'Session Analysis Report — No Issues Detected',
    LEGITIMATE: 'Session Analysis Report — Legitimate Booking Verified',
    FALSE_POSITIVE: 'False Positive Booking Detection Report',
    FALSE_POSITIVE_WITH_TOOL: 'Suspicious Booking Investigation Report',
    INCONCLUSIVE: 'Session Analysis Report — Manual Review Required',
  };
  lines.push(`# ${TITLE_MAP[r.classification] || 'Session Analysis Report'}`);
  lines.push('');

  // ── Metadata — all dynamic ──
  const metaLines: string[] = [];
  metaLines.push(`**Session:** \`${r.sessionId}\``);
  metaLines.push(`**Date:** ${dateStr}`);
  metaLines.push(`**Config:** ${r.configName} (ID ${r.session.configId})`);
  metaLines.push(`**Caller:** ${r.callerName || 'Unknown'} (${r.phone || 'N/A'})`);
  if (r.childNames.length > 0) metaLines.push(`**Children:** ${r.childNames.join(', ')}`);
  if (patientInfoList.length > 0) metaLines.push(`**Patient(s):** ${patientInfoList.join('; ')}`);
  if (locationStr) metaLines.push(`**Location:** ${locationStr}`);
  lines.push(metaLines.join('  \n'));
  lines.push('');

  // ── Summary — dynamic based on classification and actual data ──
  lines.push('---');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  if (r.classification === 'FALSE_POSITIVE') {
    const ids = [...new Set(r.allExtractedIds)].map(id => `\`${id}\``).join(', ');
    const childName = r.childNames[0] || 'the patient';
    let apptDetails = '';
    for (const f of r.payloadFindings) {
      const pj = f.payloadJson;
      if (pj?.Child1_Appointment_Details) {
        const d = pj.Child1_Appointment_Details;
        apptDetails = `${d.day_of_week || ''}, ${d.date || ''} at ${d.time || ''}`.trim();
      }
      if (pj?.Child1_Appointment_Type && !apptDetails.includes(pj.Child1_Appointment_Type)) {
        apptDetails = `a ${pj.Child1_Appointment_Type.toLowerCase()} for ${childName} on ${apptDetails}`;
      }
    }
    // Describe what actually happened dynamically
    const actualTools = r.toolCalls.map(tc => tc.action !== tc.name ? tc.action : tc.name);
    const toolSummary = actualTools.length > 0 ? `The LLM called ${actualTools.length} tool(s) (${[...new Set(actualTools)].join(', ')}) but **never called a booking action** (book/book_child).` : 'The LLM made no tool calls at all.';
    lines.push(`**This booking never happened.** ${toolSummary} Instead, the LLM fabricated appointment ID ${ids} for ${apptDetails || childName} in the PAYLOAD output. The PAYLOAD extraction fallback trusted this hallucinated text.`);
  } else if (r.classification === 'LEGITIMATE') {
    const ids = [...new Set(r.allExtractedIds)].map(id => `\`${id}\``).join(', ');
    const bookActions = r.toolCalls.filter(tc => tc.action === 'book_child' || tc.action === 'book');
    const bookResults = bookActions.map(tc => {
      const id = tc.output?.appointmentId || tc.output?.appointmentGUID || tc.output?.id || 'unknown';
      return `${tc.action} → ${tc.output?.success ? 'success' : 'failed'} (ID: ${id})`;
    });
    lines.push(`This session contains **${r.bookingToolCallCount} booking tool call(s)** and PAYLOAD appointment IDs ${ids || 'N/A'}. The booking appears genuine.`);
    if (bookResults.length > 0) lines.push(`\nBooking results: ${bookResults.join('; ')}`);
  } else if (r.classification === 'CLEAN') {
    const actualTools = r.toolCalls.map(tc => tc.action !== tc.name ? tc.action : tc.name);
    // Extract disposition from PAYLOAD
    let cleanDisposition = '';
    for (const f of r.payloadFindings) {
      const pj = f.payloadJson;
      cleanDisposition = pj?.Call_Final_Disposition || pj?.Call_Summary?.Call_Final_Disposition || '';
      if (cleanDisposition) break;
    }
    const hasEscalationSummary = r.toolCalls.some(tc => tc.action === 'escalation');

    let summaryParts: string[] = [];
    if (actualTools.length > 0) {
      summaryParts.push(`Session had ${r.toolCalls.length} tool call(s) (${[...new Set(actualTools)].join(', ')}).`);
    } else {
      summaryParts.push('No tool calls detected.');
    }
    if (r.session.hasTransfer || hasEscalationSummary) {
      summaryParts.push('Call was transferred to a live agent.');
    }
    if (cleanDisposition === 'Abandoned') {
      summaryParts.push('Caller abandoned the session.');
    } else if (cleanDisposition) {
      summaryParts.push(`Call disposition: ${cleanDisposition}.`);
    }
    summaryParts.push('No false positive risk.');
    lines.push(summaryParts.join(' '));
  } else if (r.classification === 'FALSE_POSITIVE_WITH_TOOL') {
    lines.push(`Suspicious booking. Tool calls were made but all extracted IDs (${r.allExtractedIds.map(id => `\`${id}\``).join(', ')}) appear to be placeholders, not real appointment IDs.`);
  } else {
    lines.push('Could not conclusively classify this session. Manual review recommended.');
  }
  lines.push('');

  // ── Step-by-Step Discovery ──
  lines.push('---');
  lines.push('');
  lines.push('## Step-by-Step Discovery');
  lines.push('');

  // Step 1: Tool Call Observations — dynamic tool names
  lines.push('### Step 1: Tool Call Observations');
  lines.push('');
  const uniqueToolNames = [...new Set(r.toolCalls.map(tc => tc.name))];
  lines.push(`Found ${r.toolCalls.length} tool call(s) across ${r.session.traceCount} traces using tool(s): ${uniqueToolNames.map(n => `\`${n}\``).join(', ') || 'none'}`);
  lines.push('');
  lines.push(`**Result: ${r.toolCalls.length} tool calls, ${r.bookingToolCallCount === 0 ? 'none are bookings' : `${r.bookingToolCallCount} booking(s)`}:**`);
  lines.push('');
  lines.push('| # | Tool | Action | Level | Key Output |');
  lines.push('|---|------|--------|-------|------------|');
  for (const tc of r.toolCalls) {
    const level = tc.isError ? '**ERROR**' : tc.level;
    const detail = getToolCallDetail(tc);
    const actionDisplay = (tc.action === tc.name || tc.name === 'CurrentDateTime') ? '—' : `\`${tc.action}\``;
    lines.push(`| ${tc.index} | \`${tc.name}\` | ${actionDisplay} | ${level} | ${detail} |`);
  }
  lines.push('');
  if (r.bookingToolCallCount === 0 && r.toolCalls.length > 0) {
    const schedulingCalls = r.toolCalls.filter(tc => tc.name.includes('scheduling'));
    if (schedulingCalls.length > 0) {
      const schedulingActions = schedulingCalls.map(tc => `\`${tc.action}\``).join(', ');
      lines.push(`Scheduling tool was called with action(s) ${schedulingActions}, but no \`book\` or \`book_child\` action was found.`);
    } else {
      lines.push('No scheduling tool calls were found in this session.');
    }
    lines.push('');
  }

  // Step 2: Database Flags — dynamic with inline assessment
  lines.push('### Step 2: Database Session Flags');
  lines.push('');
  lines.push('| Flag | Value | Assessment |');
  lines.push('|------|-------|------------|');
  const bookingFlag = r.session.hasSuccessfulBooking ? '1 (Yes)' : '0 (No)';
  let bookingAssessment = '';
  if (r.classification === 'FALSE_POSITIVE' && r.session.hasSuccessfulBooking) {
    bookingAssessment = 'Incorrectly set — this is the false positive';
  } else if (r.classification === 'FALSE_POSITIVE' && !r.session.hasSuccessfulBooking) {
    bookingAssessment = 'Correct — no real booking occurred';
  } else if (r.classification === 'LEGITIMATE') {
    bookingAssessment = r.session.hasSuccessfulBooking ? 'Matches — real booking confirmed' : 'May need update';
  } else {
    bookingAssessment = r.session.hasSuccessfulBooking ? 'Booking recorded' : 'No booking recorded';
  }
  lines.push(`| has_successful_booking | ${bookingFlag} | ${bookingAssessment} |`);
  lines.push(`| has_transfer | ${r.session.hasTransfer ? '1 (Yes)' : '0 (No)'} | ${r.session.hasTransfer ? 'Call was transferred' : 'No transfer'} |`);
  lines.push(`| has_order | ${r.session.hasOrder ? '1 (Yes)' : '0 (No)'} | ${r.session.hasOrder ? 'Order was placed' : 'No order'} |`);
  lines.push(`| error_count | ${r.session.errorCount} | ${r.session.errorCount > 0 ? `${r.session.errorCount} error(s) during call` : 'No errors'} |`);
  lines.push('');

  // Step 3: PAYLOAD Findings — only if there are findings
  if (r.payloadFindings.length > 0) {
    const step3Title = r.classification === 'FALSE_POSITIVE' ? 'PAYLOAD Contains Fabricated Data' :
      r.classification === 'LEGITIMATE' ? 'PAYLOAD Contains Booking Data' :
      'PAYLOAD Extraction Results';
    lines.push(`### Step 3: ${step3Title}`);
    lines.push('');
    lines.push(`Found ${r.payloadFindings.length} GENERATION observation(s) with appointment IDs:`);
    lines.push('');

    for (let i = 0; i < r.payloadFindings.length; i++) {
      const f = r.payloadFindings[i];
      const timeStr = f.timestamp ? new Date(f.timestamp).toISOString().slice(11, 19) + ' UTC' : 'unknown time';
      lines.push(`**PAYLOAD #${i + 1}** (trace \`${f.traceId.substring(0, 8)}\`, ${timeStr}):`);
      lines.push('');
      if (f.payloadJson && typeof f.payloadJson === 'object') {
        const pj = f.payloadJson;
        // Show all meaningful PAYLOAD keys dynamically
        const filtered: Record<string, any> = {};
        for (const [key, val] of Object.entries(pj)) {
          if (val !== null && val !== undefined && val !== '' && key !== 'Call_Summary') {
            filtered[key] = val;
          }
        }
        // Also flatten Call_Summary if present
        if (pj.Call_Summary && typeof pj.Call_Summary === 'object') {
          for (const [key, val] of Object.entries(pj.Call_Summary)) {
            if (val !== null && val !== undefined && val !== '' && !filtered[key]) {
              filtered[`Call_Summary.${key}`] = val;
            }
          }
        }
        lines.push('```json');
        lines.push(JSON.stringify(filtered, null, 2));
        lines.push('```');
      }
      lines.push('');
    }
  } else {
    lines.push('### Step 3: PAYLOAD Extraction');
    lines.push('');
    lines.push('No PAYLOAD blocks with appointment IDs found in GENERATION observations.');
    lines.push('');
  }

  // Step 4: Appointment ID Verification — dynamic per ID
  const uniqueIds = [...new Set(r.allExtractedIds)];
  if (uniqueIds.length > 0) {
    lines.push('### Step 4: Appointment ID Verification');
    lines.push('');
    lines.push('| Extracted ID | Format | Placeholder? | Assessment |');
    lines.push('|-------------|--------|-------------|------------|');
    for (const id of uniqueIds) {
      const isUUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(id);
      const isInt = /^\d+$/.test(id);
      const isFake = r.placeholderIds.includes(id);
      const format = isUUID ? 'Cloud9 UUID' : isInt ? 'NexHealth integer' : 'Other';
      let assessment = '';
      if (isFake) {
        assessment = 'Known placeholder pattern — hallucinated';
      } else if (r.classification === 'FALSE_POSITIVE') {
        assessment = 'No booking tool call found — likely fabricated';
      } else if (r.classification === 'LEGITIMATE') {
        assessment = 'Booking tool returned this ID — legitimate';
      } else {
        assessment = 'Needs verification against API';
      }
      lines.push(`| \`${id}\` | ${format} | ${isFake ? '**Yes**' : 'No'} | ${assessment} |`);
    }
    lines.push('');
  }

  // ── Call Flow Diagram — fully dynamic from tool calls ──
  lines.push('---');
  lines.push('');
  lines.push('## Call Flow');
  lines.push('');
  const flowLines: string[] = [];
  flowLines.push('```mermaid');
  flowLines.push('sequenceDiagram');
  flowLines.push('    participant C as Caller');
  flowLines.push('    participant L as LLM');
  flowLines.push('    participant T as Tools');
  flowLines.push('    C->>L: Call begins');

  for (const tc of r.toolCalls) {
    const toolLabel = tc.action !== tc.name ? tc.action : tc.name;
    // Sanitize label for Mermaid (remove quotes, special chars)
    const safeLabel = toolLabel.replace(/['"<>]/g, '');
    const detail = getToolCallDetail(tc);
    const safeDetail = detail.replace(/['"<>]/g, '').replace(/\n/g, ' ');
    const shortDetail = safeDetail.length > 35 ? safeDetail.substring(0, 32) + '...' : safeDetail;
    if (tc.isError) {
      flowLines.push(`    L->>T: ${safeLabel}`);
      flowLines.push(`    T--xL: ERROR`);
    } else {
      flowLines.push(`    L->>T: ${safeLabel}`);
      flowLines.push(`    T-->>L: ${shortDetail}`);
    }
  }

  // Dynamic ending based on classification and outcome
  const hasEscalationTool = r.toolCalls.some(tc => tc.action === 'escalation');
  // Extract disposition from PAYLOAD for diagram note
  let diagramDisposition = '';
  for (const f of r.payloadFindings) {
    const pj = f.payloadJson;
    const d = pj?.Call_Final_Disposition || pj?.Call_Summary?.Call_Final_Disposition;
    if (d) { diagramDisposition = d; break; }
  }

  if (r.classification === 'FALSE_POSITIVE') {
    const ids = [...new Set(r.allExtractedIds)].slice(0, 2).join(', ');
    flowLines.push('    Note over L: No booking tool called');
    flowLines.push(`    L->>C: Confirms booking (ID: ${ids})`);
    if (r.session.hasTransfer || hasEscalationTool) {
      flowLines.push('    Note over C: Call also transferred');
    }
    flowLines.push('    Note over C,T: No real appointment exists');
  } else if (r.classification === 'LEGITIMATE') {
    flowLines.push('    L->>C: Booking confirmed');
    if (r.session.hasTransfer || hasEscalationTool) {
      flowLines.push('    Note over C: Call also transferred');
    }
    flowLines.push('    Note over C,T: Real appointment created');
  } else if (r.session.hasTransfer || hasEscalationTool) {
    flowLines.push('    L->>C: Call transferred');
    flowLines.push('    Note over C: Handed off to live agent');
  } else if (diagramDisposition === 'Abandoned') {
    flowLines.push('    Note over C: Caller abandoned');
  } else {
    flowLines.push('    L->>C: Call complete');
    if (diagramDisposition) {
      flowLines.push(`    Note over C: ${diagramDisposition}`);
    }
  }
  flowLines.push('```');
  lines.push(flowLines.join('\n'));
  lines.push('');

  // ── Outcome — dynamic assessment based on what actually happened ──
  lines.push('---');
  lines.push('');
  lines.push('## Outcome');
  lines.push('');
  lines.push('| Aspect | Detail |');
  lines.push('|--------|--------|');

  if (r.classification === 'FALSE_POSITIVE') {
    const childName = r.childNames[0] || 'the patient';
    let apptDesc = '';
    for (const f of r.payloadFindings) {
      const pj = f.payloadJson;
      if (pj?.Child1_Appointment_Details) {
        const d = pj.Child1_Appointment_Details;
        apptDesc = `${d.date || ''} at ${d.time || ''}`.trim();
      }
    }
    // Extract disposition from PAYLOAD if available
    const payloadDisposition = (() => {
      for (const f of r.payloadFindings) {
        const pj = f.payloadJson;
        if (pj?.Call_Final_Disposition) return pj.Call_Final_Disposition;
        if (pj?.Call_Summary?.Call_Final_Disposition) return pj.Call_Summary.Call_Final_Disposition;
      }
      return null;
    })();
    const hasEscalation = r.toolCalls.some(tc => tc.action === 'escalation');

    lines.push(`| **Classification** | FALSE POSITIVE — Hallucinated booking |`);
    lines.push(`| **Patient** | ${childName} |`);
    lines.push(`| **Claimed appointment** | ${apptDesc || 'Details fabricated in PAYLOAD'} |`);
    lines.push(`| **Fabricated ID(s)** | ${[...new Set(r.allExtractedIds)].map(id => `\`${id}\``).join(', ')} |`);
    lines.push(`| **Booking tool called?** | No — ${r.toolCalls.length} tool call(s) made, none were booking actions |`);
    if (r.session.hasTransfer || hasEscalation) {
      lines.push(`| **Transfer** | Call was transferred/escalated to a live agent |`);
    }
    if (payloadDisposition) {
      lines.push(`| **Call disposition** | ${payloadDisposition} |`);
    }
    lines.push(`| **Actual outcome** | **No appointment exists.** Caller may believe they are booked. |`);
  } else if (r.classification === 'LEGITIMATE') {
    const bookActions = r.toolCalls.filter(tc => tc.action === 'book_child' || tc.action === 'book');
    lines.push(`| **Classification** | LEGITIMATE — Real booking confirmed |`);
    lines.push(`| **Booking tool calls** | ${bookActions.length} (${bookActions.map(tc => tc.action).join(', ')}) |`);
    lines.push(`| **Appointment ID(s)** | ${[...new Set(r.allExtractedIds)].map(id => `\`${id}\``).join(', ') || 'N/A'} |`);
    if (r.session.hasTransfer) {
      lines.push(`| **Transfer** | Call was also transferred after booking |`);
    }
    lines.push(`| **Actual outcome** | Appointment was successfully created |`);
  } else if (r.classification === 'CLEAN') {
    // Extract disposition from PAYLOAD
    const disposition = (() => {
      for (const f of r.payloadFindings) {
        const pj = f.payloadJson;
        if (pj?.Call_Final_Disposition) return pj.Call_Final_Disposition;
        if (pj?.Call_Summary?.Call_Final_Disposition) return pj.Call_Summary.Call_Final_Disposition;
      }
      return null;
    })();
    const hasEscalationClean = r.toolCalls.some(tc => tc.action === 'escalation');

    lines.push(`| **Classification** | CLEAN — No booking issues |`);
    lines.push(`| **Tool calls** | ${r.toolCalls.length} total, 0 booking |`);
    if (disposition) {
      lines.push(`| **Call disposition** | ${disposition} |`);
    }
    if (r.session.hasTransfer || hasEscalationClean) {
      lines.push(`| **Transfer** | Call was transferred/escalated |`);
    }
    const outcomeDesc = disposition === 'Abandoned' ? 'Caller abandoned the call' :
      (r.session.hasTransfer || hasEscalationClean) ? 'Call was transferred to a live agent' :
      'Session completed normally, no false positive risk';
    lines.push(`| **Actual outcome** | ${outcomeDesc} |`);
  } else if (r.classification === 'FALSE_POSITIVE_WITH_TOOL') {
    lines.push(`| **Classification** | SUSPICIOUS — Placeholder IDs with tool call |`);
    lines.push(`| **Booking tool calls** | ${r.bookingToolCallCount} |`);
    lines.push(`| **Extracted IDs** | ${r.allExtractedIds.map(id => `\`${id}\``).join(', ')} — all appear to be placeholders |`);
    lines.push(`| **Actual outcome** | Needs manual verification against booking system |`);
  } else {
    lines.push(`| **Classification** | INCONCLUSIVE |`);
    lines.push(`| **Tool calls** | ${r.toolCalls.length} total, ${r.bookingToolCallCount} booking |`);
    lines.push(`| **Extracted IDs** | ${r.allExtractedIds.map(id => `\`${id}\``).join(', ') || 'None'} |`);
    lines.push(`| **Actual outcome** | Could not determine — manual review needed |`);
  }
  lines.push('');

  // ── Appendix: Full Tool Call Details (collapsible) ──
  if (r.toolCalls.length > 0) {
    lines.push('---');
    lines.push('');
    lines.push('## Appendix: Full Tool Call Details');
    lines.push('');
    for (const tc of r.toolCalls) {
      const toolLabel = tc.action !== tc.name ? `${tc.name} → ${tc.action}` : tc.name;
      const levelTag = tc.isError ? ' (ERROR)' : '';
      const timeStr = tc.timestamp ? new Date(tc.timestamp).toISOString().slice(11, 19) + ' UTC' : '';
      lines.push(`<details>`);
      lines.push(`<summary><strong>#${tc.index} ${toolLabel}${levelTag}</strong>${timeStr ? ` — ${timeStr}` : ''}</summary>`);
      lines.push('');
      lines.push('**Input:**');
      lines.push('```json');
      try {
        lines.push(JSON.stringify(tc.input || {}, null, 2));
      } catch {
        lines.push(String(tc.input));
      }
      lines.push('```');
      lines.push('');
      lines.push('**Output:**');
      lines.push('```json');
      try {
        lines.push(JSON.stringify(tc.output || {}, null, 2));
      } catch {
        lines.push(String(tc.output));
      }
      lines.push('```');
      lines.push('');
      lines.push('</details>');
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * GET /api/trace-analysis/:sessionId/investigate/report
 *
 * Returns a full markdown investigation report for a session.
 * Reuses investigateSession logic but renders as markdown.
 */
export const getInvestigationReport = async (req: Request, res: Response): Promise<void> => {
  const { sessionId } = req.params;
  const db = getDb();

  try {
    const session = db.prepare(`
      SELECT session_id, langfuse_config_id, has_successful_booking, has_transfer, has_order,
             trace_count, error_count, first_trace_at, last_trace_at, user_id
      FROM production_sessions WHERE session_id = ?
    `).get(sessionId) as any;

    if (!session) {
      db.close();
      res.status(404).json({ error: `Session "${sessionId}" not found` });
      return;
    }

    const traces = db.prepare(`
      SELECT trace_id, name, started_at FROM production_traces
      WHERE session_id = ? ORDER BY started_at ASC
    `).all(sessionId) as any[];

    const configRow0 = db.prepare('SELECT name FROM langfuse_configs WHERE id = ?').get(session.langfuse_config_id) as any;

    if (traces.length === 0) {
      const emptyResult: InvestigationResult = {
        sessionId,
        classification: 'CLEAN',
        configName: configRow0?.name || `Config ${session.langfuse_config_id}`,
        session: {
          configId: session.langfuse_config_id,
          hasSuccessfulBooking: session.has_successful_booking,
          hasTransfer: session.has_transfer,
          hasOrder: session.has_order,
          traceCount: session.trace_count,
          errorCount: session.error_count,
          firstTraceAt: session.first_trace_at,
          lastTraceAt: session.last_trace_at,
          userId: session.user_id,
        },
        toolCalls: [],
        bookingToolCallCount: 0,
        payloadFindings: [],
        allExtractedIds: [],
        placeholderIds: [],
        callerName: null,
        childNames: [],
        phone: null,
      };
      db.close();
      res.json({ data: { markdown: formatInvestigationMarkdown(emptyResult), classification: 'CLEAN', sessionId } });
      return;
    }

    const traceIds = traces.map((t: any) => t.trace_id);
    const ph = traceIds.map(() => '?').join(',');

    const allObs = db.prepare(`
      SELECT name, type, level, input, output, status_message, started_at, trace_id
      FROM production_trace_observations WHERE trace_id IN (${ph}) ORDER BY started_at ASC
    `).all(...traceIds) as any[];

    const toolObs = allObs.filter((o: any) => ALL_KNOWN_TOOLS_INV.includes(o.name));
    const toolCalls: InvestigationToolCall[] = toolObs.map((obs: any, idx: number) => {
      let input: any = {};
      try { input = typeof obs.input === 'string' ? JSON.parse(obs.input) : obs.input || {}; } catch {}
      let output: any = {};
      try { output = typeof obs.output === 'string' ? JSON.parse(obs.output) : obs.output || {}; } catch {}
      const action = input?.action || (obs.name === 'CurrentDateTime' ? 'getDateTime' : obs.name.includes('Escalation') || obs.name.includes('HandleEscalation') ? 'escalation' : 'unknown');
      const level = obs.level || 'DEFAULT';
      const isError = level === 'ERROR' || (obs.status_message || '').includes('required');
      return { index: idx + 1, name: obs.name, action, level, isError, statusMessage: obs.status_message || null, input, output, timestamp: obs.started_at || '' };
    });

    const bookingToolCalls = toolCalls.filter(tc =>
      SCHEDULING_TOOLS_INV.includes(tc.name) && (tc.action === 'book_child' || tc.action === 'book')
    );

    const generationObs = allObs.filter((o: any) => o.type === 'GENERATION' && o.output);
    const childApptIdRegex = /Child[12]_appointmentId\\?["']?\s*[:=]\s*\\?["']?([A-Za-z0-9_-]+)/g;
    const childApptGuidRegex = /Child[12]_appointmentGUID\\?["']?\s*[:=]\s*\\?["']?([0-9A-Fa-f-]{36})/g;
    const childPatientIdRegex = /Child[12]_patientId\\?["']?\s*[:=]\s*\\?["']?(\d+)/g;
    const childNameRegex = /Child[12]_(?:First)?Name\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/g;
    const callerNameRegex = /Caller_Name\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/;
    const parentPatientIdRegex = /Parent_patientId\\?["']?\s*[:=]\s*\\?["']?(\d+)/;

    const payloadFindings: PayloadFinding[] = [];
    for (const gen of generationObs) {
      const out = typeof gen.output === 'string' ? gen.output : JSON.stringify(gen.output || '');
      if (!out.includes('PAYLOAD')) continue;

      const apptIds: string[] = [];
      const apptGuids: string[] = [];
      const patientIds: string[] = [];
      const childNames: string[] = [];
      let m: RegExpExecArray | null;

      const r1 = new RegExp(childApptIdRegex.source, 'g');
      while ((m = r1.exec(out)) !== null) apptIds.push(m[1]);
      const r2 = new RegExp(childApptGuidRegex.source, 'g');
      while ((m = r2.exec(out)) !== null) apptGuids.push(m[1]);
      const r3 = new RegExp(childPatientIdRegex.source, 'g');
      while ((m = r3.exec(out)) !== null) patientIds.push(m[1]);
      const r4 = new RegExp(childNameRegex.source, 'g');
      while ((m = r4.exec(out)) !== null) childNames.push(m[1].trim());

      const callerMatch = out.match(callerNameRegex);
      const parentMatch = out.match(parentPatientIdRegex);

      let payloadJson: any = null;
      const payloadStart = out.indexOf('PAYLOAD');
      if (payloadStart !== -1) {
        const braceStart = out.indexOf('{', payloadStart);
        if (braceStart !== -1) {
          let depth = 0; let braceEnd = -1;
          for (let i = braceStart; i < out.length; i++) {
            if (out[i] === '{') depth++;
            else if (out[i] === '}') { depth--; if (depth === 0) { braceEnd = i + 1; break; } }
          }
          if (braceEnd !== -1) {
            try { payloadJson = JSON.parse(out.substring(braceStart, braceEnd).replace(/\\"/g, '"').replace(/\\n/g, '\n')); }
            catch { payloadJson = out.substring(braceStart, Math.min(braceEnd, braceStart + 2000)); }
          }
        }
      }

      if (apptIds.length > 0 || apptGuids.length > 0) {
        payloadFindings.push({
          traceId: gen.trace_id,
          timestamp: gen.started_at || '',
          apptIds, apptGuids, patientIds, childNames,
          callerName: callerMatch ? callerMatch[1].trim() : null,
          parentPatientId: parentMatch ? parentMatch[1] : null,
          payloadJson,
        });
      }
    }

    const allExtractedIds = payloadFindings.flatMap(f => [...f.apptIds, ...f.apptGuids]);
    const placeholderIds = allExtractedIds.filter(isPlaceholderId);
    const realLookingIds = allExtractedIds.filter(id => !isPlaceholderId(id));
    const hasBookingTool = bookingToolCalls.length > 0;

    let classification: InvestigationResult['classification'];
    if (payloadFindings.length === 0) {
      classification = 'CLEAN';
    } else if (hasBookingTool && realLookingIds.length > 0) {
      classification = 'LEGITIMATE';
    } else if (!hasBookingTool && realLookingIds.length > 0) {
      // Non-placeholder IDs exist but no booking tool was called = hallucinated
      classification = 'FALSE_POSITIVE';
    } else if (!hasBookingTool && allExtractedIds.length > 0 && realLookingIds.length === 0) {
      // Only placeholder IDs (null, N/A, TBD, etc.) with no booking tool = empty PAYLOAD template
      classification = 'CLEAN';
    } else if (hasBookingTool && placeholderIds.length > 0 && realLookingIds.length === 0) {
      classification = 'FALSE_POSITIVE_WITH_TOOL';
    } else {
      classification = 'INCONCLUSIVE';
    }

    const phoneMatch = sessionId.match(/\+\d+/);
    const callerName = payloadFindings.find(f => f.callerName)?.callerName || session.user_id || null;
    const childNamesList = [...new Set(payloadFindings.flatMap(f => f.childNames))];
    const configRow = db.prepare('SELECT name FROM langfuse_configs WHERE id = ?').get(session.langfuse_config_id) as any;

    const result: InvestigationResult = {
      sessionId,
      classification,
      configName: configRow?.name || `Config ${session.langfuse_config_id}`,
      session: {
        configId: session.langfuse_config_id,
        hasSuccessfulBooking: session.has_successful_booking,
        hasTransfer: session.has_transfer,
        hasOrder: session.has_order,
        traceCount: session.trace_count,
        errorCount: session.error_count,
        firstTraceAt: session.first_trace_at,
        lastTraceAt: session.last_trace_at,
        userId: session.user_id,
      },
      toolCalls,
      bookingToolCallCount: bookingToolCalls.length,
      payloadFindings,
      allExtractedIds,
      placeholderIds,
      callerName,
      childNames: childNamesList,
      phone: phoneMatch ? phoneMatch[0] : null,
    };

    db.close();
    res.json({
      data: {
        markdown: formatInvestigationMarkdown(result),
        classification: result.classification,
        sessionId: result.sessionId,
      },
    });
  } catch (err: any) {
    db.close();
    res.status(500).json({ error: err.message });
  }
};

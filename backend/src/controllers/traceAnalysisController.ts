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
import { getAllKnownToolNames, getToolNamesForConfig, getTenantIdForConfig } from '../services/toolNameResolver';
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

function analyzeToolError(_name: string, action: string, _input: any, output: any, statusMessage: string | null, rawOutput?: string | null): string {
  if (statusMessage?.includes('phoneNumber is required')) {
    return 'The patient lookup action requires a phone number, but none was provided. This typically happens early in the call before the caller shares their phone number.';
  }
  if (statusMessage?.includes('not found') || output?.error?.includes?.('not found')) {
    return `No matching record found for the ${action} request. The search criteria may not match any existing records.`;
  }
  if (output?._debug_error) {
    return `Tool returned an error: ${output._debug_error}`;
  }
  if (output?.success === false && output?.error) {
    return `Tool returned an error: ${typeof output.error === 'string' ? output.error : JSON.stringify(output.error)}`;
  }
  if (output?.success === false && output?.message) {
    return `Tool returned an error: ${output.message}`;
  }
  if (rawOutput) {
    return `Tool returned: ${rawOutput.substring(0, 300)}`;
  }
  if (!output || Object.keys(output).length === 0) {
    return statusMessage
      ? `Tool error: ${statusMessage}`
      : 'The tool returned an empty response, which may indicate a timeout or connectivity issue with the upstream API.';
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
    let rawOutputStr: string | null = null;
    const output = (() => {
      if (obs.output == null) return {};
      if (typeof obs.output === 'string') {
        try { return JSON.parse(obs.output); }
        catch { rawOutputStr = obs.output; return {}; }
      }
      return obs.output;
    })();
    const action = input?.action || 'unknown';

    let status: 'success' | 'error' | 'partial' = 'success';
    if (output?.partialSuccess) status = 'partial';
    else if (output?.success === false || obs.level === 'ERROR' || output?._debug_error) status = 'error';

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
      // Use raw output string if parsed output is empty
      if (rawOutputStr) {
        outputSummary = rawOutputStr.substring(0, 200);
      } else {
        const outStr = JSON.stringify(output);
        outputSummary = outStr === '{}' ? (obs.status_message || 'no output') : outStr.substring(0, 100);
      }
    }

    // For error cases, ensure outputSummary shows the actual error, not "{}"
    if (status === 'error' && (outputSummary === '{}' || !outputSummary)) {
      const errMsg = output?._debug_error || output?.error || output?.message || output?.errorMessage;
      if (errMsg) {
        outputSummary = typeof errMsg === 'string' ? errMsg.substring(0, 200) : JSON.stringify(errMsg).substring(0, 200);
      } else if (rawOutputStr) {
        outputSummary = rawOutputStr.substring(0, 200);
      } else if (obs.status_message) {
        outputSummary = obs.status_message;
      } else {
        outputSummary = 'ERROR (no details available)';
      }
    }

    const toolCall: CallReportToolCall = { name: obs.name, action, timestamp: startTime, durationMs, inputSummary, outputSummary, status };
    toolCall.fullInput = input;
    // Use raw output as fullOutput if parsed output is empty
    if (rawOutputStr && JSON.stringify(output) === '{}') {
      // Try to parse raw string one more time for display; otherwise wrap it
      try {
        toolCall.fullOutput = JSON.parse(rawOutputStr);
      } catch {
        toolCall.fullOutput = { _rawError: rawOutputStr };
      }
    } else {
      toolCall.fullOutput = output;
    }
    if (status === 'error' || status === 'partial') {
      toolCall.statusMessage = obs.status_message || undefined;
      toolCall.errorAnalysis = analyzeToolError(obs.name, action, input, output, obs.status_message || null, rawOutputStr);
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

const KNOWN_PLACEHOLDERS = ['123456789', '987654321', '1234567890', 'APPT123456', 'null', 'undefined', 'N/A', 'TBD'];

function isPlaceholderId(id: string, tenantId: number): boolean {
  if (KNOWN_PLACEHOLDERS.includes(id) || /^(APPT|TEST|FAKE|DEMO)\d+$/i.test(id) || id === 'null') return true;
  if (tenantId === 1) {
    // Ortho: real IDs are Cloud9 GUIDs (8-4-4-4-12 hex)
    if (id === '00000000-0000-0000-0000-000000000000') return true;
    if (!/^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$/.test(id)) return true;
  } else if (tenantId === 5) {
    // Chord: real IDs are NexHealth numeric integers
    if (!/^\d+$/.test(id)) return true;
  }
  return false;
}

/** Shared brace-depth JSON parser for PAYLOAD blocks */
function extractPayloadJson(text: string): any | null {
  const payloadStart = text.indexOf('PAYLOAD');
  if (payloadStart === -1) return null;
  const braceStart = text.indexOf('{', payloadStart);
  if (braceStart === -1) return null;
  let depth = 0; let braceEnd = -1;
  for (let i = braceStart; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) { braceEnd = i + 1; break; } }
  }
  if (braceEnd === -1) return null;
  try {
    return JSON.parse(text.substring(braceStart, braceEnd).replace(/\\"/g, '"').replace(/\\n/g, '\n'));
  } catch {
    return text.substring(braceStart, Math.min(braceEnd, braceStart + 2000));
  }
}

/** Extract PAYLOAD findings from GENERATION observations (works for both Ortho and Chord) */
function extractPayloadFindings(generationObs: any[]): PayloadFinding[] {
  // Regex patterns — case-insensitive for Child/child prefix to handle both tenants
  const childApptIdRe = /[Cc]hild[12]_appointmentId\\?["']?\s*[:=]\s*\\?["']?([A-Za-z0-9_-]+)/g;
  const childApptGuidRe = /[Cc]hild[12]_appointmentGUID\\?["']?\s*[:=]\s*\\?["']?([0-9A-Fa-f-]{8,36})/g;
  const childPatientIdRe = /[Cc]hild[12]_patient(?:Id|GUID)\\?["']?\s*[:=]\s*\\?["']?([A-Za-z0-9-]+)/g;
  const childNameRe = /[Cc]hild[12]_(?:First)?Name\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/g;
  const callerNameRe = /[Cc]aller_Name\\?["']?\s*[:=]\s*\\?["']?([^"'\\,}\n]+)/;
  const parentPatientIdRe = /[Pp]arent_patient(?:Id|GUID)\\?["']?\s*[:=]\s*\\?["']?([A-Za-z0-9-]+)/;

  const findings: PayloadFinding[] = [];
  for (const gen of generationObs) {
    const out = typeof gen.output === 'string' ? gen.output : JSON.stringify(gen.output || '');
    if (!out.includes('PAYLOAD')) continue;

    const apptIds: string[] = [];
    const apptGuids: string[] = [];
    const patientIds: string[] = [];
    const childNames: string[] = [];
    let m: RegExpExecArray | null;

    // Regex-based extraction from raw text
    const r1 = new RegExp(childApptIdRe.source, 'g');
    while ((m = r1.exec(out)) !== null) apptIds.push(m[1]);
    const r2 = new RegExp(childApptGuidRe.source, 'g');
    while ((m = r2.exec(out)) !== null) apptGuids.push(m[1]);
    const r3 = new RegExp(childPatientIdRe.source, 'g');
    while ((m = r3.exec(out)) !== null) patientIds.push(m[1]);
    const r4 = new RegExp(childNameRe.source, 'g');
    while ((m = r4.exec(out)) !== null) childNames.push(m[1].trim());

    const callerMatch = out.match(callerNameRe);
    const parentMatch = out.match(parentPatientIdRe);
    const payloadJson = extractPayloadJson(out);

    // JSON-based fallback: extract from parsed PAYLOAD to catch any naming convention
    if (payloadJson && typeof payloadJson === 'object') {
      const cs = payloadJson.Call_Summary || payloadJson;
      if (cs && typeof cs === 'object') {
        for (const key of Object.keys(cs)) {
          const val = cs[key];
          if (typeof val !== 'string' || !val) continue;
          if (/^[Cc]hild\d+_appointmentGUID$/i.test(key) && !apptGuids.includes(val)) apptGuids.push(val);
          if (/^[Cc]hild\d+_appointmentId$/i.test(key) && !apptIds.includes(val)) apptIds.push(val);
          if (/^[Cc]hild\d+_patient(?:Id|GUID)$/i.test(key) && !patientIds.includes(val)) patientIds.push(val);
          if (/^[Cc]hild\d+_(?:First)?Name$/i.test(key) && !childNames.includes(val.trim())) childNames.push(val.trim());
        }
      }
    }

    if (apptIds.length > 0 || apptGuids.length > 0) {
      findings.push({
        traceId: gen.trace_id,
        timestamp: gen.started_at || '',
        apptIds, apptGuids, patientIds, childNames,
        callerName: callerMatch ? callerMatch[1].trim() : null,
        parentPatientId: parentMatch ? parentMatch[1] : null,
        payloadJson,
      });
    }
  }
  return findings;
}

/** Check: did the LLM confirm a booking to the caller? (works for both tenants — same flat PAYLOAD format) */
function checkConfirmedBooking(payloadFindings: PayloadFinding[], _tenantId: number): boolean {
  return payloadFindings.some(f => {
    const pj = f.payloadJson;
    if (!pj || typeof pj !== 'object') return false;

    // Both Ortho and Chord use the same flat PAYLOAD: Child1_Intent_Complete, Child1_Final_Disposition, etc.
    const cs = pj.Call_Summary || pj;
    const disposition = cs.Child1_Final_Disposition || cs.child1_Final_Disposition || '';
    const intentComplete = cs.Child1_Intent_Complete || cs.child1_Intent_Complete || '';
    const apptDetails = cs.Child1_Appointment_Details || cs.child1_Appointment_Details;
    const disposition2 = cs.Child2_Final_Disposition || cs.child2_Final_Disposition || '';
    const intentComplete2 = cs.Child2_Intent_Complete || cs.child2_Intent_Complete || '';

    const hasScheduleIntent = intentComplete === 'Schedule' || intentComplete2 === 'Schedule';
    const hasIntentComplete = disposition.includes('Intent Complete') || disposition2.includes('Intent Complete');
    const hasApptDetails = apptDetails && typeof apptDetails === 'object' && apptDetails.date;

    return (hasScheduleIntent && hasIntentComplete) || (hasScheduleIntent && hasApptDetails);
  });
}

/** Disposition extraction from PAYLOAD (same flat format for all tenants) */
function extractDisposition(payloadFindings: PayloadFinding[], _tenantId: number): string {
  for (const f of payloadFindings) {
    const pj = f.payloadJson;
    if (!pj || typeof pj !== 'object') continue;
    const cs = pj.Call_Summary || pj;
    const d = cs.Call_Final_Disposition || cs.call_Final_Disposition;
    if (d) return d;
  }
  return '';
}

/** Appointment description extraction from PAYLOAD (same flat format for all tenants) */
function extractAppointmentDescription(payloadFindings: PayloadFinding[], _tenantId: number): string {
  for (const f of payloadFindings) {
    const pj = f.payloadJson;
    if (!pj || typeof pj !== 'object') continue;
    const cs = pj.Call_Summary || pj;
    const d = cs.Child1_Appointment_Details || cs.child1_Appointment_Details;
    if (d && typeof d === 'object') {
      return `${d.day_of_week || ''}, ${d.date || ''} at ${d.time || ''}`.trim();
    }
    const apptType = cs.Child1_Appointment_Type || cs.child1_Appointment_Type;
    if (apptType) {
      return `a ${apptType.toLowerCase()}`;
    }
  }
  return '';
}

// ── Recommended Fixes Types & Constants ─────────────────────────────────────

type FixSeverity = 'Critical' | 'Warning' | 'Info';
type ArtifactTarget = 'system_prompt' | 'scheduling_tool' | 'patient_tool' | 'nodered_flow';

interface RecommendedFix {
  severity: FixSeverity;
  target: ArtifactTarget;
  issue: string;
  recommendation: string;
  fixApplied?: string; // e.g. "v92" — version where fix was shipped
}

const ARTIFACT_META: Record<ArtifactTarget, { label: string; file: string }> = {
  system_prompt:   { label: 'System Prompt',   file: 'docs/v1/Chord_Cloud9_SystemPrompt.md' },
  scheduling_tool: { label: 'Scheduling Tool', file: 'docs/v1/scheduling_tool_func.js' },
  patient_tool:    { label: 'Patient Tool',    file: 'docs/v1/patient_tool_func.js' },
  nodered_flow:    { label: 'Node-RED Flows',  file: 'nodered/nodered_Cloud9_flows.json' },
};

interface InvestigationToolCall {
  index: number;
  name: string;
  action: string;
  level: string;
  isError: boolean;
  statusMessage: string | null;
  input: Record<string, any>;
  output: Record<string, any>;
  rawOutput: string | null;
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

interface BookingDetail {
  childName: string;
  childDob: string | null;
  childAge: string | null;
  appointmentGuid: string | null;    // Cloud9 GUID (Ortho) or NexHealth ID (Chord)
  appointmentDate: string | null;    // e.g. "3/17/2026 9:50:00 AM" or "2026-03-17"
  appointmentTime: string | null;    // e.g. "9:50 AM" or "2:30 PM"
  appointmentDayOfWeek: string | null;
  appointmentType: string | null;    // e.g. "Exam - PPO/Self" or "New Patient Cleaning and Exam"
  appointmentMinutes: number | null;
  locationName: string | null;
  providerName: string | null;
  chair: string | null;
  status: string | null;             // "active", "cancelled", "placeholder"
  patientGuid: string | null;
  isNewPatient: boolean;
  // Caller / guarantor info
  callerName: string | null;
  callerPhone: string | null;
  callerEmail: string | null;
  callerDob: string | null;
  // Insurance
  insuranceProvider: string | null;
  insuranceMemberId: string | null;
  // Extra
  specialNeeds: string | null;
  interactionSummary: string | null;
  disposition: string | null;
}

interface InvestigationResult {
  sessionId: string;
  tenantId: number;  // 1=Ortho (Cloud9), 5=Chord (NexHealth)
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
  bookingDetails: BookingDetail[];
}

/** Extract detailed booking information from tool outputs, PAYLOAD, and prod_test_records */
function extractBookingDetails(
  bookingToolCalls: InvestigationToolCall[],
  payloadFindings: PayloadFinding[],
  db: BetterSqlite3.Database,
  sessionId: string,
  tenantId: number,
): BookingDetail[] {
  const details: BookingDetail[] = [];
  const seenGuids = new Set<string>();

  // Get the final (termination) PAYLOAD for caller/insurance info
  const finalPayload = payloadFindings.length > 0
    ? payloadFindings[payloadFindings.length - 1].payloadJson
    : null;
  const cs = finalPayload?.Call_Summary || finalPayload || {};

  // Helper: case-insensitive field access from Call_Summary
  const csGet = (key: string): string | null => {
    const v = cs[key] ?? cs[key.charAt(0).toLowerCase() + key.slice(1)];
    return v && typeof v === 'string' && v !== 'Not Provided' && v !== 'null' ? v : null;
  };

  // Shared caller/insurance info from PAYLOAD
  const callerInfo = {
    callerName: csGet('Caller_Name') || csGet('guarantor_FirstName') ? `${csGet('guarantor_FirstName') || csGet('guarantor_firstName') || ''} ${csGet('guarantor_LastName') || csGet('guarantor_lastName') || ''}`.trim() || null : null,
    callerPhone: csGet('Contact_Number') || csGet('ANI'),
    callerEmail: csGet('Email'),
    callerDob: csGet('guarantor_DOB'),
    insuranceProvider: csGet('insurance_provider'),
    insuranceMemberId: csGet('insurance_member_id'),
    specialNeeds: csGet('special_needs'),
    interactionSummary: csGet('Interaction_Summary'),
    disposition: csGet('Call_Final_Disposition'),
    isNewPatient: cs.new_patient === true || cs.new_patient === 'true',
  };

  // 1. Extract from book_child tool outputs (most accurate — real booking data)
  for (const tc of bookingToolCalls) {
    const out = tc.output;
    if (!out?.success || !out?.children) continue;
    const children = Array.isArray(out.children) ? out.children : [];
    for (const child of children) {
      if (!child.appointment?.booked) continue;
      const guid = child.appointment?.appointmentGUID || child.appointment?.appointmentId;
      if (guid && seenGuids.has(guid)) continue;
      if (guid) seenGuids.add(guid);

      // Parse startTime
      let apptDate: string | null = null;
      let apptTime: string | null = null;
      let apptDow: string | null = null;
      const st = child.appointment?.startTime || '';
      if (st) {
        // "3/17/2026 9:50:00 AM" or ISO format
        const parts = st.split(' ');
        apptDate = parts[0] || null;
        apptTime = parts.slice(1).join(' ').replace(/:00 /, ' ') || null;
      }

      details.push({
        childName: `${child.firstName || ''} ${child.lastName || out.parent?.lastName || ''}`.trim(),
        childDob: null,
        childAge: null,
        appointmentGuid: guid || null,
        appointmentDate: apptDate,
        appointmentTime: apptTime,
        appointmentDayOfWeek: apptDow,
        appointmentType: null,
        appointmentMinutes: null,
        locationName: null,
        providerName: null,
        chair: null,
        status: 'active',
        patientGuid: child.patientGUID || child.patientId || null,
        ...callerInfo,
      });
    }
  }

  // 2. Enrich from prod_test_records (has provider, location, appt type, chair, etc.)
  try {
    const prodRecords = db.prepare(`
      SELECT * FROM prod_test_records
      WHERE session_id = ?
      ORDER BY status ASC, created_at DESC
    `).all(sessionId) as any[]; // status ASC puts 'active' before 'cancelled'

    for (const rec of prodRecords) {
      const guid = rec.appointment_guid || rec.patient_id;
      // Find existing detail by matching GUID, or add new if not from tool output
      let detail = details.find(d => d.appointmentGuid === guid);
      if (!detail && guid && !seenGuids.has(guid)) {
        seenGuids.add(guid);
        detail = {
          childName: `${rec.patient_first_name || ''} ${rec.patient_last_name || ''}`.trim() || 'Unknown',
          childDob: rec.patient_birthdate || null,
          childAge: null,
          appointmentGuid: guid,
          appointmentDate: null, appointmentTime: null, appointmentDayOfWeek: null,
          appointmentType: null, appointmentMinutes: null,
          locationName: null, providerName: null, chair: null,
          status: rec.status || 'active',
          patientGuid: rec.patient_guid || null,
          ...callerInfo,
        };
        details.push(detail);
      }
      if (detail) {
        // Enrich with prod_test_records fields
        if (rec.appointment_type) detail.appointmentType = rec.appointment_type;
        if (rec.appointment_minutes) detail.appointmentMinutes = rec.appointment_minutes;
        if (rec.location_name) detail.locationName = rec.location_name;
        if (rec.provider_name) detail.providerName = rec.provider_name;
        if (rec.chair) detail.chair = rec.chair;
        if (rec.status) detail.status = rec.status;
        if (rec.appointment_datetime) {
          const parts = rec.appointment_datetime.split(' ');
          detail.appointmentDate = parts[0] || detail.appointmentDate;
          detail.appointmentTime = parts.slice(1).join(' ').replace(/:00 /, ' ') || detail.appointmentTime;
        }
        if (rec.patient_first_name && !detail.childName) {
          detail.childName = `${rec.patient_first_name} ${rec.patient_last_name || ''}`.trim();
        }
      }
    }
  } catch { /* prod_test_records may not exist */ }

  // 3. Enrich from PAYLOAD Call_Summary (child DOB/age, appointment details, location)
  for (const detail of details) {
    // Child DOB/age from PAYLOAD
    if (!detail.childDob) detail.childDob = csGet('Child1_DOB');
    if (!detail.childAge) detail.childAge = csGet('Child1_Age');

    // Appointment type from PAYLOAD (Chord has this)
    if (!detail.appointmentType) {
      detail.appointmentType = csGet('Child1_Appointment_Type');
    }

    // Appointment details from PAYLOAD (Chord structured format)
    const apptDetails = cs.Child1_Appointment_Details || cs.child1_Appointment_Details;
    if (apptDetails && typeof apptDetails === 'object') {
      if (!detail.appointmentDate && apptDetails.date) detail.appointmentDate = apptDetails.date;
      if (!detail.appointmentTime && apptDetails.time) detail.appointmentTime = apptDetails.time;
      if (!detail.appointmentDayOfWeek && apptDetails.day_of_week) detail.appointmentDayOfWeek = apptDetails.day_of_week;
    }

    // Ortho: parse offered_slot string "startTime=3/17/2026 9:50:00 AM,..."
    if (!detail.appointmentTime) {
      const offeredSlot = csGet('Child1_offered_slot');
      if (offeredSlot) {
        const stMatch = offeredSlot.match(/startTime=([^,]+)/);
        if (stMatch) {
          const parts = stMatch[1].split(' ');
          if (!detail.appointmentDate) detail.appointmentDate = parts[0] || null;
          detail.appointmentTime = parts.slice(1).join(' ').replace(/:00 /, ' ') || null;
        }
      }
    }

    // Location from PAYLOAD
    if (!detail.locationName) {
      detail.locationName = csGet('location_name') || csGet('Call_Location');
    }

    // Child last name from PAYLOAD if still missing
    if (detail.childName && !detail.childName.includes(' ')) {
      const ln = csGet('Child1_LastName');
      if (ln) detail.childName = `${detail.childName} ${ln}`;
    }
  }

  // 4. For FALSE_POSITIVE / Chord sessions with no tool bookings, build from PAYLOAD only
  if (details.length === 0 && payloadFindings.length > 0) {
    const apptGuid = csGet('Child1_appointmentGUID') || csGet('Child1_appointmentId');
    const childFirst = csGet('Child1_FirstName');
    if (apptGuid || childFirst) {
      const apptDetails = cs.Child1_Appointment_Details || cs.child1_Appointment_Details;
      details.push({
        childName: `${childFirst || ''} ${csGet('Child1_LastName') || ''}`.trim() || 'Unknown',
        childDob: csGet('Child1_DOB'),
        childAge: csGet('Child1_Age'),
        appointmentGuid: apptGuid,
        appointmentDate: apptDetails?.date || null,
        appointmentTime: apptDetails?.time || null,
        appointmentDayOfWeek: apptDetails?.day_of_week || null,
        appointmentType: csGet('Child1_Appointment_Type'),
        appointmentMinutes: null,
        locationName: csGet('location_name') || csGet('Call_Location'),
        providerName: null,
        chair: null,
        status: apptGuid && !isPlaceholderId(apptGuid, tenantId) ? 'active' : 'placeholder',
        patientGuid: csGet('Child1_patientId') || csGet('Child1_patientGUID'),
        ...callerInfo,
      });
    }
  }

  return details;
}

/**
 * Shared investigation logic used by both investigateSession and getInvestigationReport.
 * Returns null if session not found.
 */
function runInvestigation(sessionId: string, db: BetterSqlite3.Database): InvestigationResult | null {
  const session = db.prepare(`
    SELECT session_id, langfuse_config_id, has_successful_booking, has_transfer, has_order,
           trace_count, error_count, first_trace_at, last_trace_at, user_id
    FROM production_sessions WHERE session_id = ?
  `).get(sessionId) as any;

  if (!session) return null;

  const configId = session.langfuse_config_id;
  const tenantId = getTenantIdForConfig(db, configId);
  const toolNames = getToolNamesForConfig(db, configId);

  const traces = db.prepare(`
    SELECT trace_id, name, started_at FROM production_traces
    WHERE session_id = ? ORDER BY started_at ASC
  `).all(sessionId) as any[];

  const configRow = db.prepare('SELECT name FROM langfuse_configs WHERE id = ?').get(configId) as any;
  const configName = configRow?.name || `Config ${configId}`;

  const baseSession = {
    configId,
    hasSuccessfulBooking: session.has_successful_booking,
    hasTransfer: session.has_transfer,
    hasOrder: session.has_order,
    traceCount: session.trace_count,
    errorCount: session.error_count,
    firstTraceAt: session.first_trace_at,
    lastTraceAt: session.last_trace_at,
    userId: session.user_id,
  };

  if (traces.length === 0) {
    return {
      sessionId, tenantId, classification: 'CLEAN', configName,
      session: baseSession,
      toolCalls: [], bookingToolCallCount: 0, payloadFindings: [],
      allExtractedIds: [], placeholderIds: [],
      callerName: null, childNames: [], phone: null, bookingDetails: [],
    };
  }

  const traceIds = traces.map((t: any) => t.trace_id);
  const ph = traceIds.map(() => '?').join(',');

  const allObs = db.prepare(`
    SELECT name, type, level, input, output, status_message, started_at, trace_id
    FROM production_trace_observations WHERE trace_id IN (${ph}) ORDER BY started_at ASC
  `).all(...traceIds) as any[];

  // Filter tool observations using tenant-specific tool names
  const toolObs = allObs.filter((o: any) => toolNames.all.includes(o.name));
  const toolCalls: InvestigationToolCall[] = toolObs.map((obs: any, idx: number) => {
    let input: any = {};
    try { input = typeof obs.input === 'string' ? JSON.parse(obs.input) : obs.input || {}; } catch {}
    let output: any = {};
    let rawOutput: string | null = null;
    if (obs.output != null) {
      if (typeof obs.output === 'string') {
        try {
          output = JSON.parse(obs.output);
        } catch {
          // Preserve the raw error string when JSON parse fails
          rawOutput = obs.output;
        }
      } else {
        output = obs.output;
      }
    }
    const action = input?.action || (toolNames.dateTimeTools.includes(obs.name) ? 'getDateTime' : obs.name.includes('Escalation') || obs.name.includes('HandleEscalation') ? 'escalation' : 'unknown');
    const level = obs.level || 'DEFAULT';
    const outputStr = rawOutput || JSON.stringify(output);
    const hasOutputError = outputStr.includes('"success":false') || outputStr.includes('"success": false') || outputStr.includes('_debug_error');
    const isError = level === 'ERROR' || (obs.status_message || '').includes('required') || hasOutputError;
    return { index: idx + 1, name: obs.name, action, level, isError, statusMessage: obs.status_message || null, input, output, rawOutput, timestamp: obs.started_at || '' };
  });

  // Booking tool calls using tenant-specific scheduling tool names
  const bookingToolCalls = toolCalls.filter(tc =>
    toolNames.schedulingTools.includes(tc.name) && (tc.action === 'book_child' || tc.action === 'book')
  );

  // PAYLOAD scanning — tenant-specific extraction
  const generationObs = allObs.filter((o: any) => o.type === 'GENERATION' && o.output);
  const payloadFindings = extractPayloadFindings(generationObs);

  // Classification
  const allExtractedIds = payloadFindings.flatMap(f => [...f.apptIds, ...f.apptGuids]);
  const placeholderIds = allExtractedIds.filter(id => isPlaceholderId(id, tenantId));
  const realLookingIds = allExtractedIds.filter(id => !isPlaceholderId(id, tenantId));
  const hasBookingTool = bookingToolCalls.length > 0;

  let classification: InvestigationResult['classification'];
  if (payloadFindings.length === 0) {
    classification = 'CLEAN';
  } else if (hasBookingTool && realLookingIds.length > 0) {
    classification = 'LEGITIMATE';
  } else if (!hasBookingTool && realLookingIds.length > 0) {
    classification = 'FALSE_POSITIVE';
  } else if (!hasBookingTool && allExtractedIds.length > 0 && realLookingIds.length === 0) {
    const confirmedBooking = checkConfirmedBooking(payloadFindings, tenantId);
    classification = confirmedBooking ? 'FALSE_POSITIVE' : 'CLEAN';
  } else if (!hasBookingTool && payloadFindings.length > 0 && allExtractedIds.length === 0) {
    // Booking claim in PAYLOAD (e.g. Ortho callSummary.booked) but no IDs extracted
    const confirmedBooking = checkConfirmedBooking(payloadFindings, tenantId);
    classification = confirmedBooking ? 'FALSE_POSITIVE' : 'CLEAN';
  } else if (hasBookingTool && placeholderIds.length > 0 && realLookingIds.length === 0) {
    classification = 'FALSE_POSITIVE_WITH_TOOL';
  } else {
    classification = 'INCONCLUSIVE';
  }

  const phoneMatch = sessionId.match(/\+\d+/);
  const callerName = payloadFindings.find(f => f.callerName)?.callerName || session.user_id || null;
  const childNamesList = [...new Set(payloadFindings.flatMap(f => f.childNames))];

  // ── Build booking details from tool outputs, PAYLOAD, and prod_test_records ──
  const bookingDetails = extractBookingDetails(bookingToolCalls, payloadFindings, db, sessionId, tenantId);

  return {
    sessionId,
    tenantId,
    classification,
    configName,
    session: baseSession,
    toolCalls,
    bookingToolCallCount: bookingToolCalls.length,
    payloadFindings,
    allExtractedIds,
    placeholderIds,
    callerName,
    childNames: childNamesList,
    phone: phoneMatch ? phoneMatch[0] : null,
    bookingDetails,
  };
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
    const result = runInvestigation(sessionId, db);
    db.close();
    if (!result) {
      res.status(404).json({ error: `Session "${sessionId}" not found` });
      return;
    }
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
    // Try to extract a clean error message from multiple sources
    let detail = '';

    // 1. Check parsed output for standard error fields
    const out = tc.output;
    if (out?._debug_error) {
      detail = typeof out._debug_error === 'string' ? out._debug_error : JSON.stringify(out._debug_error);
    } else if (out?.message) {
      detail = typeof out.message === 'string' ? out.message : JSON.stringify(out.message);
    } else if (out?.error) {
      detail = typeof out.error === 'string' ? out.error : JSON.stringify(out.error);
    } else if (out?.errorMessage) {
      detail = typeof out.errorMessage === 'string' ? out.errorMessage : JSON.stringify(out.errorMessage);
    }

    // 2. If no error from output fields, check rawOutput (unparseable string from tool)
    if (!detail && tc.rawOutput) {
      detail = tc.rawOutput;
    }

    // 3. Fall back to statusMessage
    if (!detail && tc.statusMessage) {
      detail = tc.statusMessage;
    }

    // 4. If output has success:false but no error message, describe what we have
    if (!detail && out) {
      const outStr = JSON.stringify(out);
      if (outStr !== '{}' && outStr !== 'null') {
        detail = outStr;
      }
    }

    // 5. Last resort
    if (!detail) {
      detail = 'ERROR (no details available)';
    }

    // Try to parse JSON error strings for a clean message
    if (detail.startsWith('{') || detail.startsWith('Error:')) {
      try {
        const parsed = JSON.parse(detail.replace(/^Error:\s*/, ''));
        detail = parsed.message || parsed.error || parsed._debug_error || detail;
      } catch { /* keep original */ }
    }
    if (detail.length > 120) detail = detail.substring(0, 117) + '...';
    return detail;
  }
  if (tc.name === 'CurrentDateTime' || tc.name === 'current_date_time') {
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
  // Use rawOutput if parsed output is empty
  if (tc.rawOutput) {
    return tc.rawOutput.substring(0, 120);
  }
  const outStr = JSON.stringify(tc.output);
  if (outStr === '{}' || outStr === 'null') {
    return tc.statusMessage || 'no output';
  }
  return outStr.substring(0, 120);
}

/** Compact date: "02/25/2026" or "2026-02-25" → "2/25" */
function shortenDate(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') return '';
  // MM/DD/YYYY
  const slashMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/\d{4}/);
  if (slashMatch) return `${parseInt(slashMatch[1])}/${parseInt(slashMatch[2])}`;
  // YYYY-MM-DD
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${parseInt(isoMatch[2])}/${parseInt(isoMatch[3])}`;
  return dateStr.substring(0, 5);
}

/** Compact time: "3/17/2026 9:50:00 AM" or ISO → "9:50am" */
function formatShortTime(timeStr: string): string {
  if (!timeStr || typeof timeStr !== 'string') return '';
  // "M/D/YYYY H:MM:SS AM/PM" or "H:MM AM/PM" (seconds optional)
  const usMatch = timeStr.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)/i);
  if (usMatch) {
    return `${parseInt(usMatch[1])}:${usMatch[2]}${usMatch[3].toLowerCase()}`;
  }
  // ISO "2026-03-17T09:50:00" — extract HH:MM and convert to 12h
  const isoMatch = timeStr.match(/T(\d{2}):(\d{2})/);
  if (isoMatch) {
    let h = parseInt(isoMatch[1]);
    const suffix = h >= 12 ? 'pm' : 'am';
    if (h > 12) h -= 12;
    if (h === 0) h = 12;
    return `${h}:${isoMatch[2]}${suffix}`;
  }
  return '';
}

/** Extract caller-provided context from tool call input for request arrows */
function getToolCallRequestDetail(tc: InvestigationToolCall): string {
  if (!tc.input || typeof tc.input !== 'object') return '';

  if (tc.action === 'slots' || tc.action === 'grouped_slots') {
    const parts: string[] = [];
    // Ortho: startDate/endDate, Chord: searchStartDate/searchEndDate
    const start = shortenDate(tc.input.startDate || tc.input.searchStartDate || '');
    const end = shortenDate(tc.input.endDate || tc.input.searchEndDate || '');
    if (start && end) parts.push(`${start}-${end}`);
    else if (start) parts.push(`from ${start}`);
    if (tc.action === 'grouped_slots' && tc.input.numberOfPatients && tc.input.numberOfPatients > 1) {
      parts.push(`${tc.input.numberOfPatients} kids`);
    }
    return parts.join(', ');
  }

  if (tc.action === 'book_child' || tc.action === 'book') {
    // children[] array form (Ortho grouped booking)
    if (Array.isArray(tc.input.children) && tc.input.children.length > 0) {
      const child = tc.input.children[0];
      const name = child.firstName || child.childFirstName || child.childName || '';
      const rawTime = child.startTime || '';
      const rawDate = child.appointmentDate || '';
      const date = shortenDate(rawTime || rawDate);
      const time = formatShortTime(rawTime || (child.appointmentTime ? `1/1/2000 ${child.appointmentTime}` : ''));
      const timePart = date && time ? `${date} ${time}` : time || date;
      return name && timePart ? `${name}, ${timePart}` : name || timePart;
    }
    // flat form — Ortho: childName/firstName + startTime, Chord: childFirstName + appointmentDate/appointmentTime
    const name = tc.input.childFirstName || tc.input.childName || tc.input.firstName || '';
    const rawTime = tc.input.startTime || '';
    const rawDate = tc.input.appointmentDate || '';
    const date = shortenDate(rawTime || rawDate);
    const time = formatShortTime(rawTime || (tc.input.appointmentTime ? `1/1/2000 ${tc.input.appointmentTime}` : ''));
    const timePart = date && time ? `${date} ${time}` : time || date;
    return name && timePart ? `${name}, ${timePart}` : name || timePart;
  }

  if (tc.action === 'create') {
    const first = tc.input.patientFirstName || tc.input.firstName || '';
    const last = tc.input.patientLastName || tc.input.lastName || '';
    return [first, last].filter(Boolean).join(' ');
  }

  if (tc.action === 'escalation') {
    return (tc.input.reason || tc.input.transferReason || tc.input.escalationIntent || '').substring(0, 30);
  }

  if (tc.action === 'lookup') {
    if (tc.input.phoneNumber) {
      const ph = String(tc.input.phoneNumber);
      return `ph: ***${ph.slice(-4)}`;
    }
    if (tc.input.filter) return String(tc.input.filter).substring(0, 20);
    return '';
  }

  if (tc.action === 'cancel') {
    const id = tc.input.appointmentGUID || tc.input.appointmentId || '';
    return id ? `appt ${String(id).substring(0, 8)}...` : '';
  }

  if (tc.action === 'get_existing' || tc.action === 'reschedule') {
    const parts: string[] = [];
    const id = tc.input.appointmentGUID || tc.input.appointmentId || tc.input.patientGUID || '';
    if (id) parts.push(`appt ${String(id).substring(0, 8)}...`);
    if (tc.action === 'reschedule' && tc.input.newStartTime) {
      const date = shortenDate(tc.input.newStartTime);
      const time = formatShortTime(tc.input.newStartTime);
      parts.push(date && time ? `${date} ${time}` : time || date);
    }
    return parts.join(', ');
  }

  // appointments action — show patient ID if present
  if (tc.action === 'appointments') {
    const id = tc.input.patientId || tc.input.patientGUID || '';
    return id ? `patient ${String(id).substring(0, 10)}` : '';
  }

  // clinic_info, CurrentDateTime — no context needed
  return '';
}

function detectRecommendedFixes(r: InvestigationResult): RecommendedFix[] {
  const fixes: RecommendedFix[] = [];
  const errorToolCalls = r.toolCalls.filter(tc => tc.isError);
  const isOrtho = r.tenantId === 1;

  // Early exit: CLEAN with no errors → no fixes needed
  if (r.classification === 'CLEAN' && errorToolCalls.length === 0) return fixes;

  // Rule 1: Hallucinated booking — LLM confirmed booking without calling book_child
  if (r.classification === 'FALSE_POSITIVE' && r.bookingToolCallCount === 0) {
    const toolRef = isOrtho ? 'book_child action within schedule_appointment_ortho' : 'book_child tool';
    fixes.push({
      severity: 'Critical',
      target: 'system_prompt',
      issue: `LLM confirmed a booking to the caller without calling the ${toolRef}`,
      recommendation: 'Add an FSM guardrail: "You MUST call book_child and receive a success response before confirming any appointment to the caller. Never fabricate appointment IDs or confirmation details."',
    });
    // Rule 1b: Node-RED server-side fix
    if (isOrtho) {
      fixes.push({
        severity: 'Critical',
        target: 'nodered_flow',
        issue: 'No server-side mechanism to verify that a booking actually happened before the call ends',
        recommendation: 'Add booking receipt system: `/chord/ortho-prd/bookConsultation` should return a server-generated `_booking_receipt` hash. Add `/chord/ortho-prd/verifyBooking` endpoint so the telephony platform can verify bookings exist in the registry before accepting PAYLOAD claims of callSummary.booked=true.',
      });
    } else {
      fixes.push({
        severity: 'Critical',
        target: 'nodered_flow',
        issue: 'No server-side mechanism to verify that a booking actually happened before the call ends',
        recommendation: 'Add booking receipt system: createChildAppt returns a server-generated `_booking_receipt` hash. Add `/chord/verifyBooking` endpoint so the telephony platform can verify bookings exist in the registry before accepting PAYLOAD claims of Intent_Complete=Schedule.',
        fixApplied: 'NexHealth v2 — createChildAppt-NA now returns `_booking_confirmed` flag + `_booking_receipt` hash. New `/chord/verifyBooking` endpoint checks the flow-context booking registry. LLM cannot forge receipts.',
      });
    }
  }

  // Rule 2: Placeholder IDs in PAYLOAD
  if (r.placeholderIds.length > 0) {
    const idFieldName = isOrtho ? 'appointmentGUID' : 'appointmentId';
    fixes.push({
      severity: 'Critical',
      target: 'system_prompt',
      issue: `Placeholder appointment IDs found in PAYLOAD: ${r.placeholderIds.map(id => `\`${id}\``).join(', ')}`,
      recommendation: `Add instruction: "Never use placeholder values like APPT123456, TBD, or N/A for ${idFieldName}. If a booking was not completed, set the ${idFieldName} field to empty string."`,
    });
    const idFormat = isOrtho ? 'Cloud9 GUID (8-4-4-4-12 hex)' : 'NexHealth numeric integer';
    fixes.push({
      severity: 'Warning',
      target: 'scheduling_tool',
      issue: 'No validation rejects placeholder appointment IDs in PAYLOAD output',
      recommendation: `Add output validation in the PAYLOAD construction to reject IDs not matching expected format (${idFormat}).`,
      fixApplied: isOrtho ? undefined : 'v92 — book_child response now validates each child has a real Cloud9 GUID (8-4-4-4-12 hex). Unverified bookings are flagged with `_booking_verified: false` and `llm_guidance.CRITICAL` blocks confirmation.',
    });
  }

  // Rule 3: PII masking error — phone lookup with masked number
  const piiMaskErrors = errorToolCalls.filter(tc =>
    tc.action === 'lookup' && tc.input?.phoneNumber && /^\*+$/.test(String(tc.input.phoneNumber))
  );
  if (piiMaskErrors.length > 0) {
    fixes.push({
      severity: 'Warning',
      target: 'patient_tool',
      issue: 'Patient lookup called with PII-masked phone number (e.g., "***") causing tool error',
      recommendation: 'Add input validation: if phoneNumber matches /^\\*+$/, return a helpful error message instead of calling the API. Suggest the LLM ask the caller to spell their name instead.',
      fixApplied: 'v14 — lookup.validate() now rejects phoneNumber matching /^[*Xx]+$/ with structured `llm_guidance` directing the LLM to search by name instead.',
    });
    fixes.push({
      severity: 'Info',
      target: 'system_prompt',
      issue: 'LLM attempted phone lookup with masked PII',
      recommendation: 'Add instruction: "If the caller\'s phone number appears masked (***), do NOT attempt a phone lookup. Instead, ask the caller for their name to search by name."',
    });
  }

  // Rule 4: Duplicate datetime tool calls (handles both CurrentDateTime and current_date_time)
  const dateTimeCalls = r.toolCalls.filter(tc => tc.name === 'CurrentDateTime' || tc.name === 'current_date_time');
  if (dateTimeCalls.length > 1) {
    const dtName = dateTimeCalls[0].name;
    fixes.push({
      severity: 'Info',
      target: 'system_prompt',
      issue: `${dtName} called ${dateTimeCalls.length} times in a single session`,
      recommendation: `Add instruction: "Call ${dtName} once at the start of the conversation. Cache the result and reuse it — do not call it again unless the conversation spans a day boundary."`,
    });
  }

  // Rule 5: Booking without prior slots call
  const hasBookAction = r.toolCalls.some(tc => tc.action === 'book_child' || tc.action === 'book');
  const hasSlotsCall = r.toolCalls.some(tc => tc.action === 'slots' || tc.action === 'grouped_slots');
  if (hasBookAction && !hasSlotsCall) {
    fixes.push({
      severity: 'Critical',
      target: 'system_prompt',
      issue: 'Booking tool was called without first querying available slots',
      recommendation: 'Add prerequisite chain: "Before calling book_child, you MUST first call grouped_slots to verify availability. Never book a slot that was not returned by the scheduling tool."',
    });
  }

  // Rule 6: General tool errors (not already caught by Rule 3)
  const uncaughtErrors = errorToolCalls.filter(tc => !piiMaskErrors.includes(tc));
  for (const tc of uncaughtErrors) {
    let target: ArtifactTarget = 'system_prompt';
    if (tc.name.includes('schedul') || tc.name.includes('scheduling')) target = 'scheduling_tool';
    else if (tc.name.includes('patient')) target = 'patient_tool';
    else if (tc.name.includes('Escalation') || tc.name.includes('HandleEscalation')) target = 'nodered_flow';

    const detail = tc.statusMessage || 'unknown error';
    const shortDetail = detail.length > 80 ? detail.substring(0, 77) + '...' : detail;
    fixes.push({
      severity: 'Warning',
      target,
      issue: `Tool error on ${tc.name}→${tc.action}: ${shortDetail}`,
      recommendation: `Investigate why ${tc.action} action returned an error and add input validation or error handling to prevent it.`,
    });
  }

  // Rule 7: FALSE_POSITIVE_WITH_TOOL classification
  if (r.classification === 'FALSE_POSITIVE_WITH_TOOL') {
    const idFormat = isOrtho ? 'Cloud9 GUID' : 'NexHealth numeric ID';
    fixes.push({
      severity: 'Critical',
      target: 'scheduling_tool',
      issue: `Booking tool was called but returned placeholder IDs instead of real ${idFormat}s`,
      recommendation: `Add response validation: if the booking API returns a non-${idFormat} or a known placeholder pattern, treat it as a failure and do NOT confirm the booking to the caller.`,
      fixApplied: isOrtho ? undefined : 'v92 — book_child response now validates appointmentGUID format. Non-GUID responses are flagged `_booking_verified: false` with `llm_guidance.CRITICAL` blocking confirmation.',
    });
    // Rule 7b: Node-RED server-side fix for tool-level false positives
    const endpoint = isOrtho ? '/chord/ortho-prd/bookConsultation' : 'createChildAppt';
    const expectedFormat = isOrtho ? 'GUID for Cloud9 (8-4-4-4-12 hex)' : 'numeric for NexHealth';
    fixes.push({
      severity: 'Critical',
      target: 'nodered_flow',
      issue: `${endpoint} endpoint returned success without validating the appointment ID format from the API`,
      recommendation: `Add server-side appointment ID format validation in ${endpoint} response handler. Validate the API-returned ID matches expected format (${expectedFormat}) before returning success.`,
      fixApplied: isOrtho ? undefined : 'NexHealth v2 — createChildAppt-NA now validates NexHealth IDs are numeric (`/^\\d+$/`). Invalid IDs throw an error instead of returning a false success response.',
    });
  }

  // Rule 8: Any FALSE_POSITIVE — suggest booking registry verification
  if (r.classification === 'FALSE_POSITIVE' || r.classification === 'FALSE_POSITIVE_WITH_TOOL') {
    const endpoint = isOrtho ? '/chord/ortho-prd/verifyBooking' : '/chord/verifyBooking';
    fixes.push({
      severity: 'Warning',
      target: 'nodered_flow',
      issue: 'No booking registry to cross-reference PAYLOAD booking claims against actual API bookings',
      recommendation: `Maintain a server-side booking registry (flow context or Redis) keyed by session/phone. Expose a \`${endpoint}\` endpoint so the telephony platform can verify that PAYLOAD booking claims match real server-confirmed bookings before disconnecting the call.`,
      fixApplied: isOrtho ? undefined : 'NexHealth v2 — `booking_registry` stored in flow context. New `/chord/verifyBooking` endpoint supports verification by receipt hash, sessionKey+appointmentId, or session audit listing.',
    });
  }

  return fixes;
}

function escapeTableCell(text: string): string {
  // Escape pipe characters and newlines that break markdown table syntax
  return text.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function formatRecommendedFixesMarkdown(fixes: RecommendedFix[]): string {
  if (fixes.length === 0) return '';

  const lines: string[] = [];
  const severityOrder: Record<FixSeverity, number> = { Critical: 0, Warning: 1, Info: 2 };

  // Group by target
  const grouped = new Map<ArtifactTarget, RecommendedFix[]>();
  for (const fix of fixes) {
    if (!grouped.has(fix.target)) grouped.set(fix.target, []);
    grouped.get(fix.target)!.push(fix);
  }
  // Sort each group: Critical first
  for (const [, group] of grouped) {
    group.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
  }

  const artifactCount = grouped.size;
  const appliedCount = fixes.filter(f => f.fixApplied).length;

  lines.push('---');
  lines.push('');
  lines.push('## Recommended Fixes');
  lines.push('');
  lines.push(`> **${fixes.length} issue(s) detected** across ${artifactCount} artifact(s).${appliedCount > 0 ? ` **${appliedCount} already fixed** in tool updates.` : ''}`);
  lines.push('');

  let globalIdx = 0;
  for (const [target, group] of grouped) {
    const meta = ARTIFACT_META[target];
    lines.push(`### ${meta.label}`);
    lines.push(`\`${meta.file}\``);
    lines.push('');
    lines.push('| # | Severity | Issue | Recommendation | Status |');
    lines.push('|---|----------|-------|----------------|--------|');
    for (const fix of group) {
      globalIdx++;
      const sevLabel = fix.severity === 'Critical' ? '**Critical**' : fix.severity;
      const status = fix.fixApplied ? `✅ ${escapeTableCell(fix.fixApplied)}` : '⬚ Open';
      lines.push(`| ${globalIdx} | ${sevLabel} | ${escapeTableCell(fix.issue)} | ${escapeTableCell(fix.recommendation)} | ${status} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
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

  // ── Booking Details Card (if bookings exist) ──
  if (r.bookingDetails.length > 0) {
    const activeBookings = r.bookingDetails.filter(b => b.status === 'active');
    const displayBookings = activeBookings.length > 0 ? activeBookings : r.bookingDetails;

    lines.push('---');
    lines.push('');

    for (const b of displayBookings) {
      const isPlaceholder = b.status === 'placeholder';
      const cardTitle = isPlaceholder ? 'Claimed Appointment (Not Verified)' : 'Booked Appointment';
      lines.push(`## ${cardTitle}`);
      lines.push('');

      // Row 1: Patient info
      const patientRow: string[] = [];
      if (b.childName) patientRow.push(`**Patient:** ${b.childName}`);
      if (b.childDob) patientRow.push(`**DOB:** ${b.childDob}`);
      if (b.childAge) patientRow.push(`**Age:** ${b.childAge}`);
      if (b.isNewPatient) patientRow.push('**New Patient**');
      if (patientRow.length > 0) lines.push(`${patientRow.join(' | ')}`);

      lines.push('');
      lines.push('| | |');
      lines.push('|:---|:---|');

      // Appointment details table
      if (b.appointmentDate || b.appointmentTime) {
        const dateStr = [b.appointmentDayOfWeek, b.appointmentDate].filter(Boolean).join(', ');
        const timeStr = b.appointmentTime || '';
        const dtDisplay = timeStr ? `${dateStr} at ${timeStr}` : dateStr;
        lines.push(`| **Date & Time** | ${dtDisplay} |`);
      }
      if (b.appointmentType) lines.push(`| **Appointment Type** | ${b.appointmentType} |`);
      if (b.appointmentMinutes) lines.push(`| **Duration** | ${b.appointmentMinutes} min |`);
      if (b.locationName) lines.push(`| **Location** | ${b.locationName} |`);
      if (b.providerName) lines.push(`| **Provider** | ${b.providerName} |`);
      if (b.chair) lines.push(`| **Chair** | ${b.chair} |`);
      if (b.appointmentGuid) lines.push(`| **Appointment ID** | \`${b.appointmentGuid}\` |`);
      if (b.patientGuid) lines.push(`| **Patient ID** | \`${b.patientGuid}\` |`);
      if (!isPlaceholder) lines.push(`| **Status** | ${b.status === 'active' ? 'Confirmed' : b.status || 'Unknown'} |`);

      // Caller info
      lines.push('');
      const callerRows: string[] = [];
      if (b.callerName) callerRows.push(`| **Caller** | ${b.callerName} |`);
      if (b.callerPhone) {
        // Format phone: "2674814583" → "(267) 481-4583", "+12674814583" → "(267) 481-4583"
        const digits = b.callerPhone.replace(/\D/g, '').replace(/^1/, '');
        const formatted = digits.length === 10
          ? `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
          : b.callerPhone;
        callerRows.push(`| **Phone** | ${formatted} |`);
      }
      if (b.callerEmail) callerRows.push(`| **Email** | ${b.callerEmail} |`);
      if (b.callerDob) callerRows.push(`| **Guarantor DOB** | ${b.callerDob} |`);
      if (b.insuranceProvider) callerRows.push(`| **Insurance** | ${b.insuranceProvider}${b.insuranceMemberId ? ` (Member: ${b.insuranceMemberId})` : ''} |`);
      if (b.specialNeeds) callerRows.push(`| **Special Needs** | ${b.specialNeeds} |`);

      if (callerRows.length > 0) {
        lines.push('| | |');
        lines.push('|:---|:---|');
        lines.push(...callerRows);
      }

      if (b.interactionSummary) {
        lines.push('');
        lines.push(`> ${b.interactionSummary}`);
      }

      lines.push('');
    }
  }

  // ── Summary — dynamic based on classification and actual data ──
  lines.push('---');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  if (r.classification === 'FALSE_POSITIVE') {
    const ids = [...new Set(r.allExtractedIds)].map(id => `\`${id}\``).join(', ');
    const childName = r.childNames[0] || 'the patient';
    const apptDetails = extractAppointmentDescription(r.payloadFindings, r.tenantId);
    const apptDesc = apptDetails ? `for ${childName} on ${apptDetails}` : childName;
    // Describe what actually happened dynamically
    const actualTools = r.toolCalls.map(tc => tc.action !== tc.name ? tc.action : tc.name);
    const toolSummary = actualTools.length > 0 ? `The LLM called ${actualTools.length} tool(s) (${[...new Set(actualTools)].join(', ')}) but **never called a booking action** (book/book_child).` : 'The LLM made no tool calls at all.';
    const idLabel = ids || 'booking data';
    lines.push(`**This booking never happened.** ${toolSummary} Instead, the LLM fabricated ${idLabel} ${apptDesc} in the PAYLOAD output. The PAYLOAD extraction fallback trusted this hallucinated text.`);
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
    const cleanDisposition = extractDisposition(r.payloadFindings, r.tenantId);
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
  lines.push('| # | Tool | Action | Request Context | Level | Key Output |');
  lines.push('|---|------|--------|-----------------|-------|------------|');
  for (const tc of r.toolCalls) {
    const level = tc.isError ? '**ERROR**' : tc.level;
    const detail = getToolCallDetail(tc);
    const reqContext = getToolCallRequestDetail(tc);
    const actionDisplay = (tc.action === tc.name || tc.name === 'CurrentDateTime' || tc.name === 'current_date_time') ? '—' : `\`${tc.action}\``;
    lines.push(`| ${tc.index} | \`${tc.name}\` | ${actionDisplay} | ${escapeTableCell(reqContext) || '—'} | ${level} | ${escapeTableCell(detail)} |`);
  }
  lines.push('');
  if (r.bookingToolCallCount === 0 && r.toolCalls.length > 0) {
    const schedulingCalls = r.toolCalls.filter(tc => tc.name.includes('schedul'));
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
    const payloadDesc = r.allExtractedIds.length > 0 ? 'with appointment IDs' : 'with booking data';
    lines.push(`Found ${r.payloadFindings.length} GENERATION observation(s) ${payloadDesc}:`);
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
    const expectedFormat = r.tenantId === 1 ? 'Cloud9 UUID' : 'NexHealth integer';
    for (const id of uniqueIds) {
      const isUUID = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i.test(id);
      const isInt = /^\d+$/.test(id);
      const isFake = r.placeholderIds.includes(id);
      const format = isUUID ? 'Cloud9 UUID' : isInt ? 'NexHealth integer' : 'Other';
      let assessment = '';
      if (isFake) {
        assessment = `Known placeholder — not a valid ${expectedFormat}`;
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
    // Sanitize label for Mermaid (remove quotes, special chars including # and ;)
    const safeLabel = toolLabel.replace(/['"<>#;]/g, '');
    const detail = getToolCallDetail(tc);
    const safeDetail = detail.replace(/['"<>#;]/g, '').replace(/\n/g, ' ');
    const shortDetail = safeDetail.length > 35 ? safeDetail.substring(0, 32) + '...' : safeDetail;
    // Build request label with caller context
    const reqContext = getToolCallRequestDetail(tc);
    const safeReqContext = reqContext.replace(/['"<>#;]/g, '').replace(/\n/g, ' ');
    const shortReqContext = safeReqContext.length > 30 ? safeReqContext.substring(0, 27) + '...' : safeReqContext;
    const requestLabel = shortReqContext ? `${safeLabel} (${shortReqContext})` : safeLabel;
    if (tc.isError) {
      flowLines.push(`    L->>T: [${tc.index}] ${requestLabel}`);
      flowLines.push(`    T--xL: [${tc.index}r] ERROR`);
    } else {
      flowLines.push(`    L->>T: [${tc.index}] ${requestLabel}`);
      flowLines.push(`    T-->>L: [${tc.index}r] ${shortDetail}`);
    }
  }

  // Dynamic ending based on classification and outcome
  const hasEscalationTool = r.toolCalls.some(tc => tc.action === 'escalation');
  // Extract disposition from PAYLOAD for diagram note (tenant-aware)
  const diagramDisposition = extractDisposition(r.payloadFindings, r.tenantId);

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
    const apptDesc = extractAppointmentDescription(r.payloadFindings, r.tenantId);
    const payloadDisposition = extractDisposition(r.payloadFindings, r.tenantId) || null;
    const hasEscalation = r.toolCalls.some(tc => tc.action === 'escalation');
    const fabricatedIds = [...new Set(r.allExtractedIds)].map(id => `\`${id}\``).join(', ');

    lines.push(`| **Classification** | FALSE POSITIVE — Hallucinated booking |`);
    lines.push(`| **Patient** | ${childName} |`);
    lines.push(`| **Claimed appointment** | ${apptDesc || 'Details fabricated in PAYLOAD'} |`);
    if (fabricatedIds) {
      lines.push(`| **Fabricated ID(s)** | ${fabricatedIds} |`);
    }
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
    const disposition = extractDisposition(r.payloadFindings, r.tenantId) || null;
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

  // ── Recommended Fixes (artifact-targeted) ──
  const fixes = detectRecommendedFixes(r);
  const fixesMd = formatRecommendedFixesMarkdown(fixes);
  if (fixesMd) {
    lines.push(fixesMd);
    lines.push('');
  }

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
      lines.push(`<details id="tool-call-${tc.index}">`);
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
      if (tc.rawOutput) {
        // Raw output string that couldn't be parsed as JSON — show it directly
        lines.push(tc.rawOutput);
      } else {
        try {
          const outStr = JSON.stringify(tc.output || {}, null, 2);
          lines.push(outStr === '{}' && tc.statusMessage ? tc.statusMessage : outStr);
        } catch {
          lines.push(String(tc.output));
        }
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
    const result = runInvestigation(sessionId, db);
    db.close();
    if (!result) {
      res.status(404).json({ error: `Session "${sessionId}" not found` });
      return;
    }
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


// ── Call Lookup by Arbitrary ID ────────────────────────────────────

interface CallLookupResult {
  found: boolean;
  searchId: string;
  idType: string | null;
  traceId: string | null;
  langfuseSessionId: string | null;
  formattedSessionId: string | null;
  configId: number | null;
  configName: string | null;
  timestamp: string | null;
  phone: string | null;
  callSummary: Record<string, unknown> | null;
  booking: Record<string, unknown> | null;
  toolCalls: Array<Record<string, unknown>>;
  sessionStats: Record<string, unknown> | null;
  allSessionIds: string[];
}

/**
 * Parse the PAYLOAD JSON from a trace output string.
 */
function parsePayloadFromOutput(output: string | null): Record<string, unknown> | null {
  if (!output) return null;
  const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
  const payloadMatch = outputStr.match(/PAYLOAD:\s*(\{[\s\S]*\})\s*$/);
  if (!payloadMatch) return null;
  try {
    return JSON.parse(payloadMatch[1]);
  } catch {
    return null;
  }
}

interface LangfuseTrace {
  id: string;
  sessionId: string;
  timestamp: string;
  userId: string;
  output: unknown;
  [key: string]: unknown;
}

/**
 * Search for an ID in Langfuse trace content via API.
 */
async function searchLangfuseForId(
  id: string,
  configs: Array<{ id: number; name: string; host: string; public_key: string; secret_key: string }>,
  daysBack: number
): Promise<{ traceId: string; sessionId: string; timestamp: string; phone: string; configId: number; configName: string; idType: string; output: string | null } | null> {
  const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();

  for (const config of configs) {
    const auth = Buffer.from(config.public_key + ':' + config.secret_key).toString('base64');
    const headers = { 'Authorization': 'Basic ' + auth };
    const host = config.host.replace(/\/$/, '');

    // Try as trace ID
    try {
      const r = await fetch(`${host}/api/public/traces/${id}`, { headers });
      if (r.ok) {
        const trace = await r.json() as LangfuseTrace;
        return {
          traceId: trace.id, sessionId: trace.sessionId, timestamp: trace.timestamp,
          phone: trace.userId, configId: config.id, configName: config.name,
          idType: 'trace_id', output: typeof trace.output === 'string' ? trace.output : JSON.stringify(trace.output),
        };
      }
    } catch { /* continue */ }

    // Try as session ID
    try {
      const r = await fetch(`${host}/api/public/traces?sessionId=${encodeURIComponent(id)}&limit=50&orderBy=timestamp.desc`, { headers });
      if (r.ok) {
        const d = await r.json() as { data?: LangfuseTrace[] };
        if (d.data?.length) {
          const t = d.data[0];
          return {
            traceId: t.id, sessionId: id, timestamp: t.timestamp,
            phone: t.userId, configId: config.id, configName: config.name,
            idType: 'session_id', output: typeof t.output === 'string' ? t.output : JSON.stringify(t.output),
          };
        }
      }
    } catch { /* continue */ }

    // Content search through recent traces
    let page = 1;
    while (page <= 40) {
      try {
        const url = `${host}/api/public/traces?fromTimestamp=${fromDate}&limit=100&page=${page}&orderBy=timestamp.desc`;
        const r = await fetch(url, { headers });
        if (!r.ok) break;
        const d = await r.json() as { data?: LangfuseTrace[] };
        if (!d.data?.length) break;

        for (const trace of d.data) {
          const str = JSON.stringify(trace);
          if (str.includes(id)) {
            // Determine ID type from context
            const idx = str.indexOf(id);
            const before = str.substring(Math.max(0, idx - 150), idx);
            const escapedMatch = before.match(/\\"(\w+)\\":\s*\\"?\s*$/);
            const directMatch = before.match(/"(\w+)"\s*:\s*"?\s*$/);
            let idType = 'content_match';
            if (escapedMatch) idType = escapedMatch[1];
            else if (directMatch) idType = directMatch[1];
            else {
              const words = before.match(/(\w+)/g)?.filter(w => w.length > 2 && !/^\d+$/.test(w));
              if (words?.length) idType = words[words.length - 1];
            }

            return {
              traceId: trace.id, sessionId: trace.sessionId, timestamp: trace.timestamp,
              phone: trace.userId, configId: config.id, configName: config.name,
              idType, output: typeof trace.output === 'string' ? trace.output : JSON.stringify(trace.output),
            };
          }
        }
        page++;
        await new Promise(r => setTimeout(r, 100));
      } catch { break; }
    }
  }

  return null;
}

/**
 * GET /api/trace-analysis/call-lookup/:id
 *
 * Searches Langfuse for a call by any ID (location_config_id, trace ID,
 * session ID, phone, appointment ID, etc.) and returns the formatted
 * session ID, booking details, and all related trace info.
 *
 * Query params:
 *   ?configs=8,9  — Langfuse config IDs (default: 8,9 for Chord)
 *   ?days=30      — How far back to search (default: 30)
 */
export const callLookup = async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const configParam = (req.query.configs as string) || '8,9';
  const daysBack = parseInt((req.query.days as string) || '30', 10);
  const configIds = configParam.split(',').map(Number);

  const db = getDb();

  try {
    const result: CallLookupResult = {
      found: false, searchId: id, idType: null, traceId: null,
      langfuseSessionId: null, formattedSessionId: null,
      configId: null, configName: null, timestamp: null, phone: null,
      callSummary: null, booking: null, toolCalls: [], sessionStats: null,
      allSessionIds: [],
    };

    // Step 1: Check local DB first (fast path)
    const localTrace = db.prepare(`
      SELECT trace_id, session_id, original_session_id, user_id, started_at, langfuse_config_id, output
      FROM production_traces
      WHERE trace_id = ? OR original_session_id = ?
      LIMIT 1
    `).get(id, id) as any;

    if (localTrace) {
      result.found = true;
      result.idType = localTrace.trace_id === id ? 'trace_id' : 'session_id';
      result.traceId = localTrace.trace_id;
      result.langfuseSessionId = localTrace.original_session_id;
      result.formattedSessionId = localTrace.session_id;
      result.timestamp = localTrace.started_at;
      result.phone = localTrace.user_id;
      result.configId = localTrace.langfuse_config_id;

      const configRow = db.prepare('SELECT name FROM langfuse_configs WHERE id = ?').get(localTrace.langfuse_config_id) as any;
      result.configName = configRow?.name || null;

      // Parse call summary from output
      const payload = parsePayloadFromOutput(localTrace.output);
      if (payload) {
        const cs = (payload as any).Call_Summary || payload;
        result.callSummary = cs;
      }
    }

    // Step 2: Search local DB for ID in trace content
    if (!result.found) {
      // Search by phone
      const phoneClean = id.replace(/[^0-9+]/g, '');
      if (phoneClean.length >= 10) {
        const byPhone = db.prepare(`
          SELECT trace_id, session_id, original_session_id, user_id, started_at, langfuse_config_id, output
          FROM production_traces
          WHERE user_id LIKE ? AND langfuse_config_id IN (${configIds.map(() => '?').join(',')})
          ORDER BY started_at DESC LIMIT 1
        `).get(`%${phoneClean}%`, ...configIds) as any;
        if (byPhone) {
          result.found = true;
          result.idType = 'phone';
          result.traceId = byPhone.trace_id;
          result.langfuseSessionId = byPhone.original_session_id;
          result.formattedSessionId = byPhone.session_id;
          result.timestamp = byPhone.started_at;
          result.phone = byPhone.user_id;
          result.configId = byPhone.langfuse_config_id;
          const configRow = db.prepare('SELECT name FROM langfuse_configs WHERE id = ?').get(byPhone.langfuse_config_id) as any;
          result.configName = configRow?.name || null;
          const payload = parsePayloadFromOutput(byPhone.output);
          if (payload) result.callSummary = (payload as any).Call_Summary || payload;
        }
      }
    }

    // Step 3: Search local DB output fields for the ID
    if (!result.found) {
      const byContent = db.prepare(`
        SELECT trace_id, session_id, original_session_id, user_id, started_at, langfuse_config_id, output
        FROM production_traces
        WHERE output LIKE ? AND langfuse_config_id IN (${configIds.map(() => '?').join(',')})
        ORDER BY started_at DESC LIMIT 1
      `).get(`%${id}%`, ...configIds) as any;

      if (byContent) {
        result.found = true;
        result.traceId = byContent.trace_id;
        result.langfuseSessionId = byContent.original_session_id;
        result.formattedSessionId = byContent.session_id;
        result.timestamp = byContent.started_at;
        result.phone = byContent.user_id;
        result.configId = byContent.langfuse_config_id;
        const configRow = db.prepare('SELECT name FROM langfuse_configs WHERE id = ?').get(byContent.langfuse_config_id) as any;
        result.configName = configRow?.name || null;

        // Determine ID type from output context
        const outputStr = byContent.output || '';
        const idx = outputStr.indexOf(id);
        if (idx !== -1) {
          const before = outputStr.substring(Math.max(0, idx - 100), idx);
          const keyMatch = before.match(/"(\w+)"\s*:\s*"?\s*$/);
          result.idType = keyMatch ? keyMatch[1] : 'content_match';
        } else {
          result.idType = 'content_match';
        }

        const payload = parsePayloadFromOutput(byContent.output);
        if (payload) result.callSummary = (payload as any).Call_Summary || payload;
      }
    }

    // Step 4: If still not found locally, search Langfuse API
    if (!result.found) {
      const configs = db.prepare(
        `SELECT id, name, host, public_key, secret_key FROM langfuse_configs WHERE id IN (${configIds.map(() => '?').join(',')})`
      ).all(...configIds) as any[];

      const langfuseResult = await searchLangfuseForId(id, configs, daysBack);
      if (langfuseResult) {
        result.found = true;
        result.traceId = langfuseResult.traceId;
        result.langfuseSessionId = langfuseResult.sessionId;
        result.timestamp = langfuseResult.timestamp;
        result.phone = langfuseResult.phone;
        result.configId = langfuseResult.configId;
        result.configName = langfuseResult.configName;
        result.idType = langfuseResult.idType;

        const payload = parsePayloadFromOutput(langfuseResult.output);
        if (payload) result.callSummary = (payload as any).Call_Summary || payload;

        // Try to find formatted session ID from local DB
        const localMatch = db.prepare(
          'SELECT session_id FROM production_traces WHERE trace_id = ? OR original_session_id = ? LIMIT 1'
        ).get(langfuseResult.traceId, langfuseResult.sessionId) as any;
        result.formattedSessionId = localMatch?.session_id || null;
      }
    }

    if (!result.found) {
      db.close();
      res.status(404).json({ error: `ID "${id}" not found`, data: result });
      return;
    }

    // Step 5: Enrich with booking details and tool calls from observations
    if (result.formattedSessionId) {
      const toolObs = db.prepare(`
        SELECT o.name, o.type, o.input, o.output, o.started_at, o.latency_ms, o.level, o.status_message
        FROM production_trace_observations o
        JOIN production_traces t ON o.trace_id = t.trace_id
        WHERE t.session_id = ?
          AND (o.name LIKE '%schedul%' OR o.name LIKE '%chord%' OR o.name LIKE '%patient%'
               OR o.name LIKE '%Escalation%' OR o.name LIKE '%handleEscalation%'
               OR o.name = 'CurrentDateTime')
        ORDER BY o.started_at ASC
      `).all(result.formattedSessionId) as any[];

      for (const obs of toolObs) {
        const entry: Record<string, unknown> = {
          tool: obs.name, type: obs.type, timestamp: obs.started_at,
          latencyMs: obs.latency_ms, level: obs.level,
        };

        try { entry.input = JSON.parse(obs.input); } catch { entry.input = obs.input; }
        try {
          const output = JSON.parse(obs.output);
          entry.output = output;

          // Extract booking confirmation
          if (output?.id && output?.start_time && output?.provider_id) {
            result.booking = {
              appointmentId: output.id, patientId: output.patient_id,
              providerId: output.provider_id, providerName: output.provider_name,
              startTime: output.start_time, endTime: output.end_time,
              operatoryId: output.operatory_id, locationId: output.location_id,
              confirmed: output.confirmed, cancelled: output.cancelled,
              timezone: output.timezone, dayOfWeek: output.day_of_week,
              note: output.note, createdAt: output.created_at,
            };
          }
        } catch { entry.output = obs.output; }

        result.toolCalls.push(entry);
      }

      // Session stats
      const sessionInfo = db.prepare(
        'SELECT * FROM production_sessions WHERE session_id = ?'
      ).get(result.formattedSessionId) as any;
      if (sessionInfo) {
        result.sessionStats = {
          traceCount: sessionInfo.trace_count, totalCost: sessionInfo.total_cost,
          totalLatencyMs: sessionInfo.total_latency_ms,
          hasBooking: sessionInfo.has_successful_booking,
          hasTransfer: sessionInfo.has_transfer, errorCount: sessionInfo.error_count,
        };
      }
    }

    // Collect all session IDs
    const sids = new Set<string>();
    if (result.formattedSessionId) sids.add(result.formattedSessionId);
    if (result.langfuseSessionId) sids.add(result.langfuseSessionId);
    result.allSessionIds = [...sids];

    db.close();
    res.json({ data: result });
  } catch (err: any) {
    db.close();
    res.status(500).json({ error: err.message });
  }
};

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

interface CallReportToolCall {
  name: string;
  action: string;
  timestamp: string;
  durationMs: number | null;
  inputSummary: string;
  outputSummary: string;
  status: 'success' | 'error' | 'partial';
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
    // No intent booking details but we have booking results - add them all
    for (const br of callReport.bookingResults) {
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
  const toolNames = ['chord_ortho_patient', 'schedule_appointment_ortho', 'current_date_time'];
  const filtered = observations.filter(o => toolNames.some(tn => (o.name || '').toLowerCase().includes(tn)));

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
          if (c.appointment?.appointmentGUID) return `${c.firstName}: booked (${c.appointment.appointmentGUID.substring(0,8)}...)`;
          if (c.queued || c.status === 'queued') return `${c.firstName}: queued`;
          return `${c.firstName}: ${c.status || 'unknown'}`;
        }).join(', ');
        outputSummary = `${output.partialSuccess ? 'PARTIAL' : output.success ? 'SUCCESS' : 'FAILED'}: ${results}`;
      } else {
        outputSummary = output.appointmentGuid ? `booked: ${output.appointmentGuid.substring(0,8)}...` : 'no GUID returned';
      }
    } else {
      outputSummary = JSON.stringify(output).substring(0, 100);
    }

    report.toolCalls.push({ name: obs.name, action, timestamp: startTime, durationMs, inputSummary, outputSummary, status });

    // Extract booking results from book_child output
    if (action === 'book_child' && output.children && Array.isArray(output.children)) {
      if (input.parentFirstName) {
        report.callerName = `${input.parentFirstName} ${input.parentLastName || ''}`.trim();
      }
      if (input.parentDOB) report.callerDOB = input.parentDOB;
      if (input.parentEmail) report.callerEmail = input.parentEmail;
      if (input.parentPhone) report.callerPhone = input.parentPhone;
      if (output.parent?.patientGUID) report.parentPatientGUID = output.parent.patientGUID;

      for (const child of output.children) {
        const inputChildren = Array.isArray(input.children) ? input.children : [];
        const childInput = inputChildren.find((c: any) => c.firstName === child.firstName);
        report.children.push({ name: `${child.firstName || ''} ${child.lastName || childInput?.lastName || ''}`.trim(), dob: childInput?.dob || null });

        report.bookingResults.push({
          childName: child.firstName || null,
          patientGUID: child.patientGUID || null,
          appointmentGUID: child.appointment?.appointmentGUID || null,
          booked: !!(child.appointment?.appointmentGUID),
          queued: child.queued === true || child.status === 'queued',
          error: child.error || child.appointment?.error || null,
          slot: child.appointment?.startTime || childInput?.startTime || null,
          scheduleViewGUID: childInput?.scheduleViewGUID || child.appointment?.scheduleViewGUID || undefined,
          scheduleColumnGUID: childInput?.scheduleColumnGUID || child.appointment?.scheduleColumnGUID || undefined,
          appointmentTypeGUID: childInput?.appointmentTypeGUID || child.appointment?.appointmentTypeGUID || undefined,
        });
      }
      report.bookingElapsedMs = output.elapsedMs || durationMs;
    }

    // Extract location from clinic_info
    if (action === 'clinic_info' && output.locationName) {
      report.location = `${output.locationName}${output.address ? ', ' + output.address : ''}`;
    }

    // Extract patient GUIDs from lookup action (even if no booking was attempted)
    // This allows booking corrections when we have a GUID but booking failed/never happened
    if (action === 'lookup' && output.success) {
      // Extract parent info if available
      if (output.parent?.patientGUID && !report.parentPatientGUID) {
        report.parentPatientGUID = output.parent.patientGUID;
        if (output.parent.firstName) {
          report.callerName = `${output.parent.firstName} ${output.parent.lastName || ''}`.trim();
        }
        if (output.parent.dob) report.callerDOB = output.parent.dob;
        if (output.parent.email) report.callerEmail = output.parent.email;
        if (output.parent.phone) report.callerPhone = output.parent.phone;
      }

      // Extract children from lookup results
      const lookupChildren = output.children || output.patients || [];
      for (const child of lookupChildren) {
        if (!child.patientGUID) continue;

        // Check if this child is already in bookingResults
        const existingResult = report.bookingResults.find(br => br.patientGUID === child.patientGUID);
        if (existingResult) continue;

        // Add child to bookingResults with no booking (allows manual booking)
        const childName = `${child.firstName || ''} ${child.lastName || ''}`.trim();
        report.children.push({ name: childName, dob: child.dob || null });
        report.bookingResults.push({
          childName: child.firstName || childName || null,
          patientGUID: child.patientGUID,
          appointmentGUID: null,
          booked: false,
          queued: false,
          error: 'No booking attempted - available for manual booking',
          slot: null,
        });
      }

      // Also check for family members in different formats
      if (output.family?.children) {
        for (const child of output.family.children) {
          if (!child.patientGUID) continue;
          const existingResult = report.bookingResults.find(br => br.patientGUID === child.patientGUID);
          if (existingResult) continue;

          const childName = `${child.firstName || ''} ${child.lastName || ''}`.trim();
          report.children.push({ name: childName, dob: child.dob || null });
          report.bookingResults.push({
            childName: child.firstName || childName || null,
            patientGUID: child.patientGUID,
            appointmentGUID: null,
            booked: false,
            queued: false,
            error: 'No booking attempted - available for manual booking',
            slot: null,
          });
        }
      }
    }
  }

  // NEW: Extract booking results from LLM PAYLOAD outputs (for cases where book_child observation wasn't captured)
  // This handles sibling bookings where appointmentGUIDs appear in the PAYLOAD as Child1_appointmentGUID, Child2_appointmentGUID
  if (report.bookingResults.length === 0) {
    for (const obs of observations) {
      const output = typeof obs.output === 'string' ? obs.output : JSON.stringify(obs.output || '');

      // Look for Child_appointmentGUID patterns in PAYLOAD
      const child1GuidMatch = output.match(/Child1_appointmentGUID["']?\s*[:=]\s*["']?([0-9A-Fa-f-]{36})/);
      const child2GuidMatch = output.match(/Child2_appointmentGUID["']?\s*[:=]\s*["']?([0-9A-Fa-f-]{36})/);
      const child1PatientMatch = output.match(/Child1_patientGUID["']?\s*[:=]\s*["']?([0-9A-Fa-f-]{36})/);
      const child2PatientMatch = output.match(/Child2_patientGUID["']?\s*[:=]\s*["']?([0-9A-Fa-f-]{36})/);
      const child1NameMatch = output.match(/Child1_Name["']?\s*[:=]\s*["']?([^"'\n,}]+)/);
      const child2NameMatch = output.match(/Child2_Name["']?\s*[:=]\s*["']?([^"'\n,}]+)/);
      const child1SlotMatch = output.match(/Child1_startTime["']?\s*[:=]\s*["']?([^"'\n,}]+)/);
      const child2SlotMatch = output.match(/Child2_startTime["']?\s*[:=]\s*["']?([^"'\n,}]+)/);

      if (child1GuidMatch) {
        const existingResult = report.bookingResults.find(br => br.appointmentGUID === child1GuidMatch[1]);
        if (!existingResult) {
          report.bookingResults.push({
            childName: child1NameMatch ? child1NameMatch[1].trim() : 'Child 1',
            patientGUID: child1PatientMatch ? child1PatientMatch[1] : null,
            appointmentGUID: child1GuidMatch[1],
            slot: child1SlotMatch ? child1SlotMatch[1].trim() : null,
            booked: true,
            queued: false,
            error: null,
          });
        }
      }

      if (child2GuidMatch) {
        const existingResult = report.bookingResults.find(br => br.appointmentGUID === child2GuidMatch[1]);
        if (!existingResult) {
          report.bookingResults.push({
            childName: child2NameMatch ? child2NameMatch[1].trim() : 'Child 2',
            patientGUID: child2PatientMatch ? child2PatientMatch[1] : null,
            appointmentGUID: child2GuidMatch[1],
            slot: child2SlotMatch ? child2SlotMatch[1].trim() : null,
            booked: true,
            queued: false,
            error: null,
          });
        }
      }

      // If we found booking results from PAYLOAD, break out of the loop
      if (report.bookingResults.length > 0) break;
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

  // Determine overall booking status
  if (report.bookingResults.length > 0) {
    const allBooked = report.bookingResults.every(r => r.booked);
    const anyBooked = report.bookingResults.some(r => r.booked);
    report.bookingOverall = allBooked ? 'success' : anyBooked ? 'partial' : 'failed';
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
 */
async function fetchCurrentBookingData(callReport: CallReport, cloud9ConfigOverride?: import('../config/cloud9').Cloud9Config): Promise<CurrentBookingData> {
  const result: CurrentBookingData = {
    parent: null,
    children: [],
    queriedAt: new Date().toISOString(),
    errors: [],
  };

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
  const configId = req.query.configId ? parseInt(req.query.configId as string) : 1;
  const force = req.query.force === 'true';
  const verify = req.query.verify === 'true';

  let db: BetterSqlite3.Database | null = null;

  try {
    db = getDb();

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
              verification = await verifyFulfillment(sessionId, allObs, cachedIntent);
              // Cache verification result
              db.prepare(`UPDATE session_analysis SET verification_status = ?, verification_json = ?, verified_at = ? WHERE session_id = ?`)
                .run(verification.status, JSON.stringify(verification), verification.verifiedAt, sessionId);
            } catch (verifyErr: any) {
              console.error(`Verification failed for cached session ${sessionId}:`, verifyErr.message);
            }
          }

          // Fetch current booking data from Cloud9
          let currentBookingData: CurrentBookingData | null = null;
          if (callReport.bookingResults.length > 0 || callReport.parentPatientGUID) {
            try {
              currentBookingData = await fetchCurrentBookingData(callReport, req.tenantContext ? getCloud9ConfigForTenant(req.tenantContext, 'production') : undefined);
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

    // Map tool sequence
    let toolSequence: ToolSequenceResult | null = null;
    if (intent) {
      const allObservations = filterInternalTraces(sessionData.observations);
      toolSequence = mapToolSequence(intent, allObservations);
    }

    // Run fulfillment verification if requested
    let verification: FulfillmentVerdict | null = null;
    if (verify && intent) {
      try {
        const allObs = filterInternalTraces(sessionData.observations);
        verification = await verifyFulfillment(sessionId, allObs, intent);
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

    // Fetch current booking data from Cloud9
    let currentBookingData: CurrentBookingData | null = null;
    if (callReport.bookingResults.length > 0 || callReport.parentPatientGUID) {
      try {
        currentBookingData = await fetchCurrentBookingData(callReport, req.tenantContext ? getCloud9ConfigForTenant(req.tenantContext, 'production') : undefined);
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
  const configId = req.query.configId ? parseInt(req.query.configId as string) : 1;
  const force = req.query.force === 'true';

  let db: BetterSqlite3.Database | null = null;

  try {
    db = getDb();

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
  const configId = req.query.configId ? parseInt(req.query.configId as string) : 1;
  const force = req.query.force === 'true';

  let db: BetterSqlite3.Database | null = null;

  try {
    db = getDb();

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

    const verification = await verifyFulfillment(sessionId, allObs, intent);

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

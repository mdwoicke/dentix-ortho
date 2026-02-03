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
import { classifyCallerIntent, CallerIntent, ConversationTurn } from '../services/callerIntentClassifier';
import { mapToolSequence, ToolSequenceResult } from '../services/toolSequenceMapper';
import {
  transformToConversationTurns,
  filterInternalTraces,
} from './testMonitorController';
import { verifyFulfillment, FulfillmentVerdict } from '../services/fulfillmentVerifier';
import { createCloud9Client } from '../services/cloud9/client';

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

function buildCallReport(_traces: any[], observations: any[], transcript: any[]): CallReport {
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
async function fetchCurrentBookingData(callReport: CallReport): Promise<CurrentBookingData> {
  const result: CurrentBookingData = {
    parent: null,
    children: [],
    queriedAt: new Date().toISOString(),
    errors: [],
  };

  try {
    const client = createCloud9Client('production');

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

          const callReport = buildCallReport(sessionData.traces, sessionData.observations, transcript);

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
              currentBookingData = await fetchCurrentBookingData(callReport);
            } catch (err: any) {
              console.error(`CurrentBookingData fetch failed for cached session ${sessionId}:`, err.message);
            }
          }

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

    if (!sessionData) {
      // Try importing from Langfuse
      try {
        sessionData = await service.importSessionTraces(sessionId, configId);
      } catch (importErr: any) {
        res.status(404).json({ error: `Session not found in Langfuse: ${importErr.message}` });
        return;
      }
    }

    if (!sessionData || !sessionData.traces || sessionData.traces.length === 0) {
      res.status(404).json({ error: 'Session not found or has no traces' });
      return;
    }

    const traces = sessionData.traces.map((t: any) => ({
      traceId: t.trace_id,
      timestamp: t.started_at,
      name: t.name,
    }));

    // Build transcript from all traces
    const transcript = buildTranscript(sessionData.traces, sessionData.observations);

    const callReport = buildCallReport(sessionData.traces, sessionData.observations, transcript);

    // Classify intent
    let intent: CallerIntent | null = null;
    try {
      intent = await classifyCallerIntent(transcript);
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
        currentBookingData = await fetchCurrentBookingData(callReport);
      } catch (err: any) {
        console.error(`CurrentBookingData fetch failed for session ${sessionId}:`, err.message);
      }
    }

    res.json({
      sessionId,
      traces,
      transcript,
      callReport,
      currentBookingData,
      intent,
      toolSequence,
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

    if (!sessionData) {
      try {
        sessionData = await service.importSessionTraces(sessionId, configId);
      } catch (importErr: any) {
        res.status(404).json({ error: `Session not found: ${importErr.message}` });
        return;
      }
    }

    if (!sessionData || !sessionData.traces || sessionData.traces.length === 0) {
      res.status(404).json({ error: 'Session not found or has no traces' });
      return;
    }

    const transcript = buildTranscript(sessionData.traces, sessionData.observations);

    let intent: CallerIntent | null = null;
    try {
      intent = await classifyCallerIntent(transcript);
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

    if (!sessionData) {
      try {
        sessionData = await service.importSessionTraces(sessionId, configId);
      } catch (importErr: any) {
        res.status(404).json({ error: `Session not found: ${importErr.message}` });
        return;
      }
    }

    if (!sessionData || !sessionData.traces || sessionData.traces.length === 0) {
      res.status(404).json({ error: 'Session not found or has no traces' });
      return;
    }

    // Get or compute intent
    let intent: any = null;
    const cachedAnalysis = db.prepare(
      'SELECT caller_intent_type, caller_intent_confidence, caller_intent_summary, booking_details_json FROM session_analysis WHERE session_id = ?'
    ).get(sessionId) as any;

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
      } catch (err: any) {
        res.status(500).json({ error: `Intent classification failed: ${err.message}` });
        return;
      }
    }

    const allObs = filterInternalTraces(sessionData.observations);
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
 * Query monitoring_results with filters: dateFrom, dateTo, status, intentType, sessionId, limit, offset.
 */
export async function getMonitoringResults(req: Request, res: Response): Promise<void> {
  let db: BetterSqlite3.Database | null = null;

  try {
    db = getDb();

    // Ensure monitoring_results table exists (may not if monitoring hasn't run yet)
    db.exec(`
      CREATE TABLE IF NOT EXISTS monitoring_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL UNIQUE,
        intent_type TEXT,
        intent_confidence REAL,
        verification_status TEXT,
        verdict_summary TEXT,
        diagnostic_status TEXT,
        diagnostic_report_json TEXT,
        analyzed_at TEXT NOT NULL DEFAULT (datetime('now')),
        diagnosed_at TEXT
      );
    `);

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
      conditions.push('mr.analyzed_at >= ?');
      params.push(dateFrom);
    }
    if (dateTo) {
      conditions.push('mr.analyzed_at <= ?');
      params.push(dateTo + 'T23:59:59');
    }
    if (status) {
      const statuses = status.split(',').map(s => s.trim());
      conditions.push(`mr.verification_status IN (${statuses.map(() => '?').join(',')})`);
      params.push(...statuses);
    }
    if (intentType) {
      const types = intentType.split(',').map(s => s.trim());
      conditions.push(`mr.intent_type IN (${types.map(() => '?').join(',')})`);
      params.push(...types);
    }
    if (sessionId) {
      conditions.push('mr.session_id LIKE ?');
      params.push(`%${sessionId}%`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Count total
    const countRow = db.prepare(
      `SELECT COUNT(*) as total FROM monitoring_results mr ${whereClause}`
    ).get(...params) as any;
    const total = countRow?.total || 0;

    // Fetch results with optional join to session_analysis for caller_intent_summary
    const results = db.prepare(`
      SELECT mr.*, sa.caller_intent_summary
      FROM monitoring_results mr
      LEFT JOIN session_analysis sa ON mr.session_id = sa.session_id
      ${whereClause}
      ORDER BY mr.analyzed_at DESC
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
    const client = createCloud9Client('production');
    const resp = await client.getAvailableAppts({
      locationGuid: DEFAULT_LOCATION_GUID,
      startDate: date,
      endDate: date,
    });

    const slots = resp.records || [];
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
    const client = createCloud9Client('production');
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
    const client = createCloud9Client('production');
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
    const client = createCloud9Client('production');

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

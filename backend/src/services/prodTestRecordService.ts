/**
 * Production Test Record Service
 * Tracks patients and appointments created in Production environment for cleanup
 *
 * Features:
 * - Import from Langfuse traces (parse SetPatient/SetAppointment success responses)
 * - Cancel appointments via Cloud9 API
 * - Status tracking for cleanup workflow
 */

import BetterSqlite3 from 'better-sqlite3';
import { EventEmitter } from 'events';
import { Cloud9Client } from './cloud9/client';
import { Cloud9Config } from '../config/cloud9';
import { getToolNamesForConfig, sqlInList } from './toolNameResolver';

// Rate limit buffer between Cloud9 API calls (5 seconds)
export const CANCELLATION_DELAY_MS = 5000;

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface ProdTestRecord {
  id: number;
  record_type: 'patient' | 'appointment';

  // Cloud9 identifiers
  patient_guid: string;
  appointment_guid: string | null;

  // Patient info
  patient_id: string | null;
  patient_first_name: string | null;
  patient_last_name: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  patient_birthdate: string | null;

  // Appointment info
  appointment_datetime: string | null;
  appointment_type: string | null;
  appointment_type_guid: string | null;
  appointment_minutes: number | null;

  // Location/Provider context
  location_guid: string | null;
  location_name: string | null;
  provider_guid: string | null;
  provider_name: string | null;
  schedule_view_guid: string | null;
  schedule_column_guid: string | null;
  chair: string | null;

  // Langfuse tracing
  trace_id: string | null;
  observation_id: string | null;
  session_id: string | null;
  langfuse_config_id: number | null;

  // Status tracking
  status: 'active' | 'cancelled' | 'deleted' | 'cleanup_failed';
  cancelled_at: string | null;
  deleted_at: string | null;
  cleanup_notes: string | null;
  cleanup_error: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;
  cloud9_created_at: string | null;

  // Family linkage note (parent info, insurance, etc.)
  note: string | null;

  // v72 Individual Patient Model fields
  family_id: string | null;         // Links all family members together
  is_child: boolean;                // True if this is a child record
  parent_patient_guid: string | null; // For child records, references parent
}

export interface ImportOptions {
  configId: number;
  fromDate: string;
  toDate?: string;
}

export interface ImportResult {
  patientsFound: number;
  appointmentsFound: number;
  duplicatesSkipped: number;
  tracesAlreadyImported: number;
  tracesScanned: number;
  errors: string[];
}

export interface RecordStats {
  totalPatients: number;
  totalAppointments: number;
  activePatients: number;
  activeAppointments: number;
  cancelledAppointments: number;
  deletedRecords: number;
}

export interface CancelResult {
  success: boolean;
  appointmentGuid: string;
  message: string;
  error?: string;
}

export interface StreamingCancellationItem {
  id: number;
  appointmentGuid: string;
  patientName: string;
  appointmentDate: string | null;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'already_cancelled';
  error?: string;
}

export interface StreamingCancellationProgress {
  operationId: string;
  item: StreamingCancellationItem;
  currentIndex: number;
  total: number;
}

export interface StreamingCancellationSummary {
  operationId: string;
  total: number;
  succeeded: number;
  failed: number;
  alreadyCancelled: number;
}

// ============================================================================
// PROD TEST RECORD SERVICE
// ============================================================================

export class ProdTestRecordService {
  private db: BetterSqlite3.Database;
  private cloud9Client: Cloud9Client;

  constructor(db: BetterSqlite3.Database, cloud9ConfigOverride?: Cloud9Config) {
    this.db = db;
    // Use production environment for Cloud9 client since we're tracking prod data
    this.cloud9Client = new Cloud9Client('production', cloud9ConfigOverride);
  }

  // ============================================================================
  // IMPORT FROM LANGFUSE
  // ============================================================================

  /**
   * Import records from Langfuse traces by scanning for SetPatient/SetAppointment success responses
   * Ensures traces are only imported once by checking observation_id
   */
  async importFromLangfuse(options: ImportOptions): Promise<ImportResult> {
    const { configId, fromDate, toDate } = options;

    const result: ImportResult = {
      patientsFound: 0,
      appointmentsFound: 0,
      duplicatesSkipped: 0,
      tracesAlreadyImported: 0,
      tracesScanned: 0,
      errors: [],
    };

    try {
      // Get observations from production_trace_observations that match our criteria
      // Look for tool calls that created patients or appointments
      const importTools = getToolNamesForConfig(this.db, configId);
      let sql = `
        SELECT
          pto.observation_id,
          pto.trace_id,
          pto.name,
          pto.input,
          pto.output,
          pto.started_at,
          pt.session_id,
          pt.langfuse_config_id
        FROM production_trace_observations pto
        JOIN production_traces pt ON pto.trace_id = pt.trace_id
        WHERE pt.langfuse_config_id = ?
          AND pt.started_at >= ?
          AND (
            -- SetPatient success responses (matches "Patient Added:" or "Patient GUID Added:" or JSON patientGUID)
            (pto.name IN (${sqlInList(importTools.patientTools)}) AND (pto.output LIKE '%Patient Added:%' OR pto.output LIKE '%Patient GUID Added%' OR pto.output LIKE '%"patientGUID"%'))
            OR
            -- SetAppointment success responses (old text format or new JSON format)
            (pto.name IN (${sqlInList(importTools.schedulingTools)}) AND (pto.output LIKE '%Appointment GUID Added%' OR pto.output LIKE '%"appointmentGUID"%'))
            OR
            -- NexHealth: appointmentId present and not null
            (pto.name IN (${sqlInList(importTools.schedulingTools)}) AND pto.output LIKE '%"appointmentId":%' AND pto.output NOT LIKE '%"appointmentId":null%' AND pto.output NOT LIKE '%"appointmentId": null%')
            OR
            -- NexHealth K8: booking response has patient_id + provider_id + start_time (appointment object)
            (pto.name IN (${sqlInList(importTools.schedulingTools)}) AND pto.output LIKE '%"patient_id":%' AND pto.output LIKE '%"provider_id":%' AND pto.output LIKE '%"start_time":%')
          )
      `;

      const params: any[] = [configId, fromDate];

      if (toDate) {
        sql += ` AND pt.started_at <= ?`;
        params.push(toDate);
      }

      sql += ` ORDER BY pto.started_at ASC`;

      const observations = this.db.prepare(sql).all(...params) as any[];
      result.tracesScanned = observations.length;

      console.log(`[ProdTestRecordService] Found ${observations.length} potential records to import`);

      // Get all already-imported observation_ids for fast lookup
      const existingObservationIds = new Set<string>(
        (this.db.prepare(`
          SELECT DISTINCT observation_id FROM prod_test_records WHERE observation_id IS NOT NULL
        `).all() as any[]).map(r => r.observation_id)
      );

      for (const obs of observations) {
        try {
          // Check if this observation has already been imported (trace-level duplicate prevention)
          if (obs.observation_id && existingObservationIds.has(obs.observation_id)) {
            result.tracesAlreadyImported++;
            continue;
          }

          const input = this.parseJson(obs.input);
          const output = this.parseJson(obs.output);

          // Determine if this is a patient or appointment creation
          if (importTools.patientTools.includes(obs.name) && output) {
            const patientGuid = this.extractPatientGuid(output);
            if (patientGuid) {
              const imported = this.importPatientRecord(obs, input, patientGuid);
              if (imported) {
                result.patientsFound++;
                existingObservationIds.add(obs.observation_id); // Add to set for subsequent checks
              } else {
                result.duplicatesSkipped++;
              }
            }
          } else if (importTools.schedulingTools.includes(obs.name) && output) {
            const appointmentGuid = this.extractAppointmentGuid(output);
            if (appointmentGuid) {
              const imported = await this.importAppointmentRecord(obs, input, appointmentGuid, output);
              if (imported) {
                result.appointmentsFound++;
                existingObservationIds.add(obs.observation_id); // Add to set for subsequent checks
              } else {
                result.duplicatesSkipped++;
              }
            }
          }
        } catch (err: any) {
          result.errors.push(`Error processing observation ${obs.observation_id}: ${err.message}`);
        }
      }

      console.log(`[ProdTestRecordService] Import complete: ${result.patientsFound} patients, ${result.appointmentsFound} appointments, ${result.duplicatesSkipped} GUID duplicates, ${result.tracesAlreadyImported} traces already imported`);

    } catch (err: any) {
      result.errors.push(`Import failed: ${err.message}`);
      console.error('[ProdTestRecordService] Import error:', err);
    }

    return result;
  }

  /**
   * Extract Patient GUID from SetPatient response
   * Patterns: "Patient Added: {guid}" or "Patient GUID Added: {guid}" or patientGUID field
   */
  private extractPatientGuid(output: any): string | null {
    // First check for patientGUID in JSON response (most reliable)
    if (typeof output === 'object' && output.patientGUID) {
      return output.patientGUID;
    }

    // NexHealth: patientId (integer)
    if (typeof output === 'object' && output.patientId) {
      return String(output.patientId);
    }

    // New format: parent.patientGUID or parent.patientId
    if (typeof output === 'object' && output.parent?.patientGUID) {
      return output.parent.patientGUID;
    }
    if (typeof output === 'object' && output.parent?.patientId) {
      return String(output.parent.patientId);
    }

    // New format: children[].patientGUID or children[].patientId (return first one found)
    if (typeof output === 'object' && output.children && Array.isArray(output.children)) {
      for (const child of output.children) {
        if (child.patientGUID) {
          return child.patientGUID;
        }
        if (child.patientId) {
          return String(child.patientId);
        }
      }
    }

    // NexHealth K8: "patient_id" field with context (booking response)
    if (typeof output === 'object' && output.patient_id) {
      return String(output.patient_id);
    }

    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

    // Pattern: "Patient Added: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    const patientAddedMatch = outputStr.match(/Patient Added:\s*([a-f0-9-]{36})/i);
    if (patientAddedMatch) return patientAddedMatch[1];

    // Pattern: "Patient GUID Added: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    const guidAddedMatch = outputStr.match(/Patient GUID Added:\s*([a-f0-9-]{36})/i);
    if (guidAddedMatch) return guidAddedMatch[1];

    // Fallback: extract from JSON string with regex (Cloud9 UUID)
    const jsonMatch = outputStr.match(/"patientGUID"\s*:\s*"([a-f0-9-]{36})"/i);
    if (jsonMatch) return jsonMatch[1];

    // Fallback: NexHealth integer patientId in JSON string
    const patientIdMatch = outputStr.match(/"patientId"\s*:\s*(\d+)/);
    if (patientIdMatch) return patientIdMatch[1];

    return null;
  }

  /**
   * Extract Appointment GUID from SetAppointment response
   * Pattern: "Appointment GUID Added: {guid}" or similar, or JSON formats
   */
  private extractAppointmentGuid(output: any): string | null {
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

    // Pattern: "Appointment GUID Added: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    const match = outputStr.match(/Appointment GUID Added:\s*([a-f0-9-]{36})/i);
    if (match) return match[1];

    // Alternative pattern: appointmentGUID in JSON response (top level)
    if (typeof output === 'object' && output.appointmentGUID) {
      return output.appointmentGUID;
    }

    // NexHealth: appointmentId (integer) at top level
    if (typeof output === 'object' && output.appointmentId) {
      return String(output.appointmentId);
    }

    // New format: nested in children[].appointment.appointmentGUID or children[].appointment.appointmentId
    if (typeof output === 'object' && output.children && Array.isArray(output.children)) {
      for (const child of output.children) {
        if (child.appointment?.appointmentGUID) {
          return child.appointment.appointmentGUID;
        }
        if (child.appointment?.appointmentId) {
          return String(child.appointment.appointmentId);
        }
        // NexHealth: appointmentId directly on child
        if (child.appointmentId) {
          return String(child.appointmentId);
        }
      }
    }

    // NexHealth K8: "id" field in booking response with patient_id context
    if (typeof output === 'object' && output.id && output.patient_id) {
      return String(output.id);
    }

    // Fallback: extract from JSON string with regex (Cloud9 UUID)
    const jsonMatch = outputStr.match(/"appointmentGUID"\s*:\s*"([a-f0-9-]{36})"/i);
    if (jsonMatch) return jsonMatch[1];

    // Fallback: NexHealth integer appointmentId in JSON string
    const apptIdMatch = outputStr.match(/"appointmentId"\s*:\s*(\d+)/);
    if (apptIdMatch) return apptIdMatch[1];

    return null;
  }

  /**
   * Extract child info from the trace's Call_Summary by matching appointment GUID
   * The LLM outputs a Call_Summary with Child1_appointmentGUID, Child2_appointmentGUID, etc.
   * that maps to Child1_FirstName, Child1_LastName, Child1_DOB, etc.
   */
  private extractChildInfoFromCallSummary(traceId: string, appointmentGuid: string): {
    childName: string | null;
    childDOB: string | null;
    insuranceProvider: string | null;
    groupID: string | null;
    memberID: string | null;
  } | null {
    try {
      // Get the trace output which contains the Call_Summary
      const trace = this.db.prepare(`
        SELECT output FROM production_traces WHERE trace_id = ?
      `).get(traceId) as any;

      if (!trace || !trace.output) return null;

      let outputStr = typeof trace.output === 'string' ? trace.output : JSON.stringify(trace.output);

      // If the output is a JSON-encoded string (starts with "), parse it first
      if (outputStr.startsWith('"')) {
        try {
          outputStr = JSON.parse(outputStr);
        } catch (e) {
          // Continue with original string
        }
      }

      // Extract the PAYLOAD JSON from the output
      const payloadMatch = outputStr.match(/PAYLOAD:\s*(\{[\s\S]*\})/);
      if (!payloadMatch) return null;

      // Parse the PAYLOAD
      let payload: any;
      try {
        payload = JSON.parse(payloadMatch[1]);
      } catch (e) {
        // Try parsing with escaped quotes removed
        try {
          const cleaned = payloadMatch[1].replace(/\\"/g, '"').replace(/\\n/g, ' ');
          payload = JSON.parse(cleaned);
        } catch (e2) {
          return null;
        }
      }

      const callSummary = payload?.Call_Summary;
      if (!callSummary) return null;

      const upperApptGuid = appointmentGuid.toUpperCase();

      // Check Child1, Child2, Child3, etc.
      for (let i = 1; i <= 5; i++) {
        const childApptGuid = callSummary[`Child${i}_appointmentGUID`] || callSummary[`Child${i}_appointmentId`];
        if (childApptGuid && childApptGuid.toUpperCase() === upperApptGuid) {
          const firstName = callSummary[`Child${i}_FirstName`];
          const lastName = callSummary[`Child${i}_LastName`];
          const dob = callSummary[`Child${i}_DOB`];

          if (firstName) {
            console.log(`[ProdTestRecordService] Found child info in Call_Summary: Child${i} = ${firstName} ${lastName || ''}`);
            return {
              childName: lastName ? `${firstName} ${lastName}` : firstName,
              childDOB: dob || null,
              insuranceProvider: callSummary.insurance_provider || callSummary.insuranceProvider || null,
              groupID: callSummary.insurance_group || callSummary.groupID || null,
              memberID: callSummary.insurance_member_id || callSummary.memberID || null,
            };
          }
        }
      }

      return null;
    } catch (err: any) {
      console.log(`[ProdTestRecordService] Error extracting child info from Call_Summary: ${err.message}`);
      return null;
    }
  }

  /**
   * Import a patient record from observation data
   */
  private importPatientRecord(obs: any, input: any, patientGuid: string): boolean {
    // Check for duplicate
    const existing = this.db.prepare(`
      SELECT id FROM prod_test_records WHERE patient_guid = ? AND record_type = 'patient'
    `).get(patientGuid);

    if (existing) {
      console.log(`[ProdTestRecordService] Skipping duplicate patient: ${patientGuid}`);
      return false;
    }

    // Extract patient info from input
    const patientData = input || {};

    this.db.prepare(`
      INSERT INTO prod_test_records (
        record_type, patient_guid, appointment_guid,
        patient_first_name, patient_last_name, patient_email, patient_phone, patient_birthdate,
        location_guid, location_name, provider_guid, provider_name,
        trace_id, observation_id, session_id, langfuse_config_id,
        status, cloud9_created_at,
        family_id, is_child, parent_patient_guid
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'patient',
      patientGuid,
      null,
      patientData.patientFirstName || patientData.firstName || null,
      patientData.patientLastName || patientData.lastName || null,
      patientData.email || null,
      patientData.phoneNumber || patientData.phone || null,
      patientData.birthdayDateTime || patientData.birthdate || null,
      patientData.locationGUID || null,
      patientData.locationName || null,
      patientData.providerGUID || null,
      patientData.providerName || null,
      obs.trace_id,
      obs.observation_id,
      obs.session_id,
      obs.langfuse_config_id,
      'active',
      obs.started_at,
      // v72 Individual Patient Model fields
      patientData.familyId || patientData.family_id || null,
      patientData.isChild || patientData.is_child ? 1 : 0,
      patientData.parentPatientGuid || patientData.parent_patient_guid || null
    );

    console.log(`[ProdTestRecordService] Imported patient: ${patientGuid} (isChild: ${patientData.isChild || false})`);
    return true;
  }

  /**
   * Import an appointment record from observation data
   * Looks up patient info from existing records or Cloud9 API if not in input
   * For new JSON format (v71+), patient/appointment data is in output.children[]
   */
  private async importAppointmentRecord(obs: any, input: any, appointmentGuid: string, output?: any): Promise<boolean> {
    // Check for duplicate
    const existing = this.db.prepare(`
      SELECT id FROM prod_test_records WHERE appointment_guid = ? AND record_type = 'appointment'
    `).get(appointmentGuid);

    if (existing) {
      console.log(`[ProdTestRecordService] Skipping duplicate appointment: ${appointmentGuid}`);
      return false;
    }

    // Extract appointment info from input (old format) or output (new JSON format)
    const apptData = input || {};

    // Try to get patient GUID from output.children[] (new format) first
    let patientGuid = apptData.PatientGUID || apptData.patientGUID || '';
    let childInfo: any = null;

    // New JSON format: Find the child with matching appointmentGUID or appointmentId
    if (output?.children && Array.isArray(output.children)) {
      childInfo = output.children.find((c: any) =>
        c.appointment?.appointmentGUID === appointmentGuid
        || String(c.appointment?.appointmentId) === appointmentGuid
        || String(c.appointmentId) === appointmentGuid
      );
      if (childInfo) {
        // Cloud9: patientGUID (UUID), NexHealth: patientId (integer)
        patientGuid = childInfo.patientGUID || (childInfo.patientId ? String(childInfo.patientId) : null) || patientGuid;
        console.log(`[ProdTestRecordService] Found child info from output: ${childInfo.firstName || 'Unknown'} (${patientGuid})`);
      }
    }

    // Try to get patient name from multiple sources
    // Priority: childInfo (from output) > parsed input children > parent lastName > apptData > existing records > Cloud9 API
    let patientFirstName = childInfo?.firstName || apptData.patientFirstName || null;
    let patientLastName = childInfo?.lastName || apptData.patientLastName || null;

    // If no lastName from output, try to get it from the input's children JSON string
    // The input has children as a JSON string like: "[{\"firstName\":\"Kalli\",\"lastName\":\"Test\",...}]"
    if (!patientLastName && apptData.children && typeof apptData.children === 'string') {
      try {
        const parsedChildren = JSON.parse(apptData.children);
        if (Array.isArray(parsedChildren) && parsedChildren.length > 0) {
          // Find the child that matches the firstName or just use the first one's lastName
          const matchingChild = parsedChildren.find((c: any) =>
            c.firstName?.toLowerCase() === (childInfo?.firstName || patientFirstName || '').toLowerCase()
          );
          const childFromInput = matchingChild || parsedChildren[0];
          if (childFromInput?.lastName) {
            patientLastName = childFromInput.lastName;
            console.log(`[ProdTestRecordService] Got lastName from input children: ${patientLastName}`);
          }
        }
      } catch (e) {
        // Ignore parsing errors
      }
    }

    // If still no lastName, use parent's lastName (same family)
    if (!patientLastName && output?.parent?.lastName) {
      patientLastName = output.parent.lastName;
      console.log(`[ProdTestRecordService] Got lastName from parent: ${patientLastName}`);
    }

    // Also extract family and parent info from output for the new format
    let familyId = output?.familyId || apptData.familyId || apptData.family_id || null;
    // Cloud9: parent.patientGUID, NexHealth: parent.patientId
    let parentPatientGuid = output?.parent?.patientGUID || (output?.parent?.patientId ? String(output.parent.patientId) : null) || apptData.parentPatientGuid || apptData.parent_patient_guid || null;
    let isChild = childInfo ? true : (apptData.isChild || apptData.is_child || false);
    // Cloud9: startTime, NexHealth: start_time
    let appointmentStartTime = childInfo?.appointment?.startTime || childInfo?.appointment?.start_time || apptData.StartTime || apptData.startTime || null;

    // If patient name not in input, try to get from existing records
    if (!patientFirstName && !patientLastName && patientGuid) {
      const existingPatient = this.db.prepare(`
        SELECT patient_first_name, patient_last_name FROM prod_test_records
        WHERE patient_guid = ? AND (patient_first_name IS NOT NULL OR patient_last_name IS NOT NULL)
        LIMIT 1
      `).get(patientGuid) as any;

      if (existingPatient) {
        patientFirstName = existingPatient.patient_first_name;
        patientLastName = existingPatient.patient_last_name;
        console.log(`[ProdTestRecordService] Got patient name from existing record: ${patientFirstName} ${patientLastName}`);
      }
    }

    // If still no name, try Cloud9 API lookup (only for UUID-format GUIDs, not NexHealth integer IDs)
    const isUuidFormat = patientGuid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patientGuid);
    if (!patientFirstName && !patientLastName && isUuidFormat) {
      try {
        console.log(`[ProdTestRecordService] Looking up patient info from Cloud9 for: ${patientGuid}`);
        const cloud9Response = await this.cloud9Client.getPatientInformation(patientGuid);
        if (cloud9Response.status === 'Success' && cloud9Response.records.length > 0) {
          const patientInfo = cloud9Response.records[0];
          // Try separate name fields first
          patientFirstName = patientInfo.FirstName || patientInfo.persFirstName || null;
          patientLastName = patientInfo.LastName || patientInfo.persLastName || null;

          // If no separate names but we have PatientFullName, split it
          // Cloud9 GetPatientInformation returns PatientFullName as combined "FirstName LastName"
          if (!patientFirstName && !patientLastName && patientInfo.PatientFullName) {
            const fullName = (patientInfo.PatientFullName || '').trim();
            const parts = fullName.split(' ');
            patientFirstName = parts[0] || null;
            patientLastName = parts.slice(1).join(' ') || null;
          }
          console.log(`[ProdTestRecordService] Got patient name from Cloud9: ${patientFirstName} ${patientLastName}`);
        }
      } catch (err: any) {
        console.log(`[ProdTestRecordService] Could not look up patient from Cloud9: ${err.message}`);
      }
    }

    // Extract or construct note from apptData - this contains child info for parent-as-patient model
    // The note may be directly in apptData.note, OR we need to construct it from child fields
    // (same logic as the scheduling tool which constructs: "Child: X | DOB: Y | Insurance: Z")
    let appointmentNote = apptData.note || apptData.Note || null;

    // If no direct note but we have child info, construct it (matches scheduling tool v54 format)
    if (!appointmentNote && apptData.childName) {
      const parts: string[] = [`Child: ${apptData.childName}`];
      if (apptData.childDOB) parts.push(`DOB: ${apptData.childDOB}`);
      if (apptData.insuranceProvider) parts.push(`Insurance: ${apptData.insuranceProvider}`);
      if (apptData.groupID) parts.push(`GroupID: ${apptData.groupID}`);
      if (apptData.memberID) parts.push(`MemberID: ${apptData.memberID}`);
      appointmentNote = parts.join(' | ');
      console.log(`[ProdTestRecordService] Constructed note from child info: ${appointmentNote}`);
    }

    // If still no note, try to extract child info from the trace's Call_Summary
    // The LLM outputs Child1_appointmentGUID, Child2_appointmentGUID, etc. in the Call_Summary
    if (!appointmentNote && obs.trace_id) {
      const childInfo = this.extractChildInfoFromCallSummary(obs.trace_id, appointmentGuid);
      if (childInfo && childInfo.childName) {
        const parts: string[] = [`Child: ${childInfo.childName}`];
        if (childInfo.childDOB) parts.push(`DOB: ${childInfo.childDOB}`);
        if (childInfo.insuranceProvider) parts.push(`Insurance: ${childInfo.insuranceProvider}`);
        if (childInfo.groupID) parts.push(`GroupID: ${childInfo.groupID}`);
        if (childInfo.memberID) parts.push(`MemberID: ${childInfo.memberID}`);
        appointmentNote = parts.join(' | ');
        console.log(`[ProdTestRecordService] Constructed note from Call_Summary: ${appointmentNote}`);
      }
    }

    this.db.prepare(`
      INSERT INTO prod_test_records (
        record_type, patient_guid, appointment_guid,
        patient_first_name, patient_last_name,
        appointment_datetime, appointment_type, appointment_type_guid, appointment_minutes,
        location_guid, location_name, provider_guid, provider_name,
        schedule_view_guid, schedule_column_guid,
        trace_id, observation_id, session_id, langfuse_config_id,
        status, cloud9_created_at, note,
        family_id, is_child, parent_patient_guid
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'appointment',
      patientGuid,
      appointmentGuid,
      patientFirstName,
      patientLastName,
      appointmentStartTime,
      apptData.appointmentType || null,
      apptData.AppointmentTypeGUID || apptData.appointmentTypeGUID || null,
      apptData.Minutes || apptData.minutes || null,
      apptData.locationGUID || null,
      apptData.locationName || null,
      apptData.providerGUID || null,
      apptData.providerName || null,
      apptData.ScheduleViewGUID || apptData.scheduleViewGUID || null,
      apptData.ScheduleColumnGUID || apptData.scheduleColumnGUID || null,
      obs.trace_id,
      obs.observation_id,
      obs.session_id,
      obs.langfuse_config_id,
      'active',
      obs.started_at,
      appointmentNote,
      // v72 Individual Patient Model fields - use extracted values from output when available
      familyId,
      isChild ? 1 : 0,
      parentPatientGuid
    );

    console.log(`[ProdTestRecordService] Imported appointment: ${appointmentGuid} (patient: ${patientFirstName || 'Unknown'} ${patientLastName || ''}, isChild: ${isChild})${appointmentNote ? ' with note' : ''}`);
    return true;
  }

  /**
   * Update notes for existing appointment records by re-parsing observation data
   * This is useful for records that were imported before the note field was populated
   */
  async updateNotesFromObservations(sessionId?: string): Promise<{ updated: number; errors: string[] }> {
    const result = { updated: 0, errors: [] as string[] };

    try {
      // Find appointment records that have no note but have an observation_id
      let sql = `
        SELECT ptr.id, ptr.appointment_guid, ptr.observation_id
        FROM prod_test_records ptr
        WHERE ptr.record_type = 'appointment'
          AND (ptr.note IS NULL OR ptr.note = '')
          AND ptr.observation_id IS NOT NULL
      `;
      const params: any[] = [];

      if (sessionId) {
        sql += ` AND ptr.session_id = ?`;
        params.push(sessionId);
      }

      const recordsToUpdate = this.db.prepare(sql).all(...params) as any[];
      console.log(`[ProdTestRecordService] Found ${recordsToUpdate.length} appointment records without notes`);

      for (const record of recordsToUpdate) {
        try {
          // Get the observation data including trace_id
          const obs = this.db.prepare(`
            SELECT input, trace_id FROM production_trace_observations WHERE observation_id = ?
          `).get(record.observation_id) as any;

          if (!obs) continue;

          const input = obs.input ? this.parseJson(obs.input) : null;

          // Construct note from child info (same logic as importAppointmentRecord)
          let appointmentNote: string | null = null;
          if (input && input.childName) {
            const parts: string[] = [`Child: ${input.childName}`];
            if (input.childDOB) parts.push(`DOB: ${input.childDOB}`);
            if (input.insuranceProvider) parts.push(`Insurance: ${input.insuranceProvider}`);
            if (input.groupID) parts.push(`GroupID: ${input.groupID}`);
            if (input.memberID) parts.push(`MemberID: ${input.memberID}`);
            appointmentNote = parts.join(' | ');
          }

          // If no childName in tool input, try to extract from Call_Summary
          if (!appointmentNote && obs.trace_id && record.appointment_guid) {
            const childInfo = this.extractChildInfoFromCallSummary(obs.trace_id, record.appointment_guid);
            if (childInfo && childInfo.childName) {
              const parts: string[] = [`Child: ${childInfo.childName}`];
              if (childInfo.childDOB) parts.push(`DOB: ${childInfo.childDOB}`);
              if (childInfo.insuranceProvider) parts.push(`Insurance: ${childInfo.insuranceProvider}`);
              if (childInfo.groupID) parts.push(`GroupID: ${childInfo.groupID}`);
              if (childInfo.memberID) parts.push(`MemberID: ${childInfo.memberID}`);
              appointmentNote = parts.join(' | ');
              console.log(`[ProdTestRecordService] Extracted note from Call_Summary for ${record.appointment_guid}`);
            }
          }

          if (appointmentNote) {
            this.db.prepare(`
              UPDATE prod_test_records SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
            `).run(appointmentNote, record.id);
            result.updated++;
            console.log(`[ProdTestRecordService] Updated note for appointment ${record.appointment_guid}: ${appointmentNote}`);
          }
        } catch (err: any) {
          result.errors.push(`Error updating record ${record.id}: ${err.message}`);
        }
      }

      console.log(`[ProdTestRecordService] Note update complete: ${result.updated} records updated`);
    } catch (err: any) {
      result.errors.push(`Update failed: ${err.message}`);
      console.error('[ProdTestRecordService] Note update error:', err);
    }

    return result;
  }

  /**
   * Update notes for existing appointment records by searching all traces for matching appointment GUIDs
   * This is useful for records created by goal tests that don't have observation_id set
   * It searches production_traces for Call_Summaries containing Child{N}_appointmentGUID matches
   */
  async updateNotesFromAllTraces(appointmentGuid?: string): Promise<{ updated: number; errors: string[] }> {
    const result = { updated: 0, errors: [] as string[] };

    try {
      // Find appointment records that have no note
      let sql = `
        SELECT id, appointment_guid, trace_id
        FROM prod_test_records
        WHERE record_type = 'appointment'
          AND (note IS NULL OR note = '')
          AND appointment_guid IS NOT NULL
      `;
      const params: any[] = [];

      if (appointmentGuid) {
        sql += ` AND UPPER(appointment_guid) = UPPER(?)`;
        params.push(appointmentGuid);
      }

      const recordsToUpdate = this.db.prepare(sql).all(...params) as any[];
      console.log(`[ProdTestRecordService] Found ${recordsToUpdate.length} appointment records without notes`);

      // Get all traces that might contain appointment info in their output
      const traces = this.db.prepare(`
        SELECT trace_id, output FROM production_traces
        WHERE output LIKE '%appointmentGUID%' OR output LIKE '%appointmentId%'
      `).all() as any[];

      console.log(`[ProdTestRecordService] Found ${traces.length} traces with appointment info`);

      for (const record of recordsToUpdate) {
        try {
          // First try using the existing trace_id if set
          if (record.trace_id) {
            const childInfo = this.extractChildInfoFromCallSummary(record.trace_id, record.appointment_guid);
            if (childInfo && childInfo.childName) {
              const parts: string[] = [`Child: ${childInfo.childName}`];
              if (childInfo.childDOB) parts.push(`DOB: ${childInfo.childDOB}`);
              if (childInfo.insuranceProvider) parts.push(`Insurance: ${childInfo.insuranceProvider}`);
              if (childInfo.groupID) parts.push(`GroupID: ${childInfo.groupID}`);
              if (childInfo.memberID) parts.push(`MemberID: ${childInfo.memberID}`);
              const appointmentNote = parts.join(' | ');

              this.db.prepare(`
                UPDATE prod_test_records SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
              `).run(appointmentNote, record.id);
              result.updated++;
              console.log(`[ProdTestRecordService] Updated note for ${record.appointment_guid} from trace_id: ${appointmentNote}`);
              continue;
            }
          }

          // Search through all traces for one that contains this appointment GUID
          const upperApptGuid = record.appointment_guid.toUpperCase();
          for (const trace of traces) {
            if (!trace.output) continue;

            // Check if this trace output contains the appointment GUID
            if (trace.output.toUpperCase().includes(upperApptGuid)) {
              const childInfo = this.extractChildInfoFromCallSummary(trace.trace_id, record.appointment_guid);
              if (childInfo && childInfo.childName) {
                const parts: string[] = [`Child: ${childInfo.childName}`];
                if (childInfo.childDOB) parts.push(`DOB: ${childInfo.childDOB}`);
                if (childInfo.insuranceProvider) parts.push(`Insurance: ${childInfo.insuranceProvider}`);
                if (childInfo.groupID) parts.push(`GroupID: ${childInfo.groupID}`);
                if (childInfo.memberID) parts.push(`MemberID: ${childInfo.memberID}`);
                const appointmentNote = parts.join(' | ');

                this.db.prepare(`
                  UPDATE prod_test_records SET note = ?, trace_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
                `).run(appointmentNote, trace.trace_id, record.id);
                result.updated++;
                console.log(`[ProdTestRecordService] Updated note for ${record.appointment_guid} from searched trace: ${appointmentNote}`);
                break;
              }
            }
          }
        } catch (err: any) {
          result.errors.push(`Error updating record ${record.id}: ${err.message}`);
        }
      }

      console.log(`[ProdTestRecordService] Note update from all traces complete: ${result.updated} records updated`);
    } catch (err: any) {
      result.errors.push(`Update failed: ${err.message}`);
      console.error('[ProdTestRecordService] Note update from all traces error:', err);
    }

    return result;
  }

  /**
   * Import traces for a specific patient GUID
   * Searches production_trace_observations for any traces that created/booked for this patient
   * and imports the notes from those observations
   * Also enriches records with full Cloud9 data (location, provider, chair names, etc.)
   */
  async importByPatientGuid(patientGuid: string): Promise<{
    appointmentsImported: number;
    appointmentsUpdated: number;
    appointmentsEnriched: number;
    errors: string[];
  }> {
    const result = { appointmentsImported: 0, appointmentsUpdated: 0, appointmentsEnriched: 0, errors: [] as string[] };

    if (!patientGuid) {
      result.errors.push('patientGuid is required');
      return result;
    }

    try {
      const upperPatientGuid = patientGuid.toUpperCase();
      console.log(`[ProdTestRecordService] Importing traces for patient: ${upperPatientGuid}`);

      // Find observations where the input contains this patient GUID (for book_child calls)
      const allSchedIn = sqlInList(['schedule_appointment_ortho', 'chord_scheduling_v08', 'chord_scheduling_v07_dev']);
      const observations = this.db.prepare(`
        SELECT
          pto.observation_id,
          pto.trace_id,
          pto.name,
          pto.input,
          pto.output,
          pto.started_at,
          pt.session_id,
          pt.langfuse_config_id
        FROM production_trace_observations pto
        JOIN production_traces pt ON pto.trace_id = pt.trace_id
        WHERE pto.name IN (${allSchedIn})
          AND (pto.output LIKE '%Appointment GUID Added%' OR (pto.output LIKE '%"appointmentId":%' AND pto.output NOT LIKE '%"appointmentId":null%') OR (pto.output LIKE '%"patient_id":%' AND pto.output LIKE '%"provider_id":%' AND pto.output LIKE '%"start_time":%'))
          AND UPPER(pto.input) LIKE '%' || ? || '%'
        ORDER BY pto.started_at DESC
      `).all(upperPatientGuid) as any[];

      console.log(`[ProdTestRecordService] Found ${observations.length} matching observations`);

      for (const obs of observations) {
        try {
          const input = this.parseJson(obs.input);
          const output = this.parseJson(obs.output);

          if (!input || !output) continue;

          const appointmentGuid = this.extractAppointmentGuid(output);
          if (!appointmentGuid) continue;

          // Check if this appointment already exists in prod_test_records
          const existing = this.db.prepare(`
            SELECT id, note FROM prod_test_records
            WHERE UPPER(appointment_guid) = UPPER(?) AND record_type = 'appointment'
          `).get(appointmentGuid) as any;

          // Construct note from child info - first try tool input, then Call_Summary
          let appointmentNote: string | null = null;
          if (input.childName) {
            const parts: string[] = [`Child: ${input.childName}`];
            if (input.childDOB) parts.push(`DOB: ${input.childDOB}`);
            if (input.insuranceProvider) parts.push(`Insurance: ${input.insuranceProvider}`);
            if (input.groupID) parts.push(`GroupID: ${input.groupID}`);
            if (input.memberID) parts.push(`MemberID: ${input.memberID}`);
            appointmentNote = parts.join(' | ');
          }

          // If no childName in tool input, try to extract from Call_Summary
          if (!appointmentNote && obs.trace_id) {
            const childInfo = this.extractChildInfoFromCallSummary(obs.trace_id, appointmentGuid);
            if (childInfo && childInfo.childName) {
              const parts: string[] = [`Child: ${childInfo.childName}`];
              if (childInfo.childDOB) parts.push(`DOB: ${childInfo.childDOB}`);
              if (childInfo.insuranceProvider) parts.push(`Insurance: ${childInfo.insuranceProvider}`);
              if (childInfo.groupID) parts.push(`GroupID: ${childInfo.groupID}`);
              if (childInfo.memberID) parts.push(`MemberID: ${childInfo.memberID}`);
              appointmentNote = parts.join(' | ');
              console.log(`[ProdTestRecordService] Extracted note from Call_Summary for ${appointmentGuid}`);
            }
          }

          if (existing) {
            // Update existing record with note if it doesn't have one
            if (!existing.note && appointmentNote) {
              this.db.prepare(`
                UPDATE prod_test_records SET note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
              `).run(appointmentNote, existing.id);
              result.appointmentsUpdated++;
              console.log(`[ProdTestRecordService] Updated note for appointment ${appointmentGuid}`);
            }
          } else {
            // Import new record
            const imported = await this.importAppointmentRecord(obs, input, appointmentGuid, output);
            if (imported) {
              result.appointmentsImported++;
              console.log(`[ProdTestRecordService] Imported appointment ${appointmentGuid}`);
            }
          }
        } catch (err: any) {
          result.errors.push(`Error processing observation ${obs.observation_id}: ${err.message}`);
        }
      }

      // After importing traces, enrich all records for this patient with Cloud9 data
      const enrichResult = await this.enrichAppointmentsFromCloud9(patientGuid);
      result.appointmentsEnriched = enrichResult.enriched;
      if (enrichResult.errors.length > 0) {
        result.errors.push(...enrichResult.errors);
      }

      console.log(`[ProdTestRecordService] Import by patient complete: ${result.appointmentsImported} imported, ${result.appointmentsUpdated} notes updated, ${result.appointmentsEnriched} enriched from Cloud9`);
    } catch (err: any) {
      result.errors.push(`Import failed: ${err.message}`);
      console.error('[ProdTestRecordService] Import by patient error:', err);
    }

    return result;
  }

  /**
   * Enrich local appointment records with full details from Cloud9 API
   * This fills in missing fields like location_name, provider_name, chair, appointment_type
   */
  async enrichAppointmentsFromCloud9(patientGuid: string): Promise<{ enriched: number; errors: string[] }> {
    const result = { enriched: 0, errors: [] as string[] };

    try {
      console.log(`[ProdTestRecordService] Enriching appointments from Cloud9 for patient: ${patientGuid}`);

      // Fetch full appointment details AND chair schedules from Cloud9 API in parallel
      const [cloud9Response, chairSchedulesResponse] = await Promise.all([
        this.cloud9Client.getPatientAppointments(patientGuid),
        this.cloud9Client.getChairSchedules(),
      ]);

      if (cloud9Response.status !== 'Success') {
        result.errors.push(`Cloud9 API error: ${cloud9Response.errorMessage || 'Unknown error'}`);
        return result;
      }

      console.log(`[ProdTestRecordService] Got ${cloud9Response.records.length} appointments from Cloud9`);

      // Build maps from chair schedules:
      // 1. schedule_column_guid -> chair description (for direct lookup)
      // 2. location_guid -> schedule_view_guids[] (for GetAppointmentsByDate calls)
      // 3. location_guid:svcOrder -> chair description (for translating Chair number)
      const scheduleColumnDescriptionMap = new Map<string, string>();
      const locationScheduleViewMap = new Map<string, string[]>();
      const svcOrderToChairMap = new Map<string, string>();

      if (chairSchedulesResponse.status === 'Success' && chairSchedulesResponse.records) {
        chairSchedulesResponse.records.forEach((schedule: any) => {
          // Map schedule column GUID to description
          if (schedule.schdcolGUID && schedule.schdcolDescription) {
            scheduleColumnDescriptionMap.set(schedule.schdcolGUID, schedule.schdcolDescription);
            scheduleColumnDescriptionMap.set(schedule.schdcolGUID.toUpperCase(), schedule.schdcolDescription);
          }

          // Map location GUID to schedule view GUIDs
          if (schedule.locGUID && schedule.schdvwGUID) {
            const existing = locationScheduleViewMap.get(schedule.locGUID) || [];
            if (!existing.includes(schedule.schdvwGUID)) {
              existing.push(schedule.schdvwGUID);
            }
            locationScheduleViewMap.set(schedule.locGUID, existing);
          }

          // Map location + svcOrder to chair description
          if (schedule.locGUID && schedule.svcOrder && schedule.schdcolDescription) {
            svcOrderToChairMap.set(`${schedule.locGUID}:${schedule.svcOrder}`, schedule.schdcolDescription);
          }
        });
        console.log(`[ProdTestRecordService] Built chair schedule map with ${scheduleColumnDescriptionMap.size / 2} entries, ${locationScheduleViewMap.size} locations`);
      }

      // Update or create local records from Cloud9 data
      for (const appt of cloud9Response.records) {
        try {
          const apptGuid = appt.AppointmentGUID || appt.appointment_guid;
          if (!apptGuid) continue;

          // Find the local record (including schedule_column_guid for chair lookup)
          const existing = this.db.prepare(`
            SELECT id, schedule_column_guid FROM prod_test_records
            WHERE UPPER(appointment_guid) = UPPER(?) AND record_type = 'appointment'
          `).get(apptGuid) as any;

          // Extract Cloud9 fields first (needed for both update and insert)
          const locationName = appt.LocationName || appt.location_name || null;
          const locationGuid = appt.LocationGUID || appt.location_guid || null;
          const providerName = appt.OrthodontistName || appt.orthodontist_name || appt.ProviderName || appt.provider_name || null;
          const appointmentType = appt.AppointmentTypeDescription || appt.appointment_type_description || null;
          const appointmentTypeGuid = appt.AppointmentTypeGUID || appt.appointment_type_guid || null;
          const appointmentMinutes = appt.Minutes || appt.minutes || appt.AppointmentMinutes || null;
          const appointmentDateTime = appt.AppointmentDateTime || appt.appointment_date_time || null;
          const patientName = appt.PatientFullName || appt.PatientName || appt.patient_name || '';
          const [patientLastName, patientFirstName] = patientName.includes(',')
            ? patientName.split(',').map((s: string) => s.trim())
            : ['', patientName];
          const scheduleViewGuid = appt.ScheduleViewGUID || appt.schedule_view_guid || null;
          const scheduleColumnGuid = appt.ScheduleColumnGUID || appt.schedule_column_guid || null;

          // If record doesn't exist locally, CREATE it from Cloud9 data
          if (!existing) {
            console.log(`[ProdTestRecordService] Creating new local record for Cloud9 appointment ${apptGuid}`);

            // Look up chair from schedule column
            let chair: string | null = null;
            if (scheduleColumnGuid) {
              chair = scheduleColumnDescriptionMap.get(scheduleColumnGuid) ||
                      scheduleColumnDescriptionMap.get(scheduleColumnGuid.toUpperCase()) ||
                      null;
            }

            // Try to find the Langfuse session that created this appointment
            // Search for trace observation with "Appointment GUID Added: {guid}" in output
            const langfuseMatch = this.db.prepare(`
              SELECT pt.trace_id, pt.session_id, pt.langfuse_config_id, pto.id as observation_id
              FROM production_trace_observations pto
              JOIN production_traces pt ON pto.trace_id = pt.trace_id
              WHERE pto.output LIKE ?
              ORDER BY pto.started_at DESC
              LIMIT 1
            `).get(`%${apptGuid}%`) as { trace_id: string; session_id: string; langfuse_config_id: number; observation_id: number } | undefined;

            if (langfuseMatch) {
              console.log(`[ProdTestRecordService] Found Langfuse session ${langfuseMatch.session_id} for appointment ${apptGuid}`);
            }

            this.db.prepare(`
              INSERT INTO prod_test_records (
                record_type, patient_guid, patient_first_name, patient_last_name,
                appointment_guid, appointment_datetime, appointment_type, appointment_type_guid,
                appointment_minutes, location_guid, location_name, provider_name,
                schedule_view_guid, schedule_column_guid, chair, status,
                trace_id, observation_id, session_id, langfuse_config_id,
                created_at, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
            `).run(
              'appointment',
              patientGuid.toUpperCase(),
              patientFirstName || null,
              patientLastName || null,
              apptGuid.toUpperCase(),
              appointmentDateTime,
              appointmentType,
              appointmentTypeGuid,
              appointmentMinutes,
              locationGuid,
              locationName,
              providerName,
              scheduleViewGuid,
              scheduleColumnGuid,
              chair,
              'active',
              langfuseMatch?.trace_id || null,
              langfuseMatch?.observation_id || null,
              langfuseMatch?.session_id || null,
              langfuseMatch?.langfuse_config_id || null
            );

            result.enriched++;
            console.log(`[ProdTestRecordService] Created appointment ${apptGuid}: location=${locationName}, provider=${providerName}, type=${appointmentType}, session=${langfuseMatch?.session_id || 'none'}`);
            continue;
          }

          // Chair lookup for existing records: Use local schedule_column_guid if Cloud9 didn't provide one
          let chair: string | null = null;
          const finalScheduleColumnGuid = scheduleColumnGuid || existing.schedule_column_guid;
          if (finalScheduleColumnGuid) {
            chair = scheduleColumnDescriptionMap.get(finalScheduleColumnGuid) ||
                    scheduleColumnDescriptionMap.get(finalScheduleColumnGuid.toUpperCase()) ||
                    null;
            if (chair) {
              console.log(`[ProdTestRecordService] Found chair for ${apptGuid}: ${finalScheduleColumnGuid} -> ${chair}`);
            }
          }

          // Update existing local record with enriched data (preserve existing note)
          const updateResult = this.db.prepare(`
            UPDATE prod_test_records SET
              location_name = COALESCE(?, location_name),
              location_guid = COALESCE(?, location_guid),
              provider_name = COALESCE(?, provider_name),
              appointment_type = COALESCE(?, appointment_type),
              appointment_type_guid = COALESCE(?, appointment_type_guid),
              appointment_minutes = COALESCE(?, appointment_minutes),
              appointment_datetime = COALESCE(?, appointment_datetime),
              chair = COALESCE(?, chair),
              updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).run(
            locationName,
            locationGuid,
            providerName,
            appointmentType,
            appointmentTypeGuid,
            appointmentMinutes,
            appointmentDateTime,
            chair,
            existing.id
          );

          if (updateResult.changes > 0) {
            result.enriched++;
            console.log(`[ProdTestRecordService] Enriched appointment ${apptGuid}: location=${locationName}, provider=${providerName}, type=${appointmentType}, chair=${chair}`);
          }
        } catch (err: any) {
          result.errors.push(`Error enriching appointment: ${err.message}`);
        }
      }

      // Fetch chair info via GetAppointmentsByDate for appointments without chair
      const appointmentsNeedingChair = this.db.prepare(`
        SELECT id, appointment_guid, appointment_datetime, location_guid
        FROM prod_test_records
        WHERE UPPER(patient_guid) = UPPER(?)
          AND record_type = 'appointment'
          AND chair IS NULL
          AND appointment_datetime IS NOT NULL
          AND location_guid IS NOT NULL
      `).all(patientGuid) as any[];

      if (appointmentsNeedingChair.length > 0) {
        console.log(`[ProdTestRecordService] Fetching chair info for ${appointmentsNeedingChair.length} appointments`);

        // Group by date and location to minimize API calls
        const dateLocationMap = new Map<string, { locationGuid: string; appointments: any[] }>();
        for (const appt of appointmentsNeedingChair) {
          // Parse date from appointment_datetime (format: "M/D/YYYY H:mm:ss AM/PM")
          const datePart = appt.appointment_datetime.split(' ')[0];
          const key = `${datePart}:${appt.location_guid}`;
          let existing = dateLocationMap.get(key);
          if (!existing) {
            existing = { locationGuid: appt.location_guid, appointments: [] as any[] };
            dateLocationMap.set(key, existing);
          }
          existing.appointments.push(appt);
        }

        // Fetch chair info for each date/location combo
        for (const [key, value] of dateLocationMap.entries()) {
          const datePart = key.split(':')[0];
          const scheduleViewGuids = locationScheduleViewMap.get(value.locationGuid) || [];

          if (scheduleViewGuids.length === 0) {
            console.log(`[ProdTestRecordService] No schedule views found for location ${value.locationGuid}`);
            continue;
          }

          // Fetch appointments for each schedule view
          for (const scheduleViewGuid of scheduleViewGuids) {
            try {
              const byDateResponse = await this.cloud9Client.getAppointmentsByDate(datePart, scheduleViewGuid);
              if (byDateResponse.status !== 'Success') continue;

              // Match appointments to get chair info
              for (const record of byDateResponse.records || []) {
                const apptGuid = record.AppointmentGUID?.toUpperCase();
                if (!apptGuid) continue;

                // Find matching appointment needing chair
                const matchingAppt = value.appointments.find(
                  (a: any) => a.appointment_guid?.toUpperCase() === apptGuid
                );

                if (matchingAppt) {
                  // Get chair from ScheduleColumnDescription or translate from Chair number via svcOrder
                  let chair = record.ScheduleColumnDescription || null;
                  if (!chair && record.Chair && value.locationGuid) {
                    chair = svcOrderToChairMap.get(`${value.locationGuid}:${record.Chair}`) || null;
                  }

                  if (chair) {
                    this.db.prepare(`
                      UPDATE prod_test_records SET chair = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
                    `).run(chair, matchingAppt.id);
                    console.log(`[ProdTestRecordService] Updated chair for ${apptGuid}: ${chair}`);
                  }
                }
              }
            } catch (err: any) {
              console.log(`[ProdTestRecordService] Error fetching appointments by date: ${err.message}`);
            }
          }
        }
      }

      console.log(`[ProdTestRecordService] Enrichment complete: ${result.enriched} appointments updated`);
    } catch (err: any) {
      result.errors.push(`Enrichment failed: ${err.message}`);
      console.error('[ProdTestRecordService] Enrichment error:', err);
    }

    return result;
  }

  // ============================================================================
  // CRUD OPERATIONS
  // ============================================================================

  /**
   * Get all records with optional filters
   */
  getRecords(options: {
    recordType?: 'patient' | 'appointment';
    status?: string;
    langfuseConfigId?: number;
    limit?: number;
    offset?: number;
    fromDate?: string;
    toDate?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  } = {}): { records: ProdTestRecord[]; total: number } {
    const {
      recordType,
      status,
      langfuseConfigId,
      limit = 100,
      offset = 0,
      fromDate,
      toDate,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = options;

    let whereClauses: string[] = ['1=1'];
    const params: any[] = [];

    if (recordType) {
      whereClauses.push('record_type = ?');
      params.push(recordType);
    }
    if (status) {
      whereClauses.push('status = ?');
      params.push(status);
    }
    if (langfuseConfigId) {
      whereClauses.push('langfuse_config_id = ?');
      params.push(langfuseConfigId);
    }
    if (fromDate) {
      whereClauses.push('created_at >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      whereClauses.push('created_at <= ?');
      params.push(toDate);
    }

    const whereClause = whereClauses.join(' AND ');

    // Validate sortBy to prevent SQL injection
    const allowedSortColumns = [
      'created_at', 'updated_at', 'cloud9_created_at', 'patient_first_name', 'patient_last_name',
      'record_type', 'status', 'appointment_datetime', 'location_name'
    ];
    const safeSortBy = allowedSortColumns.includes(sortBy) ? sortBy : 'cloud9_created_at';
    const safeSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    const records = this.db.prepare(`
      SELECT * FROM prod_test_records
      WHERE ${whereClause}
      ORDER BY ${safeSortBy} ${safeSortOrder}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as ProdTestRecord[];

    const countResult = this.db.prepare(`
      SELECT COUNT(*) as count FROM prod_test_records WHERE ${whereClause}
    `).get(...params) as any;

    return {
      records,
      total: countResult?.count || 0,
    };
  }

  /**
   * Get a single record by ID
   */
  getRecord(id: number): ProdTestRecord | null {
    return this.db.prepare(`
      SELECT * FROM prod_test_records WHERE id = ?
    `).get(id) as ProdTestRecord | null;
  }

  /**
   * Get appointments by patient GUID from local database
   * Returns appointments in format compatible with the frontend AppointmentCard
   */
  getAppointmentsByPatientGuid(patientGuid: string): any[] {
    const records = this.db.prepare(`
      SELECT * FROM prod_test_records
      WHERE UPPER(patient_guid) = UPPER(?)
        AND record_type = 'appointment'
      ORDER BY appointment_datetime DESC
    `).all(patientGuid) as ProdTestRecord[];

    // Transform to format compatible with appointment display
    return records.map(record => ({
      appointment_guid: record.appointment_guid,
      patient_guid: record.patient_guid,
      patient_first_name: record.patient_first_name,
      patient_last_name: record.patient_last_name,
      patient_birth_date: record.patient_birthdate,
      appointment_date_time: record.appointment_datetime,
      appointment_type_guid: record.appointment_type_guid,
      appointment_type_description: record.appointment_type,
      appointment_minutes: record.appointment_minutes,
      appointment_note: record.note,
      location_guid: record.location_guid,
      location_name: record.location_name,
      orthodontist_name: record.provider_name,
      schedule_view_guid: record.schedule_view_guid,
      schedule_column_guid: record.schedule_column_guid,
      status: record.status,
      status_description: record.status === 'active' ? 'Scheduled' :
                          record.status === 'cancelled' ? 'Cancelled' : record.status,
      chair: record.chair, // From Cloud9 enrichment (ScheduleColumnDescription)
      scheduled_at: record.cloud9_created_at || record.created_at,
      // Include raw record fields for reference
      _raw: {
        id: record.id,
        trace_id: record.trace_id,
        session_id: record.session_id,
        cloud9_created_at: record.cloud9_created_at,
      }
    }));
  }

  /**
   * Get summary statistics
   */
  getStats(): RecordStats {
    const stats = this.db.prepare(`
      SELECT
        SUM(CASE WHEN record_type = 'patient' THEN 1 ELSE 0 END) as totalPatients,
        SUM(CASE WHEN record_type = 'appointment' THEN 1 ELSE 0 END) as totalAppointments,
        SUM(CASE WHEN record_type = 'patient' AND status = 'active' THEN 1 ELSE 0 END) as activePatients,
        SUM(CASE WHEN record_type = 'appointment' AND status = 'active' THEN 1 ELSE 0 END) as activeAppointments,
        SUM(CASE WHEN record_type = 'appointment' AND status = 'cancelled' THEN 1 ELSE 0 END) as cancelledAppointments,
        SUM(CASE WHEN status = 'deleted' THEN 1 ELSE 0 END) as deletedRecords
      FROM prod_test_records
    `).get() as any;

    return {
      totalPatients: stats?.totalPatients || 0,
      totalAppointments: stats?.totalAppointments || 0,
      activePatients: stats?.activePatients || 0,
      activeAppointments: stats?.activeAppointments || 0,
      cancelledAppointments: stats?.cancelledAppointments || 0,
      deletedRecords: stats?.deletedRecords || 0,
    };
  }

  /**
   * Manually add a record
   */
  addRecord(record: Partial<ProdTestRecord>): number {
    const result = this.db.prepare(`
      INSERT INTO prod_test_records (
        record_type, patient_guid, appointment_guid,
        patient_id, patient_first_name, patient_last_name, patient_email, patient_phone, patient_birthdate,
        appointment_datetime, appointment_type, appointment_type_guid, appointment_minutes,
        location_guid, location_name, provider_guid, provider_name,
        schedule_view_guid, schedule_column_guid,
        trace_id, observation_id, session_id, langfuse_config_id,
        status, cleanup_notes,
        family_id, is_child, parent_patient_guid
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      record.record_type || 'patient',
      record.patient_guid || '',
      record.appointment_guid || null,
      record.patient_id || null,
      record.patient_first_name || null,
      record.patient_last_name || null,
      record.patient_email || null,
      record.patient_phone || null,
      record.patient_birthdate || null,
      record.appointment_datetime || null,
      record.appointment_type || null,
      record.appointment_type_guid || null,
      record.appointment_minutes || null,
      record.location_guid || null,
      record.location_name || null,
      record.provider_guid || null,
      record.provider_name || null,
      record.schedule_view_guid || null,
      record.schedule_column_guid || null,
      record.trace_id || null,
      record.observation_id || null,
      record.session_id || null,
      record.langfuse_config_id || null,
      record.status || 'active',
      record.cleanup_notes || null,
      // v72 Individual Patient Model fields
      record.family_id || null,
      record.is_child ? 1 : 0,
      record.parent_patient_guid || null
    );

    return Number(result.lastInsertRowid);
  }

  /**
   * Update record status
   */
  updateStatus(id: number, status: string, notes?: string): boolean {
    const updates: string[] = ['status = ?', 'updated_at = datetime("now")'];
    const params: any[] = [status];

    if (status === 'cancelled') {
      updates.push('cancelled_at = datetime("now")');
    } else if (status === 'deleted') {
      updates.push('deleted_at = datetime("now")');
    }

    if (notes) {
      updates.push('cleanup_notes = ?');
      params.push(notes);
    }

    params.push(id);

    const result = this.db.prepare(`
      UPDATE prod_test_records SET ${updates.join(', ')} WHERE id = ?
    `).run(...params);

    return result.changes > 0;
  }

  /**
   * Delete a record (hard delete)
   */
  deleteRecord(id: number): boolean {
    const result = this.db.prepare(`
      DELETE FROM prod_test_records WHERE id = ?
    `).run(id);

    return result.changes > 0;
  }

  // ============================================================================
  // CLOUD9 CANCELLATION
  // ============================================================================

  /**
   * Cancel an appointment via Cloud9 API
   */
  async cancelAppointment(id: number): Promise<CancelResult> {
    const record = this.getRecord(id);

    if (!record) {
      return {
        success: false,
        appointmentGuid: '',
        message: 'Record not found',
      };
    }

    if (record.record_type !== 'appointment') {
      return {
        success: false,
        appointmentGuid: record.patient_guid,
        message: 'Record is not an appointment',
      };
    }

    if (!record.appointment_guid) {
      return {
        success: false,
        appointmentGuid: '',
        message: 'No appointment GUID found',
      };
    }

    if (record.status === 'cancelled') {
      return {
        success: true,
        appointmentGuid: record.appointment_guid,
        message: 'Appointment already cancelled',
      };
    }

    try {
      // Call Cloud9 API to cancel
      const response = await this.cloud9Client.cancelAppointment(record.appointment_guid);

      if (response.status === 'Success') {
        // Update record status
        this.db.prepare(`
          UPDATE prod_test_records
          SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?
        `).run(id);

        return {
          success: true,
          appointmentGuid: record.appointment_guid,
          message: 'Appointment cancelled successfully',
        };
      } else {
        // Update with error
        this.db.prepare(`
          UPDATE prod_test_records
          SET status = 'cleanup_failed', cleanup_error = ?, updated_at = datetime('now')
          WHERE id = ?
        `).run(response.errorMessage || 'Unknown error', id);

        return {
          success: false,
          appointmentGuid: record.appointment_guid,
          message: 'Failed to cancel appointment',
          error: response.errorMessage,
        };
      }
    } catch (err: any) {
      // Update with error
      this.db.prepare(`
        UPDATE prod_test_records
        SET status = 'cleanup_failed', cleanup_error = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(err.message, id);

      return {
        success: false,
        appointmentGuid: record.appointment_guid,
        message: 'Error calling Cloud9 API',
        error: err.message,
      };
    }
  }

  /**
   * Bulk cancel multiple appointments
   */
  async bulkCancelAppointments(ids: number[]): Promise<CancelResult[]> {
    const results: CancelResult[] = [];

    for (const id of ids) {
      const result = await this.cancelAppointment(id);
      results.push(result);

      // Small delay between API calls
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    return results;
  }

  /**
   * Streaming cancellation - processes appointments one at a time with rate limiting
   * Emits progress events via the EventEmitter for real-time SSE updates
   */
  async streamingCancelAppointments(
    ids: number[],
    eventEmitter: EventEmitter,
    operationId: string
  ): Promise<StreamingCancellationSummary> {
    const summary: StreamingCancellationSummary = {
      operationId,
      total: ids.length,
      succeeded: 0,
      failed: 0,
      alreadyCancelled: 0,
    };

    // Prepare items for streaming
    const items: StreamingCancellationItem[] = ids.map(id => {
      const record = this.getRecord(id);
      return {
        id,
        appointmentGuid: record?.appointment_guid || '',
        patientName: record
          ? `${record.patient_first_name || ''} ${record.patient_last_name || ''}`.trim() || 'Unknown'
          : 'Unknown',
        appointmentDate: record?.appointment_datetime || null,
        status: 'pending' as const,
      };
    });

    // Emit start event with all items
    eventEmitter.emit('cancellation-started', {
      operationId,
      total: items.length,
      items,
    });

    // Process each item
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const item = items[i];

      // Emit processing status
      item.status = 'processing';
      eventEmitter.emit('cancellation-progress', {
        operationId,
        item: { ...item },
        currentIndex: i,
        total: ids.length,
      });

      const record = this.getRecord(id);

      // Validate record
      if (!record) {
        item.status = 'failed';
        item.error = 'Record not found';
        summary.failed++;
        eventEmitter.emit('cancellation-progress', {
          operationId,
          item: { ...item },
          currentIndex: i,
          total: ids.length,
        });
        continue;
      }

      if (record.record_type !== 'appointment') {
        item.status = 'failed';
        item.error = 'Record is not an appointment';
        summary.failed++;
        eventEmitter.emit('cancellation-progress', {
          operationId,
          item: { ...item },
          currentIndex: i,
          total: ids.length,
        });
        continue;
      }

      if (!record.appointment_guid) {
        item.status = 'failed';
        item.error = 'No appointment GUID found';
        summary.failed++;
        eventEmitter.emit('cancellation-progress', {
          operationId,
          item: { ...item },
          currentIndex: i,
          total: ids.length,
        });
        continue;
      }

      // Check if already cancelled
      if (record.status === 'cancelled') {
        item.status = 'already_cancelled';
        summary.alreadyCancelled++;
        eventEmitter.emit('cancellation-progress', {
          operationId,
          item: { ...item },
          currentIndex: i,
          total: ids.length,
        });
      } else {
        // Actually cancel via Cloud9 API
        let retryCount = 0;
        let success = false;

        while (!success && retryCount < 2) {
          try {
            const response = await this.cloud9Client.cancelAppointment(record.appointment_guid);

            if (response.status === 'Success') {
              // Update record status
              this.db.prepare(`
                UPDATE prod_test_records
                SET status = 'cancelled', cancelled_at = datetime('now'), updated_at = datetime('now')
                WHERE id = ?
              `).run(id);

              item.status = 'success';
              summary.succeeded++;
              success = true;
            } else {
              // Check if it's a rate limit error (429)
              const errorMsg = response.errorMessage || 'Unknown error';
              if (errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
                if (retryCount === 0) {
                  console.log(`[StreamingCancel] Rate limited on ${record.appointment_guid}, waiting extra 5s...`);
                  await new Promise(resolve => setTimeout(resolve, CANCELLATION_DELAY_MS));
                  retryCount++;
                  continue;
                }
              }

              // Update with error
              this.db.prepare(`
                UPDATE prod_test_records
                SET status = 'cleanup_failed', cleanup_error = ?, updated_at = datetime('now')
                WHERE id = ?
              `).run(errorMsg, id);

              item.status = 'failed';
              item.error = errorMsg;
              summary.failed++;
              success = true; // Exit retry loop
            }
          } catch (err: any) {
            // Check for rate limit in catch block too
            if (err.message?.includes('429') || err.message?.toLowerCase().includes('rate limit')) {
              if (retryCount === 0) {
                console.log(`[StreamingCancel] Rate limited (exception) on ${record.appointment_guid}, waiting extra 5s...`);
                await new Promise(resolve => setTimeout(resolve, CANCELLATION_DELAY_MS));
                retryCount++;
                continue;
              }
            }

            // Update with error
            this.db.prepare(`
              UPDATE prod_test_records
              SET status = 'cleanup_failed', cleanup_error = ?, updated_at = datetime('now')
              WHERE id = ?
            `).run(err.message, id);

            item.status = 'failed';
            item.error = err.message;
            summary.failed++;
            success = true; // Exit retry loop
          }
        }

        // Emit final status for this item
        eventEmitter.emit('cancellation-progress', {
          operationId,
          item: { ...item },
          currentIndex: i,
          total: ids.length,
        });
      }

      // Wait between API calls (rate limiting) - but not after the last item
      if (i < ids.length - 1) {
        await new Promise(resolve => setTimeout(resolve, CANCELLATION_DELAY_MS));
      }
    }

    // Emit completion
    eventEmitter.emit('cancellation-completed', summary);

    return summary;
  }

  // ============================================================================
  // PATIENT NAME BACKFILL
  // ============================================================================

  /**
   * Backfill patient names for records that have null names
   * Looks up from Cloud9 API
   */
  async backfillPatientNames(): Promise<{ updated: number; failed: number; errors: string[] }> {
    const result = { updated: 0, failed: 0, errors: [] as string[] };

    // Get unique patient GUIDs that have records with null names
    const orphanGuids = this.db.prepare(`
      SELECT DISTINCT patient_guid
      FROM prod_test_records
      WHERE (patient_first_name IS NULL OR patient_first_name = '')
        AND (patient_last_name IS NULL OR patient_last_name = '')
        AND patient_guid IS NOT NULL
        AND patient_guid != ''
    `).all() as { patient_guid: string }[];

    console.log(`[ProdTestRecordService] Found ${orphanGuids.length} patient GUIDs with missing names to backfill`);

    for (const { patient_guid } of orphanGuids) {
      try {
        console.log(`[ProdTestRecordService] Looking up patient: ${patient_guid}`);
        const cloud9Response = await this.cloud9Client.getPatientInformation(patient_guid);

        if (cloud9Response.status === 'Success' && cloud9Response.records.length > 0) {
          const patientInfo = cloud9Response.records[0];

          // Cloud9 returns PatientFullName as a combined name (e.g., "FirstName LastName")
          // Try to extract separate first/last names, falling back to combined name parsing
          let firstName = patientInfo.FirstName || patientInfo.persFirstName || null;
          let lastName = patientInfo.LastName || patientInfo.persLastName || null;

          // If no separate names but we have PatientFullName, split it
          if (!firstName && !lastName && patientInfo.PatientFullName) {
            const fullName = (patientInfo.PatientFullName || '').trim();
            const parts = fullName.split(' ');
            firstName = parts[0] || null;
            lastName = parts.slice(1).join(' ') || null;
          }

          if (firstName || lastName) {
            // Update all records with this patient_guid
            const updateResult = this.db.prepare(`
              UPDATE prod_test_records
              SET patient_first_name = ?, patient_last_name = ?, updated_at = datetime('now')
              WHERE patient_guid = ?
                AND (patient_first_name IS NULL OR patient_first_name = '')
                AND (patient_last_name IS NULL OR patient_last_name = '')
            `).run(firstName, lastName, patient_guid);

            console.log(`[ProdTestRecordService] Updated ${updateResult.changes} records for ${patient_guid}: ${firstName} ${lastName}`);
            result.updated += updateResult.changes;
          } else {
            console.log(`[ProdTestRecordService] No name found in Cloud9 for: ${patient_guid}`);
            result.failed++;
          }
        } else {
          console.log(`[ProdTestRecordService] Cloud9 lookup failed for: ${patient_guid}`);
          result.failed++;
          result.errors.push(`No data returned for patient ${patient_guid}`);
        }

        // Rate limit: wait between API calls
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (err: any) {
        console.error(`[ProdTestRecordService] Error looking up ${patient_guid}:`, err.message);
        result.failed++;
        result.errors.push(`Error for ${patient_guid}: ${err.message}`);
      }
    }

    return result;
  }

  // ============================================================================
  // HELPERS
  // ============================================================================

  private parseJson(value: any): any {
    if (!value) return null;
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  // ============================================================================
  // SESSION SYNC - Sync a single session's bookings to Prod Tracker
  // ============================================================================

  /**
   * Sync booking results from a specific Langfuse session to prod_test_records
   * Called automatically when trace analysis imports a session
   *
   * @param sessionId - The Langfuse session ID
   * @returns Import result with counts of patients and appointments found
   */
  async syncSessionToProdTracker(sessionId: string): Promise<{
    patientsFound: number;
    appointmentsFound: number;
    alreadyImported: number;
    errors: string[];
  }> {
    const result = {
      patientsFound: 0,
      appointmentsFound: 0,
      alreadyImported: 0,
      errors: [] as string[],
    };

    if (!sessionId) {
      result.errors.push('sessionId is required');
      return result;
    }

    try {
      console.log(`[ProdTestRecordService] Syncing session ${sessionId} to Prod Tracker`);

      // Look up config from session to get the correct tool names
      const sessionRow = this.db.prepare('SELECT langfuse_config_id FROM production_sessions WHERE session_id = ?').get(sessionId) as any;
      const syncTools = sessionRow?.langfuse_config_id
        ? getToolNamesForConfig(this.db, sessionRow.langfuse_config_id)
        : null;
      const syncPatientIn = syncTools ? sqlInList(syncTools.patientTools) : sqlInList(['chord_ortho_patient', 'chord_patient_v07_stage']);
      const syncSchedIn = syncTools ? sqlInList(syncTools.schedulingTools) : sqlInList(['schedule_appointment_ortho', 'chord_scheduling_v08', 'chord_scheduling_v07_dev']);

      // Get observations from this session that match SetPatient/SetAppointment patterns
      const observations = this.db.prepare(`
        SELECT
          pto.observation_id,
          pto.trace_id,
          pto.name,
          pto.input,
          pto.output,
          pto.started_at,
          pt.session_id,
          pt.langfuse_config_id
        FROM production_trace_observations pto
        JOIN production_traces pt ON pto.trace_id = pt.trace_id
        WHERE pt.session_id = ?
          AND (
            -- SetPatient success responses
            (pto.name IN (${syncPatientIn}) AND (pto.output LIKE '%Patient Added:%' OR pto.output LIKE '%Patient GUID Added%'))
            OR
            -- SetAppointment success responses
            (pto.name IN (${syncSchedIn}) AND pto.output LIKE '%Appointment GUID Added%')
            OR
            -- NexHealth: appointmentId present and not null
            (pto.name IN (${syncSchedIn}) AND pto.output LIKE '%"appointmentId":%' AND pto.output NOT LIKE '%"appointmentId":null%' AND pto.output NOT LIKE '%"appointmentId": null%')
            OR
            -- NexHealth K8: booking response has patient_id + provider_id + start_time
            (pto.name IN (${syncSchedIn}) AND pto.output LIKE '%"patient_id":%' AND pto.output LIKE '%"provider_id":%' AND pto.output LIKE '%"start_time":%')
          )
        ORDER BY pto.started_at ASC
      `).all(sessionId) as any[];

      console.log(`[ProdTestRecordService] Found ${observations.length} booking observations in session ${sessionId}`);

      // Get already-imported observation_ids for fast lookup
      const existingObservationIds = new Set<string>(
        (this.db.prepare(`
          SELECT DISTINCT observation_id FROM prod_test_records
          WHERE observation_id IS NOT NULL AND session_id = ?
        `).all(sessionId) as any[]).map(r => r.observation_id)
      );

      for (const obs of observations) {
        try {
          // Skip if already imported
          if (obs.observation_id && existingObservationIds.has(obs.observation_id)) {
            result.alreadyImported++;
            continue;
          }

          const input = this.parseJson(obs.input);
          const output = this.parseJson(obs.output);

          // Process patient creation (match any known patient tool name)
          const isPatientTool = syncTools ? syncTools.patientTools.includes(obs.name) : ['chord_ortho_patient', 'chord_patient_v07_stage'].includes(obs.name);
          const isSchedTool = syncTools ? syncTools.schedulingTools.includes(obs.name) : ['schedule_appointment_ortho', 'chord_scheduling_v08', 'chord_scheduling_v07_dev'].includes(obs.name);

          if (isPatientTool && output) {
            const patientGuid = this.extractPatientGuid(output);
            if (patientGuid) {
              const imported = this.importPatientRecord(obs, input, patientGuid);
              if (imported) {
                result.patientsFound++;
                existingObservationIds.add(obs.observation_id);
              } else {
                result.alreadyImported++;
              }
            }
          }
          // Process appointment creation
          else if (isSchedTool && output) {
            const appointmentGuid = this.extractAppointmentGuid(output);
            if (appointmentGuid) {
              const imported = await this.importAppointmentRecord(obs, input, appointmentGuid, output);
              if (imported) {
                result.appointmentsFound++;
                existingObservationIds.add(obs.observation_id);
              } else {
                result.alreadyImported++;
              }
            }
          }
        } catch (err: any) {
          result.errors.push(`Error processing observation ${obs.observation_id}: ${err.message}`);
        }
      }

      console.log(`[ProdTestRecordService] Session ${sessionId} sync complete: ${result.patientsFound} patients, ${result.appointmentsFound} appointments, ${result.alreadyImported} already imported`);

      // Enrich newly imported appointments with full Cloud9 data (location, provider, type, chair)
      if (result.appointmentsFound > 0) {
        const patientGuids = this.db.prepare(`
          SELECT DISTINCT patient_guid FROM prod_test_records
          WHERE session_id = ? AND record_type = 'appointment' AND patient_guid IS NOT NULL
            AND (location_name IS NULL OR provider_name IS NULL OR appointment_type IS NULL)
        `).all(sessionId) as { patient_guid: string }[];

        for (const { patient_guid } of patientGuids) {
          try {
            const enrichResult = await this.enrichAppointmentsFromCloud9(patient_guid);
            if (enrichResult.enriched > 0) {
              console.log(`[ProdTestRecordService] Enriched ${enrichResult.enriched} appointments for patient ${patient_guid}`);
            }
          } catch (err: any) {
            console.log(`[ProdTestRecordService] Could not enrich appointments for ${patient_guid}: ${err.message}`);
          }
        }
      }

    } catch (err: any) {
      result.errors.push(`Sync failed: ${err.message}`);
      console.error('[ProdTestRecordService] Session sync error:', err);
    }

    return result;
  }
}

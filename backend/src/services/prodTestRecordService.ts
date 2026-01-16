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
import { Cloud9Client } from './cloud9/client';

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

// ============================================================================
// PROD TEST RECORD SERVICE
// ============================================================================

export class ProdTestRecordService {
  private db: BetterSqlite3.Database;
  private cloud9Client: Cloud9Client;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
    // Use production environment for Cloud9 client since we're tracking prod data
    this.cloud9Client = new Cloud9Client('production');
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
            -- SetPatient success responses
            (pto.name = 'chord_ortho_patient' AND pto.output LIKE '%Patient GUID Added%')
            OR
            -- SetAppointment success responses
            (pto.name = 'schedule_appointment_ortho' AND pto.output LIKE '%Appointment GUID Added%')
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
          if (obs.name === 'chord_ortho_patient' && output) {
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
          } else if (obs.name === 'schedule_appointment_ortho' && output) {
            const appointmentGuid = this.extractAppointmentGuid(output);
            if (appointmentGuid) {
              const imported = this.importAppointmentRecord(obs, input, appointmentGuid);
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
   * Pattern: "Patient GUID Added: {guid}" or similar
   */
  private extractPatientGuid(output: any): string | null {
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

    // Pattern: "Patient GUID Added: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    const match = outputStr.match(/Patient GUID Added:\s*([a-f0-9-]{36})/i);
    if (match) return match[1];

    // Alternative pattern: patientGUID in JSON response
    if (typeof output === 'object' && output.patientGUID) {
      return output.patientGUID;
    }

    return null;
  }

  /**
   * Extract Appointment GUID from SetAppointment response
   * Pattern: "Appointment GUID Added: {guid}" or similar
   */
  private extractAppointmentGuid(output: any): string | null {
    const outputStr = typeof output === 'string' ? output : JSON.stringify(output);

    // Pattern: "Appointment GUID Added: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
    const match = outputStr.match(/Appointment GUID Added:\s*([a-f0-9-]{36})/i);
    if (match) return match[1];

    // Alternative pattern: appointmentGUID in JSON response
    if (typeof output === 'object' && output.appointmentGUID) {
      return output.appointmentGUID;
    }

    return null;
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
        status, cloud9_created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      obs.started_at
    );

    console.log(`[ProdTestRecordService] Imported patient: ${patientGuid}`);
    return true;
  }

  /**
   * Import an appointment record from observation data
   */
  private importAppointmentRecord(obs: any, input: any, appointmentGuid: string): boolean {
    // Check for duplicate
    const existing = this.db.prepare(`
      SELECT id FROM prod_test_records WHERE appointment_guid = ? AND record_type = 'appointment'
    `).get(appointmentGuid);

    if (existing) {
      console.log(`[ProdTestRecordService] Skipping duplicate appointment: ${appointmentGuid}`);
      return false;
    }

    // Extract appointment info from input
    const apptData = input || {};

    this.db.prepare(`
      INSERT INTO prod_test_records (
        record_type, patient_guid, appointment_guid,
        patient_first_name, patient_last_name,
        appointment_datetime, appointment_type, appointment_type_guid, appointment_minutes,
        location_guid, location_name, provider_guid, provider_name,
        schedule_view_guid, schedule_column_guid,
        trace_id, observation_id, session_id, langfuse_config_id,
        status, cloud9_created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      'appointment',
      apptData.PatientGUID || apptData.patientGUID || '',
      appointmentGuid,
      apptData.patientFirstName || null,
      apptData.patientLastName || null,
      apptData.StartTime || apptData.startTime || null,
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
      obs.started_at
    );

    console.log(`[ProdTestRecordService] Imported appointment: ${appointmentGuid}`);
    return true;
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
    limit?: number;
    offset?: number;
    fromDate?: string;
    toDate?: string;
  } = {}): { records: ProdTestRecord[]; total: number } {
    const { recordType, status, limit = 100, offset = 0, fromDate, toDate } = options;

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
    if (fromDate) {
      whereClauses.push('created_at >= ?');
      params.push(fromDate);
    }
    if (toDate) {
      whereClauses.push('created_at <= ?');
      params.push(toDate);
    }

    const whereClause = whereClauses.join(' AND ');

    const records = this.db.prepare(`
      SELECT * FROM prod_test_records
      WHERE ${whereClause}
      ORDER BY created_at DESC
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
        status, cleanup_notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      record.cleanup_notes || null
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

      if (response.success) {
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
        `).run(response.error || 'Unknown error', id);

        return {
          success: false,
          appointmentGuid: record.appointment_guid,
          message: 'Failed to cancel appointment',
          error: response.error,
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
}

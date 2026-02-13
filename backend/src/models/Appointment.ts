import { getDatabase } from '../config/database';
import { loggers } from '../utils/logger';
import BetterSqlite3 from 'better-sqlite3';
import path from 'path';

// Path to test-agent database (for prod_test_records)
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

/**
 * Appointment Model
 * Handles CRUD operations for appointments (minimal cache for quick lookups)
 */

export interface Appointment {
  appointment_guid: string;
  patient_guid: string;
  appointment_date_time: string;
  appointment_type_guid?: string;
  appointment_type_description?: string;
  location_guid?: string;
  location_name?: string;
  provider_guid?: string;
  orthodontist_name?: string;
  schedule_view_guid?: string;
  schedule_view_description?: string;
  schedule_column_guid?: string;
  schedule_column_description?: string;
  minutes?: number;
  status?: string;
  environment?: string;
  tenant_id?: number;
  cached_at?: string;
  updated_at?: string;
}

export class AppointmentModel {
  /**
   * Get all appointments for a tenant
   */
  static getAll(tenantId: number, limit: number = 100, offset: number = 0): Appointment[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM appointments
        WHERE tenant_id = ?
        ORDER BY appointment_date_time DESC
        LIMIT ? OFFSET ?
      `);

      const appointments = stmt.all(tenantId, limit, offset) as Appointment[];

      loggers.dbOperation('SELECT', 'appointments', { tenantId, count: appointments.length });

      return appointments;
    } catch (error) {
      throw new Error(
        `Error fetching appointments: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get appointment by GUID for a tenant
   */
  static getByGuid(tenantId: number, appointmentGuid: string): Appointment | null {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM appointments
        WHERE tenant_id = ? AND appointment_guid = ?
      `);

      const appointment = stmt.get(tenantId, appointmentGuid) as Appointment | undefined;

      loggers.dbOperation('SELECT', 'appointments', { tenantId, appointmentGuid });

      return appointment || null;
    } catch (error) {
      throw new Error(
        `Error fetching appointment: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get appointments by patient GUID for a tenant
   */
  static getByPatientGuid(tenantId: number, patientGuid: string): Appointment[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM appointments
        WHERE tenant_id = ? AND patient_guid = ?
        ORDER BY appointment_date_time DESC
      `);

      const appointments = stmt.all(tenantId, patientGuid) as Appointment[];

      loggers.dbOperation('SELECT', 'appointments', { tenantId, patientGuid, count: appointments.length });

      return appointments;
    } catch (error) {
      throw new Error(
        `Error fetching patient appointments: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get appointments by date range for a tenant
   */
  static getByDateRange(tenantId: number, startDate: string, endDate: string): Appointment[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM appointments
        WHERE tenant_id = ? AND appointment_date_time BETWEEN ? AND ?
        ORDER BY appointment_date_time ASC
      `);

      const appointments = stmt.all(tenantId, startDate, endDate) as Appointment[];

      loggers.dbOperation('SELECT', 'appointments', {
        tenantId,
        startDate,
        endDate,
        count: appointments.length,
      });

      return appointments;
    } catch (error) {
      throw new Error(
        `Error fetching appointments by date range: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Create or update appointment for a tenant
   */
  static upsert(tenantId: number, appointment: Omit<Appointment, 'cached_at' | 'updated_at' | 'tenant_id'>): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        INSERT INTO appointments (
          tenant_id, appointment_guid, patient_guid, appointment_date_time,
          appointment_type_guid, appointment_type_description, location_guid, location_name,
          provider_guid, orthodontist_name, schedule_view_guid, schedule_view_description,
          schedule_column_guid, schedule_column_description, minutes, status, environment
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, appointment_guid) DO UPDATE SET
          patient_guid = excluded.patient_guid,
          appointment_date_time = excluded.appointment_date_time,
          appointment_type_guid = excluded.appointment_type_guid,
          appointment_type_description = excluded.appointment_type_description,
          location_guid = excluded.location_guid,
          location_name = excluded.location_name,
          provider_guid = excluded.provider_guid,
          orthodontist_name = excluded.orthodontist_name,
          schedule_view_guid = excluded.schedule_view_guid,
          schedule_view_description = excluded.schedule_view_description,
          schedule_column_guid = excluded.schedule_column_guid,
          schedule_column_description = excluded.schedule_column_description,
          minutes = excluded.minutes,
          status = excluded.status,
          updated_at = datetime('now')
      `);

      stmt.run(
        tenantId,
        appointment.appointment_guid,
        appointment.patient_guid,
        appointment.appointment_date_time,
        appointment.appointment_type_guid || null,
        appointment.appointment_type_description || null,
        appointment.location_guid || null,
        appointment.location_name || null,
        appointment.provider_guid || null,
        appointment.orthodontist_name || null,
        appointment.schedule_view_guid || null,
        appointment.schedule_view_description || null,
        appointment.schedule_column_guid || null,
        appointment.schedule_column_description || null,
        appointment.minutes || null,
        appointment.status || 'Scheduled',
        appointment.environment || 'sandbox'
      );

      loggers.dbOperation('UPSERT', 'appointments', {
        tenantId,
        appointmentGuid: appointment.appointment_guid,
      });
    } catch (error) {
      throw new Error(
        `Error upserting appointment: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Update appointment status for a tenant
   */
  static updateStatus(tenantId: number, appointmentGuid: string, status: string): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        UPDATE appointments
        SET status = ?, updated_at = datetime('now')
        WHERE tenant_id = ? AND appointment_guid = ?
      `);

      stmt.run(status, tenantId, appointmentGuid);

      loggers.dbOperation('UPDATE', 'appointments', { tenantId, appointmentGuid, status });
    } catch (error) {
      throw new Error(
        `Error updating appointment status: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Delete appointment by GUID for a tenant
   */
  static deleteByGuid(tenantId: number, appointmentGuid: string): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        DELETE FROM appointments
        WHERE tenant_id = ? AND appointment_guid = ?
      `);

      stmt.run(tenantId, appointmentGuid);

      loggers.dbOperation('DELETE', 'appointments', { tenantId, appointmentGuid });
    } catch (error) {
      throw new Error(
        `Error deleting appointment: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get schedule_column_guid and notes from prod_test_records for appointments created via Flowise/Node-RED
   * This is a fallback for appointments that aren't in the local appointments table
   */
  static getProdTestRecordsByAppointmentGuids(appointmentGuids: string[]): Array<{
    appointment_guid: string;
    schedule_column_guid: string | null;
    schedule_view_guid: string | null;
    note: string | null;
  }> {
    if (appointmentGuids.length === 0) return [];

    try {
      const db = new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: true });

      // Normalize GUIDs to uppercase for case-insensitive comparison
      const upperGuids = appointmentGuids.map(g => g.toUpperCase());
      const placeholders = upperGuids.map(() => '?').join(',');

      const stmt = db.prepare(`
        SELECT appointment_guid, schedule_column_guid, schedule_view_guid, note
        FROM prod_test_records
        WHERE UPPER(appointment_guid) IN (${placeholders})
          AND record_type = 'appointment'
      `);

      const records = stmt.all(...upperGuids) as Array<{
        appointment_guid: string;
        schedule_column_guid: string | null;
        schedule_view_guid: string | null;
        note: string | null;
      }>;

      db.close();

      loggers.dbOperation('SELECT', 'prod_test_records', { count: records.length });

      return records;
    } catch (error) {
      // If test-agent DB doesn't exist or other error, return empty array
      loggers.dbOperation('SELECT', 'prod_test_records', { error: error instanceof Error ? error.message : String(error) });
      return [];
    }
  }
}

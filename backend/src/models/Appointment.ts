import { getDatabase } from '../config/database';
import { loggers } from '../utils/logger';

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
  cached_at?: string;
  updated_at?: string;
}

export class AppointmentModel {
  /**
   * Get all appointments
   */
  static getAll(limit: number = 100, offset: number = 0): Appointment[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM appointments
        ORDER BY appointment_date_time DESC
        LIMIT ? OFFSET ?
      `);

      const appointments = stmt.all(limit, offset) as Appointment[];

      loggers.dbOperation('SELECT', 'appointments', { count: appointments.length });

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
   * Get appointment by GUID
   */
  static getByGuid(appointmentGuid: string): Appointment | null {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM appointments
        WHERE appointment_guid = ?
      `);

      const appointment = stmt.get(appointmentGuid) as Appointment | undefined;

      loggers.dbOperation('SELECT', 'appointments', { appointmentGuid });

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
   * Get appointments by patient GUID
   */
  static getByPatientGuid(patientGuid: string): Appointment[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM appointments
        WHERE patient_guid = ?
        ORDER BY appointment_date_time DESC
      `);

      const appointments = stmt.all(patientGuid) as Appointment[];

      loggers.dbOperation('SELECT', 'appointments', { patientGuid, count: appointments.length });

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
   * Get appointments by date range
   */
  static getByDateRange(startDate: string, endDate: string): Appointment[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM appointments
        WHERE appointment_date_time BETWEEN ? AND ?
        ORDER BY appointment_date_time ASC
      `);

      const appointments = stmt.all(startDate, endDate) as Appointment[];

      loggers.dbOperation('SELECT', 'appointments', {
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
   * Create or update appointment
   */
  static upsert(appointment: Omit<Appointment, 'cached_at' | 'updated_at'>): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        INSERT INTO appointments (
          appointment_guid, patient_guid, appointment_date_time,
          appointment_type_guid, appointment_type_description, location_guid, location_name,
          provider_guid, orthodontist_name, schedule_view_guid, schedule_view_description,
          schedule_column_guid, schedule_column_description, minutes, status, environment
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(appointment_guid) DO UPDATE SET
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
   * Update appointment status
   */
  static updateStatus(appointmentGuid: string, status: string): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        UPDATE appointments
        SET status = ?, updated_at = datetime('now')
        WHERE appointment_guid = ?
      `);

      stmt.run(status, appointmentGuid);

      loggers.dbOperation('UPDATE', 'appointments', { appointmentGuid, status });
    } catch (error) {
      throw new Error(
        `Error updating appointment status: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Delete appointment by GUID
   */
  static deleteByGuid(appointmentGuid: string): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        DELETE FROM appointments
        WHERE appointment_guid = ?
      `);

      stmt.run(appointmentGuid);

      loggers.dbOperation('DELETE', 'appointments', { appointmentGuid });
    } catch (error) {
      throw new Error(
        `Error deleting appointment: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

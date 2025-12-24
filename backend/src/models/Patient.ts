import { getDatabase } from '../config/database';
import { loggers } from '../utils/logger';

/**
 * Patient Model
 * Handles CRUD operations for patients (minimal cache for quick lookups)
 */

export interface Patient {
  patient_guid: string;
  patient_id?: string;
  first_name: string;
  middle_name?: string;
  last_name: string;
  suffix?: string;
  birthdate?: string;
  gender?: string;
  email?: string;
  phone?: string;
  use_email?: boolean;
  use_phone?: boolean;
  use_text?: boolean;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_postal_code?: string;
  location_guid?: string;
  provider_guid?: string;
  orthodontist_name?: string;
  patient_status_description?: string;
  last_appointment_date?: string;
  estimated_completion_date?: string;
  months_in_status?: number;
  environment?: string;
  cached_at?: string;
  updated_at?: string;
}

export class PatientModel {
  /**
   * Get all patients
   */
  static getAll(limit: number = 100, offset: number = 0): Patient[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM patients
        ORDER BY last_name ASC, first_name ASC
        LIMIT ? OFFSET ?
      `);

      const patients = stmt.all(limit, offset) as Patient[];

      loggers.dbOperation('SELECT', 'patients', { count: patients.length });

      return patients;
    } catch (error) {
      throw new Error(
        `Error fetching patients: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get patient by GUID
   */
  static getByGuid(patientGuid: string): Patient | null {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM patients
        WHERE patient_guid = ?
      `);

      const patient = stmt.get(patientGuid) as Patient | undefined;

      loggers.dbOperation('SELECT', 'patients', { patientGuid });

      return patient || null;
    } catch (error) {
      throw new Error(
        `Error fetching patient: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Search patients by name
   */
  static searchByName(searchTerm: string, limit: number = 25): Patient[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM patients
        WHERE
          first_name LIKE ? OR
          last_name LIKE ? OR
          (first_name || ' ' || last_name) LIKE ? OR
          (last_name || ', ' || first_name) LIKE ?
        ORDER BY last_name ASC, first_name ASC
        LIMIT ?
      `);

      const searchPattern = `%${searchTerm}%`;
      const patients = stmt.all(
        searchPattern,
        searchPattern,
        searchPattern,
        searchPattern,
        limit
      ) as Patient[];

      loggers.dbOperation('SEARCH', 'patients', { searchTerm, count: patients.length });

      return patients;
    } catch (error) {
      throw new Error(
        `Error searching patients: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Create or update patient
   */
  static upsert(patient: Omit<Patient, 'cached_at' | 'updated_at'>): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        INSERT INTO patients (
          patient_guid, patient_id, first_name, middle_name, last_name, suffix,
          birthdate, gender, email, phone, use_email, use_phone, use_text,
          address_street, address_city, address_state, address_postal_code,
          location_guid, provider_guid, orthodontist_name, patient_status_description,
          last_appointment_date, estimated_completion_date, months_in_status, environment
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(patient_guid) DO UPDATE SET
          patient_id = excluded.patient_id,
          first_name = excluded.first_name,
          middle_name = excluded.middle_name,
          last_name = excluded.last_name,
          suffix = excluded.suffix,
          birthdate = excluded.birthdate,
          gender = excluded.gender,
          email = excluded.email,
          phone = excluded.phone,
          use_email = excluded.use_email,
          use_phone = excluded.use_phone,
          use_text = excluded.use_text,
          address_street = excluded.address_street,
          address_city = excluded.address_city,
          address_state = excluded.address_state,
          address_postal_code = excluded.address_postal_code,
          location_guid = excluded.location_guid,
          provider_guid = excluded.provider_guid,
          orthodontist_name = excluded.orthodontist_name,
          patient_status_description = excluded.patient_status_description,
          last_appointment_date = excluded.last_appointment_date,
          estimated_completion_date = excluded.estimated_completion_date,
          months_in_status = excluded.months_in_status,
          updated_at = datetime('now')
      `);

      stmt.run(
        patient.patient_guid,
        patient.patient_id || null,
        patient.first_name,
        patient.middle_name || null,
        patient.last_name,
        patient.suffix || null,
        patient.birthdate || null,
        patient.gender || null,
        patient.email || null,
        patient.phone || null,
        patient.use_email ? 1 : 0,
        patient.use_phone ? 1 : 0,
        patient.use_text ? 1 : 0,
        patient.address_street || null,
        patient.address_city || null,
        patient.address_state || null,
        patient.address_postal_code || null,
        patient.location_guid || null,
        patient.provider_guid || null,
        patient.orthodontist_name || null,
        patient.patient_status_description || null,
        patient.last_appointment_date || null,
        patient.estimated_completion_date || null,
        patient.months_in_status || null,
        patient.environment || 'sandbox'
      );

      loggers.dbOperation('UPSERT', 'patients', { patientGuid: patient.patient_guid });
    } catch (error) {
      throw new Error(
        `Error upserting patient: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Delete patient by GUID
   */
  static deleteByGuid(patientGuid: string): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        DELETE FROM patients
        WHERE patient_guid = ?
      `);

      stmt.run(patientGuid);

      loggers.dbOperation('DELETE', 'patients', { patientGuid });
    } catch (error) {
      throw new Error(
        `Error deleting patient: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

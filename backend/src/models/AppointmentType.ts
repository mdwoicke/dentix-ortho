import { getDatabase } from '../config/database';
import { loggers } from '../utils/logger';

/**
 * AppointmentType Model
 * Handles CRUD operations for appointment types
 */

export interface AppointmentType {
  appointment_type_guid: string;
  appointment_type_code?: string;
  description: string;
  minutes: number;
  allow_online_scheduling: boolean;
  is_deleted?: boolean;
  environment?: string;
  tenant_id?: number;
  cached_at?: string;
  updated_at?: string;
}

export class AppointmentTypeModel {
  /**
   * Get all appointment types for a tenant
   */
  static getAll(tenantId: number): AppointmentType[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM appointment_types
        WHERE tenant_id = ?
        ORDER BY appointment_type_description ASC
      `);

      const appointmentTypes = stmt.all(tenantId) as AppointmentType[];

      loggers.dbOperation('SELECT', 'appointment_types', { tenantId, count: appointmentTypes.length });

      return appointmentTypes;
    } catch (error) {
      throw new Error(
        `Error fetching appointment types: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get appointment type by GUID for a tenant
   */
  static getByGuid(tenantId: number, appointmentTypeGuid: string): AppointmentType | null {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM appointment_types
        WHERE tenant_id = ? AND appointment_type_guid = ?
      `);

      const appointmentType = stmt.get(tenantId, appointmentTypeGuid) as AppointmentType | undefined;

      loggers.dbOperation('SELECT', 'appointment_types', { tenantId, appointmentTypeGuid });

      return appointmentType || null;
    } catch (error) {
      throw new Error(
        `Error fetching appointment type: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Create or update appointment type for a tenant
   */
  static upsert(
    tenantId: number,
    appointmentType: Omit<AppointmentType, 'cached_at' | 'updated_at' | 'tenant_id'>
  ): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        INSERT INTO appointment_types (
          tenant_id, appointment_type_guid, appointment_type_code, description,
          minutes, allow_online_scheduling, is_deleted, environment
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, appointment_type_guid) DO UPDATE SET
          appointment_type_code = excluded.appointment_type_code,
          description = excluded.description,
          minutes = excluded.minutes,
          allow_online_scheduling = excluded.allow_online_scheduling,
          is_deleted = excluded.is_deleted,
          updated_at = datetime('now')
      `);

      stmt.run(
        tenantId,
        appointmentType.appointment_type_guid,
        appointmentType.appointment_type_code || null,
        appointmentType.description,
        appointmentType.minutes,
        appointmentType.allow_online_scheduling ? 1 : 0,
        appointmentType.is_deleted ? 1 : 0,
        appointmentType.environment || 'sandbox'
      );

      loggers.dbOperation('UPSERT', 'appointment_types', {
        tenantId,
        appointmentTypeGuid: appointmentType.appointment_type_guid,
      });
    } catch (error) {
      throw new Error(
        `Error upserting appointment type: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Bulk upsert appointment types for a tenant
   */
  static bulkUpsert(
    tenantId: number,
    appointmentTypes: Omit<AppointmentType, 'cached_at' | 'updated_at' | 'tenant_id'>[]
  ): void {
    const db = getDatabase();

    try {
      const insertMany = db.transaction((types: typeof appointmentTypes) => {
        for (const appointmentType of types) {
          AppointmentTypeModel.upsert(tenantId, appointmentType);
        }
      });

      insertMany(appointmentTypes);

      loggers.dbOperation('BULK_UPSERT', 'appointment_types', {
        tenantId,
        count: appointmentTypes.length,
      });
    } catch (error) {
      throw new Error(
        `Error bulk upserting appointment types: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Delete appointment type by GUID for a tenant
   */
  static deleteByGuid(tenantId: number, appointmentTypeGuid: string): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        DELETE FROM appointment_types
        WHERE tenant_id = ? AND appointment_type_guid = ?
      `);

      stmt.run(tenantId, appointmentTypeGuid);

      loggers.dbOperation('DELETE', 'appointment_types', { tenantId, appointmentTypeGuid });
    } catch (error) {
      throw new Error(
        `Error deleting appointment type: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Clear all appointment types for a tenant
   */
  static deleteAll(tenantId: number): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`DELETE FROM appointment_types WHERE tenant_id = ?`);
      stmt.run(tenantId);

      loggers.dbOperation('DELETE_ALL', 'appointment_types', { tenantId });
    } catch (error) {
      throw new Error(
        `Error deleting all appointment types: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

import { getDatabase } from '../config/database';
import { loggers } from '../utils/logger';

/**
 * Location Model
 * Handles CRUD operations for practice locations
 */

export interface Location {
  location_guid: string;
  location_name: string;
  location_code?: string;
  location_printed_name?: string;
  address_street?: string;
  address_city?: string;
  address_state?: string;
  address_postal_code?: string;
  phone?: string;
  time_zone?: string;
  is_deleted?: boolean;
  environment?: string;
  cached_at?: string;
  updated_at?: string;
}

export class LocationModel {
  /**
   * Get all locations
   */
  static getAll(): Location[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM locations
        ORDER BY location_name ASC
      `);

      const locations = stmt.all() as Location[];

      loggers.dbOperation('SELECT', 'locations', { count: locations.length });

      return locations;
    } catch (error) {
      throw new Error(
        `Error fetching locations: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get location by GUID
   */
  static getByGuid(locationGuid: string): Location | null {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM locations
        WHERE location_guid = ?
      `);

      const location = stmt.get(locationGuid) as Location | undefined;

      loggers.dbOperation('SELECT', 'locations', { locationGuid });

      return location || null;
    } catch (error) {
      throw new Error(
        `Error fetching location: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Create or update location
   */
  static upsert(location: Omit<Location, 'cached_at' | 'updated_at'>): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        INSERT INTO locations (
          location_guid, location_name, location_code, location_printed_name,
          address_street, address_city, address_state, address_postal_code,
          phone, time_zone, is_deleted, environment
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(location_guid) DO UPDATE SET
          location_name = excluded.location_name,
          location_code = excluded.location_code,
          location_printed_name = excluded.location_printed_name,
          address_street = excluded.address_street,
          address_city = excluded.address_city,
          address_state = excluded.address_state,
          address_postal_code = excluded.address_postal_code,
          phone = excluded.phone,
          time_zone = excluded.time_zone,
          is_deleted = excluded.is_deleted,
          updated_at = datetime('now')
      `);

      stmt.run(
        location.location_guid,
        location.location_name,
        location.location_code || null,
        location.location_printed_name || null,
        location.address_street || null,
        location.address_city || null,
        location.address_state || null,
        location.address_postal_code || null,
        location.phone || null,
        location.time_zone || null,
        location.is_deleted ? 1 : 0,
        location.environment || 'sandbox'
      );

      loggers.dbOperation('UPSERT', 'locations', { locationGuid: location.location_guid });
    } catch (error) {
      throw new Error(
        `Error upserting location: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Bulk upsert locations
   */
  static bulkUpsert(locations: Omit<Location, 'cached_at' | 'updated_at'>[]): void {
    const db = getDatabase();

    try {
      const insertMany = db.transaction((locs: typeof locations) => {
        for (const location of locs) {
          LocationModel.upsert(location);
        }
      });

      insertMany(locations);

      loggers.dbOperation('BULK_UPSERT', 'locations', { count: locations.length });
    } catch (error) {
      throw new Error(
        `Error bulk upserting locations: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Delete location by GUID
   */
  static deleteByGuid(locationGuid: string): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        DELETE FROM locations
        WHERE location_guid = ?
      `);

      stmt.run(locationGuid);

      loggers.dbOperation('DELETE', 'locations', { locationGuid });
    } catch (error) {
      throw new Error(
        `Error deleting location: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Clear all locations
   */
  static deleteAll(): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`DELETE FROM locations`);
      stmt.run();

      loggers.dbOperation('DELETE_ALL', 'locations');
    } catch (error) {
      throw new Error(
        `Error deleting all locations: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

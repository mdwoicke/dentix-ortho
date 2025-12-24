import { getDatabase } from '../config/database';
import { loggers } from '../utils/logger';

/**
 * Provider Model
 * Handles CRUD operations for providers/doctors
 */

export interface Provider {
  provider_guid: string;
  location_guid: string;
  schedule_view_guid: string;
  schedule_column_guid: string;
  schedule_view_description?: string;
  schedule_column_description?: string;
  provider_name?: string;
  start_time?: string;
  end_time?: string;
  environment?: string;
  cached_at?: string;
  updated_at?: string;
}

export class ProviderModel {
  /**
   * Get all providers
   */
  static getAll(): Provider[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM providers
        ORDER BY schedule_view_description ASC
      `);

      const providers = stmt.all() as Provider[];

      loggers.dbOperation('SELECT', 'providers', { count: providers.length });

      return providers;
    } catch (error) {
      throw new Error(
        `Error fetching providers: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get provider by GUID
   */
  static getByGuid(providerGuid: string): Provider | null {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM providers
        WHERE provider_guid = ?
      `);

      const provider = stmt.get(providerGuid) as Provider | undefined;

      loggers.dbOperation('SELECT', 'providers', { providerGuid });

      return provider || null;
    } catch (error) {
      throw new Error(
        `Error fetching provider: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Get providers by location GUID
   */
  static getByLocationGuid(locationGuid: string): Provider[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM providers
        WHERE location_guid = ?
        ORDER BY schedule_view_description ASC
      `);

      const providers = stmt.all(locationGuid) as Provider[];

      loggers.dbOperation('SELECT', 'providers', { locationGuid, count: providers.length });

      return providers;
    } catch (error) {
      throw new Error(
        `Error fetching providers by location: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Create or update provider
   */
  static upsert(provider: Omit<Provider, 'cached_at' | 'updated_at'>): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        INSERT INTO providers (
          provider_guid, location_guid, schedule_view_guid, schedule_column_guid,
          schedule_view_description, schedule_column_description, provider_name,
          start_time, end_time, environment
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider_guid) DO UPDATE SET
          location_guid = excluded.location_guid,
          schedule_view_guid = excluded.schedule_view_guid,
          schedule_column_guid = excluded.schedule_column_guid,
          schedule_view_description = excluded.schedule_view_description,
          schedule_column_description = excluded.schedule_column_description,
          provider_name = excluded.provider_name,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          updated_at = datetime('now')
      `);

      stmt.run(
        provider.provider_guid,
        provider.location_guid,
        provider.schedule_view_guid,
        provider.schedule_column_guid,
        provider.schedule_view_description || null,
        provider.schedule_column_description || null,
        provider.provider_name || null,
        provider.start_time || null,
        provider.end_time || null,
        provider.environment || 'sandbox'
      );

      loggers.dbOperation('UPSERT', 'providers', {
        providerGuid: provider.provider_guid,
      });
    } catch (error) {
      throw new Error(
        `Error upserting provider: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Bulk upsert providers
   */
  static bulkUpsert(providers: Omit<Provider, 'cached_at' | 'updated_at'>[]): void {
    let successCount = 0;
    let skippedCount = 0;

    for (const provider of providers) {
      try {
        ProviderModel.upsert(provider);
        successCount++;
      } catch (error) {
        // Skip providers with foreign key constraint failures (invalid location_guid)
        if (error instanceof Error && error.message.includes('FOREIGN KEY constraint failed')) {
          loggers.dbOperation('SKIP', 'providers', {
            provider_guid: provider.provider_guid,
            reason: 'Invalid location_guid',
          });
          skippedCount++;
        } else {
          throw error;
        }
      }
    }

    loggers.dbOperation('BULK_UPSERT', 'providers', {
      total: providers.length,
      success: successCount,
      skipped: skippedCount,
    });
  }

  /**
   * Delete provider by GUID
   */
  static deleteByGuid(providerGuid: string): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        DELETE FROM providers
        WHERE provider_guid = ?
      `);

      stmt.run(providerGuid);

      loggers.dbOperation('DELETE', 'providers', { providerGuid });
    } catch (error) {
      throw new Error(
        `Error deleting provider: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Clear all providers
   */
  static deleteAll(): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`DELETE FROM providers`);
      stmt.run();

      loggers.dbOperation('DELETE_ALL', 'providers');
    } catch (error) {
      throw new Error(
        `Error deleting all providers: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

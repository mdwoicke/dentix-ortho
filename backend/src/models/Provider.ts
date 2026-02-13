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
  tenant_id?: number;
  cached_at?: string;
  updated_at?: string;
}

export class ProviderModel {
  /**
   * Get all providers for a tenant
   */
  static getAll(tenantId: number): Provider[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM providers
        WHERE tenant_id = ?
        ORDER BY schedule_view_description ASC
      `);

      const providers = stmt.all(tenantId) as Provider[];

      loggers.dbOperation('SELECT', 'providers', { tenantId, count: providers.length });

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
   * Get provider by GUID for a tenant
   */
  static getByGuid(tenantId: number, providerGuid: string): Provider | null {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM providers
        WHERE tenant_id = ? AND provider_guid = ?
      `);

      const provider = stmt.get(tenantId, providerGuid) as Provider | undefined;

      loggers.dbOperation('SELECT', 'providers', { tenantId, providerGuid });

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
   * Get providers by location GUID for a tenant
   */
  static getByLocationGuid(tenantId: number, locationGuid: string): Provider[] {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        SELECT * FROM providers
        WHERE tenant_id = ? AND location_guid = ?
        ORDER BY schedule_view_description ASC
      `);

      const providers = stmt.all(tenantId, locationGuid) as Provider[];

      loggers.dbOperation('SELECT', 'providers', { tenantId, locationGuid, count: providers.length });

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
   * Create or update provider for a tenant
   */
  static upsert(tenantId: number, provider: Omit<Provider, 'cached_at' | 'updated_at' | 'tenant_id'>): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        INSERT INTO providers (
          tenant_id, provider_guid, location_guid, schedule_view_guid, schedule_column_guid,
          schedule_view_description, schedule_column_description, provider_name,
          start_time, end_time, environment
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(tenant_id, provider_guid) DO UPDATE SET
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
        tenantId,
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
        tenantId,
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
   * Bulk upsert providers for a tenant
   */
  static bulkUpsert(tenantId: number, providers: Omit<Provider, 'cached_at' | 'updated_at' | 'tenant_id'>[]): void {
    let successCount = 0;
    let skippedCount = 0;

    for (const provider of providers) {
      try {
        ProviderModel.upsert(tenantId, provider);
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
      tenantId,
      total: providers.length,
      success: successCount,
      skipped: skippedCount,
    });
  }

  /**
   * Delete provider by GUID for a tenant
   */
  static deleteByGuid(tenantId: number, providerGuid: string): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`
        DELETE FROM providers
        WHERE tenant_id = ? AND provider_guid = ?
      `);

      stmt.run(tenantId, providerGuid);

      loggers.dbOperation('DELETE', 'providers', { tenantId, providerGuid });
    } catch (error) {
      throw new Error(
        `Error deleting provider: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Clear all providers for a tenant
   */
  static deleteAll(tenantId: number): void {
    const db = getDatabase();

    try {
      const stmt = db.prepare(`DELETE FROM providers WHERE tenant_id = ?`);
      stmt.run(tenantId);

      loggers.dbOperation('DELETE_ALL', 'providers', { tenantId });
    } catch (error) {
      throw new Error(
        `Error deleting all providers: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

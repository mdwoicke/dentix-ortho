import { getDatabase } from '../config/database';
import { loggers } from '../utils/logger';

/**
 * TenantTab Model
 * Manages per-tenant feature/tab enablement
 */

export class TenantTabModel {
  /**
   * Get all enabled tab keys for a tenant
   */
  static getEnabledTabs(tenantId: number): string[] {
    const db = getDatabase();
    const rows = db.prepare(
      'SELECT tab_key FROM tenant_tabs WHERE tenant_id = ? ORDER BY tab_key'
    ).all(tenantId) as { tab_key: string }[];
    return rows.map(r => r.tab_key);
  }

  /**
   * Replace all enabled tabs for a tenant (delete + insert in transaction)
   */
  static setTabs(tenantId: number, tabKeys: string[]): void {
    const db = getDatabase();
    const txn = db.transaction(() => {
      db.prepare('DELETE FROM tenant_tabs WHERE tenant_id = ?').run(tenantId);
      const insert = db.prepare('INSERT INTO tenant_tabs (tenant_id, tab_key) VALUES (?, ?)');
      for (const key of tabKeys) {
        insert.run(tenantId, key);
      }
    });
    txn();
    loggers.dbOperation('SET_TABS', 'tenant_tabs', { tenantId, count: tabKeys.length });
  }

  /**
   * Check if a tenant has a specific tab enabled
   */
  static hasTab(tenantId: number, tabKey: string): boolean {
    const db = getDatabase();
    const row = db.prepare(
      'SELECT 1 FROM tenant_tabs WHERE tenant_id = ? AND tab_key = ?'
    ).get(tenantId, tabKey);
    return !!row;
  }
}

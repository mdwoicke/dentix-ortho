import { getDatabase } from '../config/database';
import { loggers } from '../utils/logger';

export interface DominosOrderLogRow {
  id: number;
  tenant_id: number;
  session_id: string;
  request_id: string | null;
  timestamp: string;
  timestamp_cst: string | null;
  method: string;
  endpoint: string;
  status_code: number;
  response_time_ms: number;
  error_message: string | null;
  user_agent: string;
  ip_address: string;
  store_id: string | null;
  order_total: number;
  items_count: number;
  success: number;
  request_body: string | null;
  response_body: string | null;
  error_stack: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  order_type: string | null;
  order_summary: string | null;
  utterance: string | null;
  call_type: string | null;
  payment_type: string | null;
  intent: string | null;
  address_verified: string | null;
  order_confirmed: number;
  ai_agent_order_output: string | null;
  delivery_instructions: string | null;
  call_data: string | null;
  created_at: string;
  updated_at: string | null;
}

export class DominosOrderLogModel {
  /**
   * Dashboard stats overview
   */
  static getDashboardStats(tenantId: number, startDate?: string, endDate?: string) {
    const db = getDatabase();

    try {
      let where = 'WHERE tenant_id = ?';
      const params: any[] = [tenantId];

      if (startDate) {
        where += ' AND timestamp >= ?';
        params.push(startDate);
      }
      if (endDate) {
        where += ' AND timestamp <= ?';
        params.push(endDate);
      }

      const row = db.prepare(`
        SELECT
          COUNT(*) as total_requests,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_requests,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_requests,
          ROUND(AVG(CASE WHEN success = 1 THEN order_total ELSE NULL END), 2) as avg_order_value,
          SUM(CASE WHEN success = 1 THEN order_total ELSE 0 END) as total_revenue,
          ROUND(AVG(response_time_ms), 0) as avg_response_time,
          COUNT(DISTINCT session_id) as unique_sessions
        FROM dominos_order_logs
        ${where}
      `).get(...params) as any;

      const successRate = row.total_requests > 0
        ? ((row.successful_requests / row.total_requests) * 100).toFixed(1)
        : '0.0';

      const timeframe = startDate && endDate
        ? `${startDate} to ${endDate}`
        : 'all time';

      loggers.dbOperation('SELECT', 'dominos_order_logs', { tenantId, action: 'dashboardStats' });

      return {
        total_requests: row.total_requests,
        successful_requests: row.successful_requests,
        failed_requests: row.failed_requests,
        success_rate: successRate,
        total_revenue: row.total_revenue || 0,
        avg_order_value: (row.avg_order_value || 0).toString(),
        avg_response_time: row.avg_response_time || 0,
        unique_sessions: row.unique_sessions,
        timeframe,
      };
    } catch (error) {
      throw new Error(`Error fetching dashboard stats: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Paginated log listing (no request_body/response_body for performance)
   */
  static getLogs(tenantId: number, options: {
    limit?: number;
    offset?: number;
    status?: string;
    sessionId?: string;
    storeId?: string;
    startDate?: string;
    endDate?: string;
  } = {}) {
    const db = getDatabase();
    const { limit = 50, offset = 0, status, sessionId, storeId, startDate, endDate } = options;

    try {
      let where = 'WHERE tenant_id = ?';
      const params: any[] = [tenantId];

      if (status === 'success') {
        where += ' AND success = 1';
      } else if (status === 'error' || status === 'failed') {
        where += ' AND success = 0';
      }

      if (sessionId) {
        where += ' AND session_id LIKE ?';
        params.push(`%${sessionId}%`);
      }
      if (storeId) {
        where += ' AND store_id = ?';
        params.push(storeId);
      }
      if (startDate) {
        where += ' AND timestamp >= ?';
        params.push(startDate);
      }
      if (endDate) {
        where += ' AND timestamp <= ?';
        params.push(endDate);
      }

      const logs = db.prepare(`
        SELECT id, tenant_id, session_id, request_id, timestamp, timestamp_cst,
               method, endpoint, status_code, response_time_ms, error_message,
               user_agent, ip_address, store_id, order_total, items_count, success,
               customer_name, customer_phone, order_type, order_summary, intent
        FROM dominos_order_logs
        ${where}
        ORDER BY timestamp DESC
        LIMIT ? OFFSET ?
      `).all(...params, limit, offset) as DominosOrderLogRow[];

      loggers.dbOperation('SELECT', 'dominos_order_logs', { tenantId, action: 'getLogs', count: logs.length });

      return logs;
    } catch (error) {
      throw new Error(`Error fetching logs: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Single log detail with full bodies
   */
  static getById(tenantId: number, id: number): DominosOrderLogRow | null {
    const db = getDatabase();

    try {
      const row = db.prepare(`
        SELECT * FROM dominos_order_logs
        WHERE tenant_id = ? AND id = ?
      `).get(tenantId, id) as DominosOrderLogRow | undefined;

      loggers.dbOperation('SELECT', 'dominos_order_logs', { tenantId, id });

      return row || null;
    } catch (error) {
      throw new Error(`Error fetching log by id: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get all logs for a session
   */
  static getBySessionId(tenantId: number, sessionId: string): DominosOrderLogRow[] {
    const db = getDatabase();

    try {
      const logs = db.prepare(`
        SELECT id, tenant_id, session_id, request_id, timestamp, timestamp_cst,
               method, endpoint, status_code, response_time_ms, error_message,
               user_agent, ip_address, store_id, order_total, items_count, success,
               customer_name, customer_phone, order_type, order_summary, intent
        FROM dominos_order_logs
        WHERE tenant_id = ? AND session_id = ?
        ORDER BY timestamp ASC
      `).all(tenantId, sessionId) as DominosOrderLogRow[];

      loggers.dbOperation('SELECT', 'dominos_order_logs', { tenantId, sessionId, count: logs.length });

      return logs;
    } catch (error) {
      throw new Error(`Error fetching logs by session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Session summary stats
   */
  static getSessionSummary(tenantId: number, sessionId: string) {
    const db = getDatabase();

    try {
      const row = db.prepare(`
        SELECT
          session_id,
          COUNT(*) as total_requests,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_requests,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_requests,
          SUM(response_time_ms) as total_response_time,
          MIN(timestamp) as created_at,
          MAX(timestamp) as last_activity
        FROM dominos_order_logs
        WHERE tenant_id = ? AND session_id = ?
        GROUP BY session_id
      `).get(tenantId, sessionId) as any;

      loggers.dbOperation('SELECT', 'dominos_order_logs', { tenantId, sessionId, action: 'sessionSummary' });

      return row || null;
    } catch (error) {
      throw new Error(`Error fetching session summary: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Performance metrics bucketed by hour
   */
  static getPerformance(tenantId: number, startDate?: string, endDate?: string) {
    const db = getDatabase();

    try {
      let where = 'WHERE tenant_id = ?';
      const params: any[] = [tenantId];

      if (startDate) {
        where += ' AND timestamp >= ?';
        params.push(startDate);
      }
      if (endDate) {
        where += ' AND timestamp <= ?';
        params.push(endDate);
      }

      const metrics = db.prepare(`
        SELECT
          strftime('%Y-%m-%d %H:00:00', timestamp) as period,
          COUNT(*) as total_requests,
          SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful_requests,
          SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failed_requests,
          ROUND(AVG(response_time_ms), 0) as avg_response_time
        FROM dominos_order_logs
        ${where}
        GROUP BY strftime('%Y-%m-%d %H:00:00', timestamp)
        ORDER BY period DESC
        LIMIT 168
      `).all(...params) as any[];

      loggers.dbOperation('SELECT', 'dominos_order_logs', { tenantId, action: 'performance', count: metrics.length });

      return { metrics };
    } catch (error) {
      throw new Error(`Error fetching performance: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Error breakdown by type
   */
  static getErrorBreakdown(tenantId: number, startDate?: string, endDate?: string) {
    const db = getDatabase();

    try {
      let where = 'WHERE tenant_id = ? AND success = 0';
      const params: any[] = [tenantId];

      if (startDate) {
        where += ' AND timestamp >= ?';
        params.push(startDate);
      }
      if (endDate) {
        where += ' AND timestamp <= ?';
        params.push(endDate);
      }

      const breakdown = db.prepare(`
        SELECT
          COALESCE(error_message, 'Incomplete session') as error_type,
          COUNT(*) as count,
          MAX(timestamp) as last_occurrence
        FROM dominos_order_logs
        ${where}
        GROUP BY COALESCE(error_message, 'Incomplete session')
        ORDER BY count DESC
        LIMIT 20
      `).all(...params) as any[];

      loggers.dbOperation('SELECT', 'dominos_order_logs', { tenantId, action: 'errorBreakdown', count: breakdown.length });

      return { breakdown };
    } catch (error) {
      throw new Error(`Error fetching error breakdown: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get the latest timestamp for a tenant (for incremental import)
   */
  static getLatestTimestamp(tenantId: number): string | null {
    const db = getDatabase();
    const row = db.prepare(
      'SELECT MAX(timestamp) as latest FROM dominos_order_logs WHERE tenant_id = ?'
    ).get(tenantId) as { latest: string | null } | undefined;
    return row?.latest || null;
  }

  /**
   * Check which request_ids already exist (for deduplication)
   */
  static getExistingRequestIds(tenantId: number, requestIds: string[]): Set<string> {
    const db = getDatabase();
    const existing = new Set<string>();
    if (requestIds.length === 0) return existing;

    // Process in batches to avoid SQLite variable limit
    const batchSize = 500;
    for (let i = 0; i < requestIds.length; i += batchSize) {
      const batch = requestIds.slice(i, i + batchSize);
      const placeholders = batch.map(() => '?').join(',');
      const rows = db.prepare(
        `SELECT request_id FROM dominos_order_logs WHERE tenant_id = ? AND request_id IN (${placeholders})`
      ).all(tenantId, ...batch) as { request_id: string }[];
      for (const row of rows) {
        existing.add(row.request_id);
      }
    }
    return existing;
  }

  /**
   * Bulk insert for CSV import
   */
  static bulkInsert(tenantId: number, rows: Partial<DominosOrderLogRow>[]): number {
    const db = getDatabase();
    // Ensure value is a SQLite-bindable primitive
    const s = (v: unknown): string | number | null => {
      if (v == null) return null;
      if (typeof v === 'boolean') return v ? 1 : 0;
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') return v as string | number;
      return JSON.stringify(v);
    };
    const n = (v: unknown, def = 0): number => {
      if (v == null) return def;
      if (typeof v === 'boolean') return v ? 1 : 0;
      const num = Number(v);
      return isNaN(num) ? def : num;
    };

    try {
      const insert = db.prepare(`
        INSERT INTO dominos_order_logs (
          tenant_id, session_id, request_id, timestamp, timestamp_cst,
          method, endpoint, status_code, response_time_ms, error_message,
          user_agent, ip_address, store_id, order_total, items_count, success,
          request_body, response_body, error_stack,
          customer_name, customer_phone, customer_address, order_type,
          order_summary, utterance, call_type, payment_type, intent,
          address_verified, order_confirmed, ai_agent_order_output,
          delivery_instructions, call_data, updated_at
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?,
          ?, ?, ?
        )
      `);

      const insertMany = db.transaction((items: Partial<DominosOrderLogRow>[]) => {
        let count = 0;
        for (const r of items) {
          insert.run(
            tenantId,
            s(r.session_id),
            s(r.request_id),
            s(r.timestamp),
            s(r.timestamp_cst),
            s(r.method) || 'POST',
            s(r.endpoint) || '/api/v1/direct-order',
            n(r.status_code),
            n(r.response_time_ms),
            s(r.error_message),
            s(r.user_agent) || 'node-dominos-pizza-api',
            s(r.ip_address) || '35.209.60.11',
            s(r.store_id),
            n(r.order_total),
            n(r.items_count),
            n(r.success),
            s(r.request_body),
            s(r.response_body),
            s(r.error_stack),
            s(r.customer_name),
            s(r.customer_phone),
            s(r.customer_address),
            s(r.order_type),
            s(r.order_summary),
            s(r.utterance),
            s(r.call_type),
            s(r.payment_type),
            s(r.intent),
            s(r.address_verified),
            n(r.order_confirmed),
            s(r.ai_agent_order_output),
            s(r.delivery_instructions),
            s(r.call_data),
            s(r.updated_at)
          );
          count++;
        }
        return count;
      });

      const count = insertMany(rows);
      loggers.dbOperation('BULK INSERT', 'dominos_order_logs', { tenantId, count });
      return count;
    } catch (error) {
      throw new Error(`Error bulk inserting: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

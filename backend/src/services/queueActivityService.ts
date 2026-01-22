/**
 * Queue Activity Service
 * Provides access to queue_activity_log data for monitoring async booking operations
 *
 * The queue_activity_log table tracks all SetAppointment operations that go through
 * the async rate-limiting queue in Node-RED, including retries, completions, and failures.
 */

import BetterSqlite3 from 'better-sqlite3';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface QueueOperation {
  operationId: string;
  patientGuid: string | null;
  patientName: string | null;
  appointmentDatetime: string | null;
  finalStatus: 'completed' | 'failed' | 'pending' | 'expired';
  totalAttempts: number;
  maxAttempts: number;
  appointmentGuid: string | null;
  finalError: string | null;
  eventCount: number;
  startedAt: string;
  endedAt: string | null;
  durationMs: number | null;
}

export interface QueueEvent {
  id: number;
  operationId: string;
  eventType: 'queued' | 'retry_attempt' | 'completed' | 'failed' | 'expired';
  attemptNumber: number;
  maxAttempts: number;
  patientGuid: string | null;
  patientName: string | null;
  appointmentDatetime: string | null;
  scheduleViewGuid: string | null;
  scheduleColumnGuid: string | null;
  appointmentTypeGuid: string | null;
  appointmentGuid: string | null;
  errorMessage: string | null;
  cloud9Response: string | null;
  backoffMs: number | null;
  nextRetryAt: string | null;
  durationMs: number | null;
  uui: string | null;
  sessionId: string | null;
  source: string | null;
  eventTimestamp: string;
  createdAt: string;
}

export interface QueueStats {
  totalOperations: number;
  completedOperations: number;
  failedOperations: number;
  pendingOperations: number;
  expiredOperations: number;
  totalEvents: number;
  averageAttempts: number;
  successRate: number;
  averageDurationMs: number | null;
}

export interface GetOperationsOptions {
  limit?: number;
  offset?: number;
  status?: 'completed' | 'failed' | 'pending' | 'expired';
  hours?: number;
  patientName?: string;
}

// ============================================================================
// QUEUE ACTIVITY SERVICE
// ============================================================================

export class QueueActivityService {
  private db: BetterSqlite3.Database;

  constructor(db: BetterSqlite3.Database) {
    this.db = db;
  }

  /**
   * Check if the queue_activity_log table exists
   */
  tableExists(): boolean {
    const result = this.db.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='queue_activity_log'
    `).get();
    return !!result;
  }

  /**
   * Get operations grouped by operation_id with summary stats
   */
  getOperations(options: GetOperationsOptions = {}): { operations: QueueOperation[]; total: number } {
    const { limit = 50, offset = 0, status, hours, patientName } = options;

    if (!this.tableExists()) {
      return { operations: [], total: 0 };
    }

    // Build WHERE clauses
    const whereClauses: string[] = [];
    const params: any[] = [];

    if (hours) {
      whereClauses.push(`event_timestamp >= datetime('now', '-' || ? || ' hours')`);
      params.push(hours);
    }

    if (patientName) {
      whereClauses.push(`patient_name LIKE ?`);
      params.push(`%${patientName}%`);
    }

    const whereClause = whereClauses.length > 0
      ? `WHERE ${whereClauses.join(' AND ')}`
      : '';

    // Get grouped operations
    let sql = `
      SELECT
        operation_id,
        MAX(patient_guid) as patient_guid,
        MAX(patient_name) as patient_name,
        MAX(appointment_datetime) as appointment_datetime,
        MAX(attempt_number) as total_attempts,
        MAX(max_attempts) as max_attempts,
        MAX(CASE WHEN event_type = 'completed' THEN appointment_guid END) as appointment_guid,
        MAX(CASE WHEN event_type = 'failed' THEN error_message END) as final_error,
        CASE
          WHEN MAX(CASE WHEN event_type = 'completed' THEN 1 ELSE 0 END) = 1 THEN 'completed'
          WHEN MAX(CASE WHEN event_type = 'expired' THEN 1 ELSE 0 END) = 1 THEN 'expired'
          WHEN MAX(CASE WHEN event_type = 'failed' THEN 1 ELSE 0 END) = 1 THEN 'failed'
          ELSE 'pending'
        END as final_status,
        MIN(event_timestamp) as started_at,
        MAX(event_timestamp) as ended_at,
        COUNT(*) as event_count,
        CAST((julianday(MAX(event_timestamp)) - julianday(MIN(event_timestamp))) * 86400000 AS INTEGER) as duration_ms
      FROM queue_activity_log
      ${whereClause}
      GROUP BY operation_id
    `;

    // Add status filter (applies to the grouped result)
    if (status) {
      sql = `
        SELECT * FROM (${sql}) grouped
        WHERE final_status = ?
      `;
      params.push(status);
    }

    sql += ` ORDER BY started_at DESC LIMIT ? OFFSET ?`;

    const operations = this.db.prepare(sql).all(...params, limit, offset) as any[];

    // Get total count
    let countSql = `
      SELECT COUNT(DISTINCT operation_id) as count
      FROM queue_activity_log
      ${whereClause}
    `;

    // For status filter, we need to count from the grouped result
    let countParams = whereClauses.length > 0 ? params.slice(0, whereClauses.length) : [];

    if (status) {
      countSql = `
        SELECT COUNT(*) as count FROM (
          SELECT
            operation_id,
            CASE
              WHEN MAX(CASE WHEN event_type = 'completed' THEN 1 ELSE 0 END) = 1 THEN 'completed'
              WHEN MAX(CASE WHEN event_type = 'expired' THEN 1 ELSE 0 END) = 1 THEN 'expired'
              WHEN MAX(CASE WHEN event_type = 'failed' THEN 1 ELSE 0 END) = 1 THEN 'failed'
              ELSE 'pending'
            END as final_status
          FROM queue_activity_log
          ${whereClause}
          GROUP BY operation_id
        ) grouped
        WHERE final_status = ?
      `;
      countParams.push(status);
    }

    const countResult = this.db.prepare(countSql).get(...countParams) as { count: number };

    // Transform to camelCase
    const transformedOperations: QueueOperation[] = operations.map(op => ({
      operationId: op.operation_id,
      patientGuid: op.patient_guid,
      patientName: op.patient_name,
      appointmentDatetime: op.appointment_datetime,
      finalStatus: op.final_status,
      totalAttempts: op.total_attempts || 0,
      maxAttempts: op.max_attempts || 10,
      appointmentGuid: op.appointment_guid,
      finalError: op.final_error,
      eventCount: op.event_count,
      startedAt: op.started_at,
      endedAt: op.ended_at,
      durationMs: op.duration_ms,
    }));

    return {
      operations: transformedOperations,
      total: countResult?.count || 0,
    };
  }

  /**
   * Get all events for a single operation in chronological order
   */
  getOperationEvents(operationId: string): QueueEvent[] {
    if (!this.tableExists()) {
      return [];
    }

    const events = this.db.prepare(`
      SELECT *
      FROM queue_activity_log
      WHERE operation_id = ?
      ORDER BY event_timestamp ASC
    `).all(operationId) as any[];

    // Transform to camelCase
    return events.map(event => ({
      id: event.id,
      operationId: event.operation_id,
      eventType: event.event_type,
      attemptNumber: event.attempt_number,
      maxAttempts: event.max_attempts,
      patientGuid: event.patient_guid,
      patientName: event.patient_name,
      appointmentDatetime: event.appointment_datetime,
      scheduleViewGuid: event.schedule_view_guid,
      scheduleColumnGuid: event.schedule_column_guid,
      appointmentTypeGuid: event.appointment_type_guid,
      appointmentGuid: event.appointment_guid,
      errorMessage: event.error_message,
      cloud9Response: event.cloud9_response,
      backoffMs: event.backoff_ms,
      nextRetryAt: event.next_retry_at,
      durationMs: event.duration_ms,
      uui: event.uui,
      sessionId: event.session_id,
      source: event.source,
      eventTimestamp: event.event_timestamp,
      createdAt: event.created_at,
    }));
  }

  /**
   * Get overall summary statistics
   */
  getStats(hours?: number): QueueStats {
    if (!this.tableExists()) {
      return {
        totalOperations: 0,
        completedOperations: 0,
        failedOperations: 0,
        pendingOperations: 0,
        expiredOperations: 0,
        totalEvents: 0,
        averageAttempts: 0,
        successRate: 0,
        averageDurationMs: null,
      };
    }

    const whereClause = hours
      ? `WHERE event_timestamp >= datetime('now', '-' || ? || ' hours')`
      : '';
    const params: any[] = hours ? [hours] : [];

    // Get operation stats
    const operationStats = this.db.prepare(`
      SELECT
        COUNT(*) as total_operations,
        SUM(CASE WHEN final_status = 'completed' THEN 1 ELSE 0 END) as completed_operations,
        SUM(CASE WHEN final_status = 'failed' THEN 1 ELSE 0 END) as failed_operations,
        SUM(CASE WHEN final_status = 'pending' THEN 1 ELSE 0 END) as pending_operations,
        SUM(CASE WHEN final_status = 'expired' THEN 1 ELSE 0 END) as expired_operations,
        AVG(total_attempts) as avg_attempts,
        AVG(duration_ms) as avg_duration_ms
      FROM (
        SELECT
          operation_id,
          MAX(attempt_number) as total_attempts,
          CASE
            WHEN MAX(CASE WHEN event_type = 'completed' THEN 1 ELSE 0 END) = 1 THEN 'completed'
            WHEN MAX(CASE WHEN event_type = 'expired' THEN 1 ELSE 0 END) = 1 THEN 'expired'
            WHEN MAX(CASE WHEN event_type = 'failed' THEN 1 ELSE 0 END) = 1 THEN 'failed'
            ELSE 'pending'
          END as final_status,
          CAST((julianday(MAX(event_timestamp)) - julianday(MIN(event_timestamp))) * 86400000 AS INTEGER) as duration_ms
        FROM queue_activity_log
        ${whereClause}
        GROUP BY operation_id
      )
    `).get(...params) as any;

    // Get total event count
    const eventCountResult = this.db.prepare(`
      SELECT COUNT(*) as total_events FROM queue_activity_log ${whereClause}
    `).get(...params) as { total_events: number };

    const totalOperations = operationStats?.total_operations || 0;
    const completedOperations = operationStats?.completed_operations || 0;

    return {
      totalOperations,
      completedOperations,
      failedOperations: operationStats?.failed_operations || 0,
      pendingOperations: operationStats?.pending_operations || 0,
      expiredOperations: operationStats?.expired_operations || 0,
      totalEvents: eventCountResult?.total_events || 0,
      averageAttempts: operationStats?.avg_attempts ? Math.round(operationStats.avg_attempts * 10) / 10 : 0,
      successRate: totalOperations > 0
        ? Math.round((completedOperations / totalOperations) * 1000) / 10
        : 0,
      averageDurationMs: operationStats?.avg_duration_ms
        ? Math.round(operationStats.avg_duration_ms)
        : null,
    };
  }
}

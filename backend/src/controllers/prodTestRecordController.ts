/**
 * Production Test Record Controller
 * API endpoints for tracking and managing test data created in Production
 */

import { Request, Response, NextFunction } from 'express';
import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import {
  ProdTestRecordService,
  type StreamingCancellationSummary,
  CANCELLATION_DELAY_MS,
} from '../services/prodTestRecordService';

// Store for active cancellation operations
interface CancellationOperation {
  operationId: string;
  eventEmitter: EventEmitter;
  db: BetterSqlite3.Database;
  ids: number[];
  startedAt: Date;
  completed: boolean;
  summary: StreamingCancellationSummary | null;
}

const activeCancellations = new Map<string, CancellationOperation>();

// Cleanup old operations (older than 10 minutes)
function cleanupOldOperations() {
  const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
  for (const [operationId, op] of activeCancellations.entries()) {
    if (op.startedAt < tenMinutesAgo && op.completed) {
      op.db.close();
      activeCancellations.delete(operationId);
    }
  }
}

// Path to test-agent database
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

/**
 * Get database connection (read-write)
 */
function getDb(): BetterSqlite3.Database {
  return new BetterSqlite3(TEST_AGENT_DB_PATH);
}

/**
 * Get all production test records with optional filters
 */
export const getRecords = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const {
      recordType,
      status,
      langfuseConfigId,
      limit = '100',
      offset = '0',
      fromDate,
      toDate,
      sortBy,
      sortOrder,
    } = req.query;

    const result = service.getRecords({
      recordType: recordType as 'patient' | 'appointment' | undefined,
      status: status as string | undefined,
      langfuseConfigId: langfuseConfigId ? parseInt(langfuseConfigId as string, 10) : undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      fromDate: fromDate as string | undefined,
      toDate: toDate as string | undefined,
      sortBy: sortBy as string | undefined,
      sortOrder: sortOrder as 'asc' | 'desc' | undefined,
    });

    db.close();

    return res.json({
      success: true,
      data: result.records,
      total: result.total,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Get a single record by ID
 */
export const getRecord = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const { id } = req.params;
    const record = service.getRecord(parseInt(id, 10));

    db.close();

    if (!record) {
      return res.status(404).json({
        success: false,
        error: 'Record not found',
      });
    }

    return res.json({
      success: true,
      data: record,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Get summary statistics
 */
export const getStats = async (_req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const stats = service.getStats();

    db.close();

    return res.json({
      success: true,
      data: stats,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Import records from Langfuse traces
 */
export const importFromLangfuse = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const { configId, fromDate, toDate } = req.body;

    if (!configId || !fromDate) {
      db.close();
      return res.status(400).json({
        success: false,
        error: 'configId and fromDate are required',
      });
    }

    const result = await service.importFromLangfuse({
      configId: parseInt(configId, 10),
      fromDate,
      toDate,
    });

    db.close();

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Update notes for existing appointment records from observation data
 * POST /api/test-monitor/prod-test-records/update-notes
 */
export const updateNotesFromObservations = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const { sessionId } = req.body;

    const result = await service.updateNotesFromObservations(sessionId);

    db.close();

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Get appointments by patient GUID from local database (fast, no Cloud9 API call)
 * GET /api/test-monitor/prod-test-records/patient/:patientGuid/appointments
 */
export const getAppointmentsByPatientGuid = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const { patientGuid } = req.params;

    if (!patientGuid) {
      db.close();
      return res.status(400).json({
        success: false,
        error: 'patientGuid is required',
      });
    }

    const appointments = service.getAppointmentsByPatientGuid(patientGuid);

    db.close();

    return res.json({
      success: true,
      data: appointments,
      count: appointments.length,
      source: 'local_database',
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Import traces for a specific patient GUID from Langfuse observations
 * This finds any booking traces for the patient and imports the notes
 * POST /api/test-monitor/prod-test-records/patient/:patientGuid/import-traces
 */
export const importTracesByPatientGuid = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const { patientGuid } = req.params;

    if (!patientGuid) {
      db.close();
      return res.status(400).json({
        success: false,
        error: 'patientGuid is required',
      });
    }

    const result = await service.importByPatientGuid(patientGuid);

    db.close();

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Manually add a record
 */
export const addRecord = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const record = req.body;

    if (!record.record_type || !record.patient_guid) {
      db.close();
      return res.status(400).json({
        success: false,
        error: 'record_type and patient_guid are required',
      });
    }

    const id = service.addRecord(record);

    db.close();

    return res.json({
      success: true,
      data: { id },
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Update record status
 */
export const updateStatus = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const { id } = req.params;
    const { status, notes } = req.body;

    if (!status) {
      db.close();
      return res.status(400).json({
        success: false,
        error: 'status is required',
      });
    }

    const updated = service.updateStatus(parseInt(id, 10), status, notes);

    db.close();

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Record not found or not updated',
      });
    }

    return res.json({
      success: true,
      message: 'Status updated',
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Cancel an appointment via Cloud9 API
 */
export const cancelAppointment = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const { id } = req.params;

    const result = await service.cancelAppointment(parseInt(id, 10));

    db.close();

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
        details: result.error,
      });
    }

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Bulk cancel multiple appointments
 */
export const bulkCancelAppointments = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      db.close();
      return res.status(400).json({
        success: false,
        error: 'ids array is required',
      });
    }

    const results = await service.bulkCancelAppointments(ids);

    db.close();

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    return res.json({
      success: true,
      data: {
        results,
        summary: {
          total: ids.length,
          succeeded: successCount,
          failed: failCount,
        },
      },
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Delete a record (hard delete)
 */
export const deleteRecord = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const { id } = req.params;

    const deleted = service.deleteRecord(parseInt(id, 10));

    db.close();

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Record not found',
      });
    }

    return res.json({
      success: true,
      message: 'Record deleted',
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Backfill patient names from Cloud9 API for records with missing names
 */
export const backfillPatientNames = async (_req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const result = await service.backfillPatientNames();

    db.close();

    return res.json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Export records as CSV
 */
export const exportCsv = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const { recordType, status } = req.query;

    const result = service.getRecords({
      recordType: recordType as 'patient' | 'appointment' | undefined,
      status: status as string | undefined,
      limit: 10000, // Max export
      offset: 0,
    });

    db.close();

    // Build CSV
    const headers = [
      'id', 'record_type', 'patient_guid', 'appointment_guid',
      'patient_first_name', 'patient_last_name', 'patient_email',
      'appointment_datetime', 'appointment_type', 'location_name',
      'status', 'created_at', 'trace_id'
    ];

    const rows = result.records.map(r => [
      r.id,
      r.record_type,
      r.patient_guid,
      r.appointment_guid || '',
      r.patient_first_name || '',
      r.patient_last_name || '',
      r.patient_email || '',
      r.appointment_datetime || '',
      r.appointment_type || '',
      r.location_name || '',
      r.status,
      r.created_at,
      r.trace_id || ''
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=prod-test-records.csv');
    return res.send(csv);
  } catch (error: any) {
    next(error);
  }
};

// ============================================================================
// STREAMING CANCELLATION ENDPOINTS
// ============================================================================

/**
 * Start a streaming cancellation operation
 * POST /api/test-monitor/prod-test-records/bulk-cancel-stream
 * Body: { ids: number[] }
 * Returns: { operationId: string, total: number, estimatedTimeMs: number }
 */
export const startStreamingCancellation = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'ids array is required',
      });
    }

    // Cleanup old operations
    cleanupOldOperations();

    // Create operation
    const operationId = uuidv4();
    const eventEmitter = new EventEmitter();
    const db = getDb();

    const operation: CancellationOperation = {
      operationId,
      eventEmitter,
      db,
      ids,
      startedAt: new Date(),
      completed: false,
      summary: null,
    };

    activeCancellations.set(operationId, operation);

    // Start the cancellation process in the background
    const service = new ProdTestRecordService(db);
    service.streamingCancelAppointments(ids, eventEmitter, operationId)
      .then(summary => {
        operation.completed = true;
        operation.summary = summary;
        console.log(`[StreamingCancel] Operation ${operationId} completed:`, summary);
      })
      .catch(err => {
        operation.completed = true;
        console.error(`[StreamingCancel] Operation ${operationId} error:`, err);
      });

    // Return immediately with operation ID
    return res.json({
      success: true,
      operationId,
      total: ids.length,
      estimatedTimeMs: ids.length * CANCELLATION_DELAY_MS,
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * SSE stream for cancellation progress
 * GET /api/test-monitor/prod-test-records/cancel-stream/:operationId
 * Returns SSE events:
 *   - cancellation-started: { operationId, total, items[] }
 *   - cancellation-progress: { operationId, item, currentIndex, total }
 *   - cancellation-completed: { operationId, total, succeeded, failed, alreadyCancelled }
 */
export const streamCancellation = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { operationId } = req.params;

    const operation = activeCancellations.get(operationId);
    if (!operation) {
      return res.status(404).json({
        success: false,
        error: 'Operation not found',
      });
    }

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
    res.flushHeaders();

    // Helper to send SSE event
    const sendEvent = (eventType: string, data: any) => {
      res.write(`event: ${eventType}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // If already completed, send the summary
    if (operation.completed && operation.summary) {
      sendEvent('cancellation-completed', operation.summary);
      res.end();
      return;
    }

    // Set up event listeners
    const onStarted = (data: any) => {
      sendEvent('cancellation-started', data);
    };

    const onProgress = (data: any) => {
      sendEvent('cancellation-progress', data);
    };

    const onCompleted = (data: StreamingCancellationSummary) => {
      sendEvent('cancellation-completed', data);
      cleanup();
      res.end();
    };

    // Attach listeners
    operation.eventEmitter.on('cancellation-started', onStarted);
    operation.eventEmitter.on('cancellation-progress', onProgress);
    operation.eventEmitter.on('cancellation-completed', onCompleted);

    // Cleanup function
    const cleanup = () => {
      operation.eventEmitter.off('cancellation-started', onStarted);
      operation.eventEmitter.off('cancellation-progress', onProgress);
      operation.eventEmitter.off('cancellation-completed', onCompleted);
    };

    // Handle client disconnect
    req.on('close', () => {
      console.log(`[StreamingCancel] Client disconnected from operation ${operationId}`);
      cleanup();
    });

    // Send heartbeat every 15 seconds to keep connection alive
    const heartbeatInterval = setInterval(() => {
      if (!res.writableEnded) {
        res.write(': heartbeat\n\n');
      }
    }, 15000);

    // Cleanup heartbeat on connection close
    req.on('close', () => {
      clearInterval(heartbeatInterval);
    });

  } catch (error: any) {
    next(error);
  }
};

/**
 * Get status of a cancellation operation
 * GET /api/test-monitor/prod-test-records/cancel-status/:operationId
 */
export const getCancellationStatus = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  try {
    const { operationId } = req.params;

    const operation = activeCancellations.get(operationId);
    if (!operation) {
      return res.status(404).json({
        success: false,
        error: 'Operation not found',
      });
    }

    return res.json({
      success: true,
      operationId,
      total: operation.ids.length,
      completed: operation.completed,
      summary: operation.summary,
      startedAt: operation.startedAt.toISOString(),
    });
  } catch (error: any) {
    next(error);
  }
};

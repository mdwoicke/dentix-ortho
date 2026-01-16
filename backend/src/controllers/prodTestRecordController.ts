/**
 * Production Test Record Controller
 * API endpoints for tracking and managing test data created in Production
 */

import { Request, Response, NextFunction } from 'express';
import BetterSqlite3 from 'better-sqlite3';
import path from 'path';
import { ProdTestRecordService } from '../services/prodTestRecordService';

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
export const getRecords = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const {
      recordType,
      status,
      limit = '100',
      offset = '0',
      fromDate,
      toDate,
    } = req.query;

    const result = service.getRecords({
      recordType: recordType as 'patient' | 'appointment' | undefined,
      status: status as string | undefined,
      limit: parseInt(limit as string, 10),
      offset: parseInt(offset as string, 10),
      fromDate: fromDate as string | undefined,
      toDate: toDate as string | undefined,
    });

    db.close();

    res.json({
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
export const getRecord = async (req: Request, res: Response, next: NextFunction) => {
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

    res.json({
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
export const getStats = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const db = getDb();
    const service = new ProdTestRecordService(db);

    const stats = service.getStats();

    db.close();

    res.json({
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
export const importFromLangfuse = async (req: Request, res: Response, next: NextFunction) => {
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

    res.json({
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
export const addRecord = async (req: Request, res: Response, next: NextFunction) => {
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

    res.json({
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
export const updateStatus = async (req: Request, res: Response, next: NextFunction) => {
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

    res.json({
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
export const cancelAppointment = async (req: Request, res: Response, next: NextFunction) => {
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

    res.json({
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
export const bulkCancelAppointments = async (req: Request, res: Response, next: NextFunction) => {
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

    res.json({
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
export const deleteRecord = async (req: Request, res: Response, next: NextFunction) => {
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

    res.json({
      success: true,
      message: 'Record deleted',
    });
  } catch (error: any) {
    next(error);
  }
};

/**
 * Export records as CSV
 */
export const exportCsv = async (req: Request, res: Response, next: NextFunction) => {
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
    res.send(csv);
  } catch (error: any) {
    next(error);
  }
};

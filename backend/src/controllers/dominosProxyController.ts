import { Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import path from 'path';
import BetterSqlite3 from 'better-sqlite3';
import logger from '../utils/logger';
import { DominosOrderLogModel } from '../models/DominosOrderLog';
import { diagnose } from '../services/dominosDiagnosisService';

const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

const READ_TIMEOUT = 30000;
const WRITE_TIMEOUT = 60000;

function getServiceUrl(req: Request): string | null {
  return req.tenantContext?.dominos?.serviceUrl || null;
}

function buildTargetUrl(baseUrl: string, path: string, query: string): string {
  const url = new URL(path, baseUrl);
  if (query) url.search = query;
  return url.toString();
}

function handleProxyError(error: unknown, res: Response): void {
  if (error instanceof AxiosError) {
    if (error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED') {
      res.status(503).json({ success: false, error: 'Dominos service unavailable' });
      return;
    }
    if (error.response) {
      const data = error.response.data;
      // If the upstream returned HTML (e.g. Express default 404 page), convert to JSON
      if (typeof data === 'string' && (data.includes('<!DOCTYPE') || data.includes('<html'))) {
        res.status(error.response.status).json({
          success: false,
          error: `Dominos service returned HTTP ${error.response.status}`,
        });
        return;
      }
      res.status(error.response.status).json(data);
      return;
    }
  }
  logger.error('Dominos proxy error', {
    error: error instanceof Error ? error.message : String(error),
  });
  res.status(502).json({ success: false, error: 'Proxy error' });
}

async function proxyGet(req: Request, res: Response, targetPath: string): Promise<void> {
  const serviceUrl = getServiceUrl(req);
  if (!serviceUrl) {
    res.status(400).json({ success: false, error: 'Dominos service URL not configured for this tenant' });
    return;
  }
  try {
    const url = buildTargetUrl(serviceUrl, targetPath, req.url.split('?')[1] || '');
    const start = Date.now();
    logger.info(`[DominosProxy] GET ${targetPath} starting...`);
    const response = await axios.get(url, { timeout: READ_TIMEOUT });
    const elapsed = Date.now() - start;
    logger.info(`[DominosProxy] GET ${targetPath} completed in ${elapsed}ms (status=${response.status}, size=${JSON.stringify(response.data).length})`);
    res.status(response.status).json(response.data);
  } catch (error) {
    handleProxyError(error, res);
  }
}

async function proxyPost(req: Request, res: Response, targetPath: string): Promise<void> {
  const serviceUrl = getServiceUrl(req);
  if (!serviceUrl) {
    res.status(400).json({ success: false, error: 'Dominos service URL not configured for this tenant' });
    return;
  }
  try {
    const url = buildTargetUrl(serviceUrl, targetPath, '');
    const response = await axios.post(url, req.body, {
      timeout: WRITE_TIMEOUT,
      headers: { 'Content-Type': 'application/json' },
    });
    res.status(response.status).json(response.data);
  } catch (error) {
    handleProxyError(error, res);
  }
}

function getTenantId(req: Request): number {
  return req.tenantContext?.id || 4; // Default to dominos tenant
}

// Dashboard - local DB
export const getDashboardStats = (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    const data = DominosOrderLogModel.getDashboardStats(tenantId, startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('getDashboardStats error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch dashboard stats' });
  }
};

export const getDashboardLogs = (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { limit, offset, status, sessionId, storeId, startDate, endDate } = req.query as Record<string, string | undefined>;
    const data = DominosOrderLogModel.getLogs(tenantId, {
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
      status,
      sessionId,
      storeId,
      startDate,
      endDate,
    });
    res.json({ success: true, data });
  } catch (error) {
    logger.error('getDashboardLogs error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch logs' });
  }
};

export const getDashboardLogById = (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const id = parseInt(req.params.id);
    const log = DominosOrderLogModel.getById(tenantId, id);
    if (!log) {
      res.status(404).json({ success: false, error: 'Log not found' });
      return;
    }
    // Parse JSON bodies for frontend consumption
    const data = {
      ...log,
      request_body: log.request_body ? tryParseJSON(log.request_body) : null,
      response_body: log.response_body ? tryParseJSON(log.response_body) : null,
    };
    res.json({ success: true, data });
  } catch (error) {
    logger.error('getDashboardLogById error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch log detail' });
  }
};

export const getDashboardPerformance = (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    const data = DominosOrderLogModel.getPerformance(tenantId, startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('getDashboardPerformance error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch performance data' });
  }
};

export const getDashboardErrors = (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    const data = DominosOrderLogModel.getErrorBreakdown(tenantId, startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('getDashboardErrors error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch error data' });
  }
};

export const getDashboardErrorsByType = (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { startDate, endDate } = req.query as { startDate?: string; endDate?: string };
    const data = DominosOrderLogModel.getErrorBreakdown(tenantId, startDate, endDate);
    res.json({ success: true, data });
  } catch (error) {
    logger.error('getDashboardErrorsByType error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch error data' });
  }
};

export const getSessionDetail = (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const { sessionId } = req.params;
    const logs = DominosOrderLogModel.getBySessionId(tenantId, sessionId);
    const session = DominosOrderLogModel.getSessionSummary(tenantId, sessionId);

    if (!session) {
      res.status(404).json({ success: false, error: 'Session not found' });
      return;
    }

    res.json({ success: true, data: { session, logs } });
  } catch (error) {
    logger.error('getSessionDetail error', { error: error instanceof Error ? error.message : String(error) });
    res.status(500).json({ success: false, error: 'Failed to fetch session detail' });
  }
};

// Health - proxy to external service with graceful fallback
export const getHealth = async (req: Request, res: Response) => {
  const serviceUrl = getServiceUrl(req);
  if (!serviceUrl) {
    res.json({ status: 'unknown', error: 'Dominos service URL not configured for this tenant' });
    return;
  }
  try {
    const url = buildTargetUrl(serviceUrl, '/health', '');
    const response = await axios.get(url, { timeout: READ_TIMEOUT });
    res.status(response.status).json(response.data);
  } catch (error) {
    const status = resolveHealthError(error);
    res.json(status);
  }
};

export const getHealthDetailed = async (req: Request, res: Response) => {
  const serviceUrl = getServiceUrl(req);
  if (!serviceUrl) {
    res.json({
      status: 'unknown',
      uptime: 0,
      version: '',
      components: [{ name: 'Service', status: 'unhealthy', details: 'Service URL not configured for this tenant' }],
    });
    return;
  }
  try {
    const url = buildTargetUrl(serviceUrl, '/api/v1/health', '');
    const response = await axios.get(url, { timeout: READ_TIMEOUT });
    res.status(response.status).json(response.data);
  } catch (error) {
    // Try basic /health as fallback
    try {
      const url = buildTargetUrl(serviceUrl, '/health', '');
      const fallback = await axios.get(url, { timeout: READ_TIMEOUT });
      res.json({
        status: fallback.data?.status || 'unknown',
        uptime: fallback.data?.uptime || 0,
        version: fallback.data?.version || '',
        components: [{ name: 'Application', status: fallback.data?.status === 'healthy' ? 'healthy' : 'unhealthy' }],
      });
    } catch (fallbackError) {
      const status = resolveHealthError(fallbackError);
      res.json({
        status: status.status,
        uptime: 0,
        version: '',
        components: [{ name: 'Service', status: 'unhealthy', details: status.error }],
      });
    }
  }
};

export const getHealthComponent = (req: Request, res: Response) =>
  proxyGet(req, res, `/health/${req.params.component}`);

function resolveHealthError(error: unknown): { status: string; error: string } {
  if (error instanceof AxiosError) {
    if (error.code === 'ECONNREFUSED') {
      return { status: 'unhealthy', error: 'Service is not running (connection refused)' };
    }
    if (error.code === 'ECONNABORTED') {
      return { status: 'unhealthy', error: 'Service timed out' };
    }
    if (error.response) {
      return { status: 'unhealthy', error: `Service returned HTTP ${error.response.status}` };
    }
  }
  return { status: 'unhealthy', error: error instanceof Error ? error.message : 'Unknown error' };
}

// Metrics - proxy
export const getMetrics = (req: Request, res: Response) =>
  proxyGet(req, res, '/metrics');

// Orders - proxy
export const submitOrder = (req: Request, res: Response) =>
  proxyPost(req, res, '/api/v1/direct-order');

// Menu - proxy
export const getStoreMenu = (req: Request, res: Response) =>
  proxyGet(req, res, `/api/v1/direct-order/menu/${req.params.storeId}`);

// Coupons - proxy
export const getStoreCoupons = (req: Request, res: Response) =>
  proxyGet(req, res, `/api/v1/direct-order/coupons/${req.params.storeId}`);

// Store info - fetched directly from Dominos public API
const storeInfoCache = new Map<string, { data: any; expires: number }>();
export const getStoreInfo = async (req: Request, res: Response): Promise<void> => {
  const { storeId } = req.params;
  const cached = storeInfoCache.get(storeId);
  if (cached && cached.expires > Date.now()) {
    res.json(cached.data);
    return;
  }
  try {
    const { data } = await axios.get(
      `https://order.dominos.com/power/store/${storeId}/profile`,
      { timeout: READ_TIMEOUT, headers: { Accept: 'application/json' } }
    );
    const addrDesc = data.AddressDescription || '';
    const streetName = data.StreetName || '';
    const city = data.City || '';
    const region = data.Region || '';
    // AddressDescription often includes city/state already (e.g. "100 East Lake Dr Phenix City, AL")
    // Build a clean "street, city, state" from discrete fields when possible
    let address: string;
    if (streetName && city) {
      address = [streetName, city + (region ? `, ${region}` : '')].filter(Boolean).join(', ');
    } else if (addrDesc) {
      address = addrDesc;
    } else {
      address = [streetName, city, region].filter(Boolean).join(', ');
    }
    const result = {
      storeId,
      name: data.StoreName || '',
      phone: data.Phone || '',
      street: streetName,
      city,
      region,
      address,
    };
    storeInfoCache.set(storeId, { data: result, expires: Date.now() + 3600000 });
    res.json(result);
  } catch (err: any) {
    logger.warn(`Failed to fetch Dominos store info for ${storeId}: ${err.message}`);
    res.status(502).json({ success: false, error: 'Failed to fetch store info' });
  }
};

// Import order logs from external data source
export const importOrderLogs = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const dataSourceUrl = req.body?.dataSourceUrl || req.tenantContext?.dominos?.dataSourceUrl;

    if (!dataSourceUrl) {
      res.status(400).json({
        success: false,
        error: 'No data source URL configured. Set it in Admin > Tenants or provide dataSourceUrl in the request body.',
      });
      return;
    }

    // Get the latest timestamp to determine startDate
    const latestTimestamp = DominosOrderLogModel.getLatestTimestamp(tenantId);
    let startDate: string;

    if (latestTimestamp) {
      // Start from 1 second after the latest record to avoid re-fetching
      // DB stores UTC timestamps without Z suffix — force UTC parse
      const lastDate = new Date(latestTimestamp.endsWith('Z') ? latestTimestamp : latestTimestamp + 'Z');
      lastDate.setSeconds(lastDate.getSeconds() + 1);
      startDate = lastDate.toISOString();
    } else {
      // No existing records - fetch from 30 days ago
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      startDate = thirtyDaysAgo.toISOString();
    }

    // External API requires US date format in CST: "MM/DD/YYYY HH:MM:SS AM" (no comma)
    const startDateUtc = new Date(startDate);
    const startDateForApi = startDateUtc.toLocaleString('en-US', {
      timeZone: 'America/Chicago',
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    }).replace(',', ''); // Remove comma — external API doesn't accept it

    // Fetch from external API
    const fetchUrl = `${dataSourceUrl}/api/v1/dashboard/export/logs?startDate=${encodeURIComponent(startDateForApi)}&format=json`;
    logger.info('Importing order logs', { tenantId, fetchUrl, latestTimestamp, startDate, startDateForApi });

    const response = await axios.get(fetchUrl, { timeout: 60000 });
    const records = Array.isArray(response.data) ? response.data : (response.data?.data || []);

    if (!Array.isArray(records) || records.length === 0) {
      res.json({ success: true, data: { imported: 0, skipped: 0, total_fetched: 0 } });
      return;
    }

    // Deduplicate by request_id
    const incomingIds = records
      .map((r: any) => r.request_id)
      .filter((id: any): id is string => !!id);

    const existingIds = DominosOrderLogModel.getExistingRequestIds(tenantId, incomingIds);

    const newRecords = records.filter((r: any) => {
      if (!r.request_id) return true; // Records without request_id always insert
      return !existingIds.has(r.request_id);
    });

    // Normalize timestamps to ISO format for consistent sorting
    // External API may return "02/11/2026, 12:23:22 PM CST" format
    for (const r of newRecords) {
      if (r.timestamp && !r.timestamp.match(/^\d{4}-/)) {
        const parsed = new Date(r.timestamp.replace(/ C[DS]T$/, ''));
        if (!isNaN(parsed.getTime())) {
          // Preserve original as timestamp_cst, normalize timestamp to ISO
          if (!r.timestamp_cst) r.timestamp_cst = r.timestamp;
          r.timestamp = parsed.toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
        }
      }
    }

    let imported = 0;
    if (newRecords.length > 0) {
      imported = DominosOrderLogModel.bulkInsert(tenantId, newRecords);
    }

    logger.info('Import complete', {
      tenantId,
      total_fetched: records.length,
      imported,
      skipped: records.length - imported,
    });

    res.json({
      success: true,
      data: {
        imported,
        skipped: records.length - imported,
        total_fetched: records.length,
      },
    });
  } catch (error) {
    logger.error('importOrderLogs error', {
      error: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof AxiosError) {
      if (error.code === 'ECONNREFUSED' || error.code === 'ECONNABORTED') {
        res.status(503).json({ success: false, error: 'Data source service unavailable' });
        return;
      }
    }
    res.status(500).json({
      success: false,
      error: `Import failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};

// ============================================================================
// ORDER ERROR DIAGNOSIS
// ============================================================================

const diagnosisRateLimit = new Map<number, { count: number; resetAt: number }>();
const DIAGNOSIS_RATE_LIMIT = 5;
const DIAGNOSIS_RATE_WINDOW = 60000; // 1 minute

export const diagnoseOrder = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const logId = parseInt(req.params.logId);

    if (isNaN(logId)) {
      res.status(400).json({ success: false, error: 'Invalid log ID' });
      return;
    }

    // Rate limit
    const now = Date.now();
    const rl = diagnosisRateLimit.get(tenantId);
    if (rl && rl.resetAt > now) {
      if (rl.count >= DIAGNOSIS_RATE_LIMIT) {
        res.status(429).json({ success: false, error: 'Too many diagnosis requests. Try again in a minute.' });
        return;
      }
      rl.count++;
    } else {
      diagnosisRateLimit.set(tenantId, { count: 1, resetAt: now + DIAGNOSIS_RATE_WINDOW });
    }

    // Get log
    const log = DominosOrderLogModel.getById(tenantId, logId);
    if (!log) {
      res.status(404).json({ success: false, error: 'Log not found' });
      return;
    }
    if (log.success === 1) {
      res.status(409).json({ success: false, error: 'This order succeeded — nothing to diagnose' });
      return;
    }
    if (!log.request_body) {
      res.status(400).json({ success: false, error: 'No request body available for this log entry' });
      return;
    }

    // Get service URL
    const serviceUrl = getServiceUrl(req);
    if (!serviceUrl) {
      res.status(400).json({ success: false, error: 'Dominos service URL not configured for this tenant' });
      return;
    }

    const options = {
      skipReplay: req.body?.skipReplay === true,
      skipFixTest: req.body?.skipFixTest === true,
    };

    const result = await diagnose(log, serviceUrl, options);
    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('diagnoseOrder error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: `Diagnosis failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};

function tryParseJSON(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

// ============================================================================
// ORDER <-> CALL TRACE CORRELATION
// ============================================================================

/**
 * Normalize a phone number to last 10 digits for comparison.
 * Handles formats like "+17208899120", "720-889-9120", "(720) 889-9120", etc.
 */
function normalizePhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/**
 * Extract phone number from a Langfuse session_id.
 * Format: "conv_{configId}_{phone}_{epochMs}"
 * Example: "conv_5_+17208899120_1770834765476" -> "7208899120"
 */
function extractPhoneFromSessionId(sessionId: string): string | null {
  const parts = sessionId.split('_');
  if (parts.length < 4 || parts[0] !== 'conv') return null;
  // Phone is the 3rd segment (index 2)
  return normalizePhone(parts[2]);
}

/**
 * Correlate Dominos order logs with Langfuse call trace sessions.
 *
 * Strategy: phone number + time window matching
 * - Extract phone from Langfuse session_id (conv_{config}_{phone}_{epoch})
 * - Normalize order customer_phone to 10 digits
 * - Match where phones are equal AND order timestamp falls within the session's time window (padded by 30 min)
 */
export const getOrderTraceCorrelation = async (req: Request, res: Response): Promise<void> => {
  try {
    const tenantId = getTenantId(req);
    const { sessionId, orderId, direction } = req.query;
    // direction: 'order-to-trace' (given an order session, find Langfuse sessions)
    //            'trace-to-order' (given a Langfuse session, find order logs)

    let testDb: BetterSqlite3.Database | null = null;
    try {
      testDb = new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: true });
    } catch (err) {
      res.status(503).json({ success: false, error: 'Test agent database unavailable' });
      return;
    }

    if (direction === 'trace-to-order' && sessionId) {
      // Given a Langfuse session_id, find matching order logs
      const phone = extractPhoneFromSessionId(String(sessionId));
      const session = testDb.prepare(
        'SELECT session_id, first_trace_at, last_trace_at, has_order FROM production_sessions WHERE session_id = ?'
      ).get(String(sessionId)) as { session_id: string; first_trace_at: string; last_trace_at: string; has_order: number } | undefined;

      if (!session) {
        testDb.close();
        res.json({ success: true, data: { matches: [], matchMethod: 'none', reason: 'Session not found in production_sessions' } });
        return;
      }

      const matches: any[] = [];
      let matchMethod = 'none';

      if (phone) {
        // Try phone + time window match
        const paddedStart = new Date(new Date(session.first_trace_at).getTime() - 30 * 60 * 1000).toISOString();
        const paddedEnd = new Date(new Date(session.last_trace_at).getTime() + 30 * 60 * 1000).toISOString();

        const { getDatabase } = require('../config/database');
        const mainDb = getDatabase();
        const orderMatches = mainDb.prepare(`
          SELECT id, session_id, timestamp, customer_phone, customer_name, store_id,
                 order_total, items_count, order_confirmed, success, order_summary, endpoint
          FROM dominos_order_logs
          WHERE tenant_id = ?
            AND customer_phone IS NOT NULL
            AND customer_phone != ''
            AND timestamp >= ? AND timestamp <= ?
          ORDER BY timestamp ASC
        `).all(tenantId, paddedStart, paddedEnd) as any[];

        for (const order of orderMatches) {
          const orderPhone = normalizePhone(order.customer_phone);
          if (orderPhone === phone) {
            matches.push({
              ...order,
              matchConfidence: 'high',
              matchMethod: 'phone+time',
            });
          }
        }
        matchMethod = matches.length > 0 ? 'phone+time' : 'phone_no_match';
      }

      // Fallback: time-only matching if no phone match (lower confidence)
      if (matches.length === 0) {
        const paddedStart = new Date(new Date(session.first_trace_at).getTime() - 5 * 60 * 1000).toISOString();
        const paddedEnd = new Date(new Date(session.last_trace_at).getTime() + 5 * 60 * 1000).toISOString();

        const { getDatabase } = require('../config/database');
        const mainDb = getDatabase();
        const timeMatches = mainDb.prepare(`
          SELECT id, session_id, timestamp, customer_phone, customer_name, store_id,
                 order_total, items_count, order_confirmed, success, order_summary, endpoint
          FROM dominos_order_logs
          WHERE tenant_id = ?
            AND order_confirmed = 1
            AND timestamp >= ? AND timestamp <= ?
          ORDER BY timestamp ASC
          LIMIT 5
        `).all(tenantId, paddedStart, paddedEnd) as any[];

        for (const order of timeMatches) {
          matches.push({
            ...order,
            matchConfidence: 'low',
            matchMethod: 'time-only',
          });
        }
        if (matches.length > 0) matchMethod = 'time-only';
      }

      testDb.close();
      res.json({ success: true, data: { matches, matchMethod, sessionInfo: session } });
      return;
    }

    if (direction === 'order-to-trace' && sessionId) {
      // Given an order session_id (telephony format), find matching Langfuse sessions
      const { getDatabase } = require('../config/database');
      const mainDb = getDatabase();

      // Get all orders in this telephony session
      const orders = mainDb.prepare(`
        SELECT id, session_id, timestamp, customer_phone, customer_name, store_id,
               order_total, items_count, order_confirmed, success
        FROM dominos_order_logs
        WHERE tenant_id = ? AND session_id = ?
        ORDER BY timestamp ASC
      `).all(tenantId, String(sessionId)) as any[];

      if (orders.length === 0) {
        testDb.close();
        res.json({ success: true, data: { matches: [], matchMethod: 'none', reason: 'No orders found for this session' } });
        return;
      }

      // Collect phones from orders
      const orderPhones = new Set<string>();
      for (const o of orders) {
        const p = normalizePhone(o.customer_phone);
        if (p) orderPhones.add(p);
      }

      // Get time range of orders
      const minTime = orders[0].timestamp;
      const maxTime = orders[orders.length - 1].timestamp;
      const paddedStart = new Date(new Date(minTime).getTime() - 30 * 60 * 1000).toISOString();
      const paddedEnd = new Date(new Date(maxTime).getTime() + 30 * 60 * 1000).toISOString();

      // Find Langfuse sessions in the time window (Dominos configs: 5 and 6)
      const langfuseSessions = testDb.prepare(`
        SELECT session_id, langfuse_config_id, first_trace_at, last_trace_at,
               trace_count, has_order, has_transfer, error_count, total_latency_ms, input_preview
        FROM production_sessions
        WHERE langfuse_config_id IN (5, 6)
          AND first_trace_at <= ?
          AND last_trace_at >= ?
        ORDER BY first_trace_at ASC
      `).all(paddedEnd, paddedStart) as any[];

      const matches: any[] = [];
      for (const sess of langfuseSessions) {
        const sessPhone = extractPhoneFromSessionId(sess.session_id);
        if (sessPhone && orderPhones.has(sessPhone)) {
          matches.push({
            ...sess,
            matchConfidence: 'high',
            matchMethod: 'phone+time',
          });
        }
      }

      // Fallback: time-only for sessions without phone match
      if (matches.length === 0) {
        for (const sess of langfuseSessions) {
          matches.push({
            ...sess,
            matchConfidence: 'low',
            matchMethod: 'time-only',
          });
        }
      }

      testDb.close();
      res.json({ success: true, data: { matches, orderCount: orders.length, orderPhones: [...orderPhones] } });
      return;
    }

    // Bulk correlation: return all correlations for recent data
    if (!sessionId && !orderId) {
      const { getDatabase } = require('../config/database');
      const mainDb = getDatabase();

      // Get confirmed orders with phone numbers from last 30 days
      const orders = mainDb.prepare(`
        SELECT id, session_id, timestamp, customer_phone, customer_name, store_id,
               order_total, order_confirmed
        FROM dominos_order_logs
        WHERE tenant_id = ?
          AND customer_phone IS NOT NULL AND customer_phone != ''
          AND timestamp >= datetime('now', '-30 days')
        ORDER BY timestamp DESC
        LIMIT 200
      `).all(tenantId) as any[];

      // Get all Dominos Langfuse sessions
      const langfuseSessions = testDb.prepare(`
        SELECT session_id, langfuse_config_id, first_trace_at, last_trace_at,
               trace_count, has_order, has_transfer, error_count, input_preview
        FROM production_sessions
        WHERE langfuse_config_id IN (5, 6)
        ORDER BY first_trace_at DESC
        LIMIT 200
      `).all() as any[];

      // Build phone -> sessions index
      const phoneToSessions = new Map<string, any[]>();
      for (const sess of langfuseSessions) {
        const phone = extractPhoneFromSessionId(sess.session_id);
        if (phone) {
          const arr = phoneToSessions.get(phone) || [];
          arr.push(sess);
          phoneToSessions.set(phone, arr);
        }
      }

      // Match orders to sessions
      const correlations: any[] = [];
      for (const order of orders) {
        const phone = normalizePhone(order.customer_phone);
        if (!phone) continue;

        const candidateSessions = phoneToSessions.get(phone) || [];
        for (const sess of candidateSessions) {
          // Check time overlap (order within session window +/- 30 min)
          const orderTime = new Date(order.timestamp).getTime();
          const sessStart = new Date(sess.first_trace_at).getTime() - 30 * 60 * 1000;
          const sessEnd = new Date(sess.last_trace_at).getTime() + 30 * 60 * 1000;
          if (orderTime >= sessStart && orderTime <= sessEnd) {
            correlations.push({
              orderId: order.id,
              orderSessionId: order.session_id,
              orderTimestamp: order.timestamp,
              orderPhone: order.customer_phone,
              orderCustomer: order.customer_name,
              orderTotal: order.order_total,
              orderConfirmed: order.order_confirmed,
              langfuseSessionId: sess.session_id,
              langfuseConfigId: sess.langfuse_config_id,
              langfuseFirstTrace: sess.first_trace_at,
              langfuseLastTrace: sess.last_trace_at,
              langfuseHasOrder: sess.has_order,
              langfuseTraceCount: sess.trace_count,
              matchConfidence: 'high',
              matchMethod: 'phone+time',
            });
          }
        }
      }

      testDb.close();
      res.json({
        success: true,
        data: {
          correlations,
          stats: {
            ordersChecked: orders.length,
            sessionsChecked: langfuseSessions.length,
            matchesFound: correlations.length,
            uniquePhonesInOrders: new Set(orders.map((o: any) => normalizePhone(o.customer_phone)).filter(Boolean)).size,
            uniquePhonesInSessions: phoneToSessions.size,
          },
        },
      });
      return;
    }

    if (testDb) testDb.close();
    res.status(400).json({ success: false, error: 'Provide sessionId with direction=trace-to-order or direction=order-to-trace' });
  } catch (error) {
    logger.error('getOrderTraceCorrelation error', {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({
      success: false,
      error: `Correlation failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
};

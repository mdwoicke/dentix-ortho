import { Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import logger from '../utils/logger';
import { DominosOrderLogModel } from '../models/DominosOrderLog';

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

function tryParseJSON(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * Dominos API Service
 * Proxied calls to the Domino's Order Service through the dentix-ortho backend.
 * Uses axios directly (not the standard apiClient) because the Domino's service
 * returns { success: true } instead of { status: 'success' }.
 */

import axios from 'axios';
import { API_CONFIG } from '../../utils/constants';
import { getAuthToken, getCurrentTenantId } from './client';
import type {
  DominosDashboardStats,
  DominosOrderLog,
  DominosLogDetail,
  DominosPerformanceData,
  DominosErrorBreakdown,
  DominosErrorByType,
  DominosHealthStatus,
  DominosSessionDetail,
  DominosMenuItem,
  DominosOrderSubmission,
} from '../../types/dominos.types';

const dominosClient = axios.create({
  baseURL: `${API_CONFIG.BASE_URL}/dominos`,
  timeout: API_CONFIG.TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

// Attach auth + tenant headers
dominosClient.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) config.headers['Authorization'] = `Bearer ${token}`;
  const tenantId = getCurrentTenantId();
  if (tenantId) config.headers['X-Tenant-Id'] = String(tenantId);
  return config;
});

// Dashboard
export async function getDashboardStats(): Promise<DominosDashboardStats> {
  const { data } = await dominosClient.get('/dashboard/stats');
  const raw = data.data || data;
  return {
    totalOrders: raw.total_requests ?? 0,
    successfulOrders: raw.successful_requests ?? 0,
    failedOrders: raw.failed_requests ?? 0,
    successRate: parseFloat(raw.success_rate ?? '0') / 100,
    totalRevenue: raw.total_revenue ?? 0,
    averageOrderValue: parseFloat(raw.avg_order_value ?? '0'),
    averageResponseTime: raw.avg_response_time ?? 0,
    uniqueSessions: raw.unique_sessions ?? 0,
    period: raw.timeframe ?? '',
  };
}

export async function getDashboardLogs(params?: {
  limit?: number;
  offset?: number;
  status?: string;
  sessionId?: string;
  storeId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<{ logs: DominosOrderLog[]; total: number }> {
  const { data } = await dominosClient.get('/dashboard/logs', { params });
  const raw = data.data || data;
  // The API returns a flat array of log entries
  const logs = Array.isArray(raw) ? raw : (raw.logs || []);
  return { logs, total: logs.length };
}

export async function getDashboardLogById(id: number): Promise<DominosLogDetail> {
  const { data } = await dominosClient.get(`/dashboard/logs/${id}`);
  return data.data || data;
}

export async function getPerformance(params?: {
  period?: string;
  interval?: string;
}): Promise<DominosPerformanceData[]> {
  const { data } = await dominosClient.get('/dashboard/performance', { params });
  const raw = data.data || data;
  const metrics = raw.metrics || (Array.isArray(raw) ? raw : []);
  return metrics.map((m: any) => ({
    timestamp: m.period ?? m.timestamp ?? '',
    avgResponseTime: m.avg_response_time ?? 0,
    requestCount: m.total_requests ?? 0,
    errorCount: m.failed_requests ?? 0,
    successRate: m.total_requests > 0 ? (m.successful_requests ?? 0) / m.total_requests : 0,
  }));
}

export async function getErrorBreakdown(params?: {
  period?: string;
}): Promise<DominosErrorBreakdown[]> {
  const { data } = await dominosClient.get('/dashboard/errors', { params });
  const raw = data.data || data;
  const breakdown = raw.breakdown || (Array.isArray(raw) ? raw : []);
  return breakdown.map((e: any) => ({
    error_type: e.error_type ?? '',
    count: e.count ?? 0,
    percentage: 0,
    last_occurred: e.last_occurrence ?? '',
  }));
}

export async function getErrorsByType(params?: {
  period?: string;
}): Promise<DominosErrorByType[]> {
  const { data } = await dominosClient.get('/dashboard/errors/by-type', { params });
  const raw = data.data || data;
  const topErrors = raw.top_errors || raw.breakdown || (Array.isArray(raw) ? raw : []);
  return topErrors.map((e: any) => ({
    type: e.error_type || e.error_message || e.type || '',
    count: e.count ?? 0,
    examples: [],
  }));
}

// Health
export async function getHealth(): Promise<{ status: string }> {
  const { data } = await dominosClient.get('/health');
  return data;
}

export async function getHealthDetailed(): Promise<DominosHealthStatus> {
  try {
    const { data } = await dominosClient.get('/health/detailed');
    const raw = data.data || data;
    return {
      status: raw.status ?? 'unknown',
      uptime: raw.uptime ?? 0,
      version: raw.version ?? '',
      components: Array.isArray(raw.components)
        ? raw.components.map((c: any) => ({
            name: c.name ?? '',
            status: c.status ?? 'unknown',
            responseTime: c.responseTime ?? c.response_time,
            details: c.details ?? c.message,
          }))
        : [],
    };
  } catch {
    // /health/detailed may timeout; fall back to basic health
    const { data } = await dominosClient.get('/health');
    return {
      status: data.status ?? 'unknown',
      uptime: data.uptime ?? 0,
      version: data.version ?? '',
      components: [
        { name: 'Application', status: data.status === 'healthy' ? 'healthy' : 'unhealthy' },
      ],
    };
  }
}

export async function getHealthComponent(component: string): Promise<DominosHealthStatus> {
  const { data } = await dominosClient.get(`/health/${component}`);
  const raw = data.data || data;
  return {
    status: raw.status ?? 'unknown',
    uptime: raw.uptime ?? 0,
    version: raw.version ?? '',
    components: Array.isArray(raw.components) ? raw.components : [],
  };
}

// Metrics
export async function getMetrics(): Promise<Record<string, unknown>> {
  const { data } = await dominosClient.get('/metrics');
  return data;
}

// Orders
export async function submitOrder(order: DominosOrderSubmission): Promise<Record<string, any>> {
  const { data } = await dominosClient.post('/orders/submit', order);
  return data;
}

// Menu
export async function getStoreMenu(storeId: string): Promise<{
  storeId: string;
  items: DominosMenuItem[];
}> {
  try {
    const { data } = await dominosClient.get(`/menu/${storeId}`);
    const raw = data.menu || data.data || data;

    // Extract products from the Dominos menu structure
    // Prices live in a top-level Variants object, keyed by variant code
    const items: DominosMenuItem[] = [];
    const products = raw?.Products || {};
    const variants = raw?.Variants || {};

    for (const [code, product] of Object.entries(products as Record<string, any>)) {
      // product.Variants is an array of variant code strings (e.g. ["B16PBIT","B32PBIT"])
      // Look up the default variant (from Tags.DefaultVariant) or first variant in the top-level Variants map
      let price = 0;
      const defaultVariant = product.Tags?.DefaultVariant;
      const variantCodes: string[] = Array.isArray(product.Variants) ? product.Variants : [];

      if (defaultVariant && variants[defaultVariant]?.Price) {
        price = parseFloat(variants[defaultVariant].Price);
      } else {
        for (const vc of variantCodes) {
          if (variants[vc]?.Price && parseFloat(variants[vc].Price) > 0) {
            price = parseFloat(variants[vc].Price);
            break;
          }
        }
      }

      items.push({
        code,
        name: product.Name || code,
        description: product.Description || '',
        price,
        category: product.ProductType || product.Category || '',
        available: product.AvailableToppings !== undefined || true,
      });
    }

    return { storeId, items };
  } catch (err: any) {
    const msg = err.response?.data?.error || err.message || 'Failed to fetch menu';
    throw new Error(msg);
  }
}

// Import
export async function importOrderLogs(dataSourceUrl?: string): Promise<{
  imported: number;
  skipped: number;
  total_fetched: number;
}> {
  const { data } = await dominosClient.post('/dashboard/import', dataSourceUrl ? { dataSourceUrl } : {});
  return data.data || data;
}

// Sessions
export async function getSessionDetail(sessionId: string): Promise<DominosSessionDetail> {
  const { data } = await dominosClient.get(`/sessions/${sessionId}`);
  const raw = data.data || data;
  const logs = raw.logs || [];
  const session = raw.session || {};
  return {
    session_id: session.session_id || sessionId,
    logs,
    summary: {
      totalCalls: session.total_requests ?? logs.length,
      successCount: session.successful_requests ?? logs.filter((l: any) => l.status_code >= 200 && l.status_code < 300).length,
      failCount: session.failed_requests ?? logs.filter((l: any) => l.status_code >= 400).length,
      totalResponseTime: logs.reduce((s: number, l: any) => s + (l.response_time_ms || 0), 0),
      startTime: session.created_at || logs[logs.length - 1]?.timestamp || '',
      endTime: session.last_activity || logs[0]?.timestamp || '',
    },
  };
}

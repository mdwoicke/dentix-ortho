import { Request, Response } from 'express';
import axios, { AxiosError } from 'axios';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

const REQUEST_TIMEOUT = 30000;

/**
 * Minimal CSV parser: handles quoted fields with embedded commas, newlines, and escaped quotes.
 */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field);
        field = '';
      } else if (ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) {
        row.push(field);
        field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
        if (ch === '\r') i++;
      } else {
        field += ch;
      }
    }
  }
  // Last field / row
  row.push(field);
  if (row.length > 1 || row[0] !== '') rows.push(row);

  if (rows.length < 2) return [];

  const headers = rows[0];
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = r[i] ?? '';
    }
    return obj;
  });
}

/**
 * Try to load records from the local CSV fallback file.
 */
function loadCsvFallback(): Record<string, string>[] | null {
  const candidates = [
    path.resolve(__dirname, '../../../current/CDH_List_Management_Records.csv'),
    path.resolve(__dirname, '../../../current/List_management-Updated-V2.csv'),
  ];

  for (const filePath of candidates) {
    try {
      if (fs.existsSync(filePath)) {
        const text = fs.readFileSync(filePath, 'utf-8');
        const records = parseCsv(text);
        if (records.length > 0) {
          logger.info(`[FabricWorkflow] Loaded ${records.length} records from CSV fallback: ${path.basename(filePath)}`);
          return records;
        }
      }
    } catch (err) {
      logger.warn(`[FabricWorkflow] Failed to read CSV fallback ${filePath}: ${err}`);
    }
  }
  return null;
}

/**
 * GET /api/fabric-workflow/records
 * Proxy to the tenant's Fabric Workflow API endpoint with basic auth.
 * Falls back to local CSV file if the API is not available.
 */
export async function getRecords(req: Request, res: Response): Promise<void> {
  const config = req.tenantContext?.fabricWorkflow;

  // Try remote API first (if configured)
  if (config?.url) {
    try {
      const start = Date.now();
      const response = await axios.get(config.url, {
        timeout: REQUEST_TIMEOUT,
        auth: {
          username: config.username,
          password: config.password,
        },
        headers: { Accept: 'application/json' },
      });
      const elapsed = Date.now() - start;

      const rawData = response.data;
      const records = Array.isArray(rawData) ? rawData : (rawData?.data || rawData?.records || []);

      logger.info(`[FabricWorkflow] GET records from API: ${records.length} records in ${elapsed}ms`);

      res.json({
        success: true,
        data: records,
        count: records.length,
        source: 'api',
        fetchedAt: new Date().toISOString(),
      });
      return;
    } catch (error) {
      const errMsg = error instanceof AxiosError
        ? `HTTP ${error.response?.status || error.code || 'unknown'}`
        : (error instanceof Error ? error.message : 'unknown');
      logger.warn(`[FabricWorkflow] API fetch failed (${errMsg}), falling back to CSV`);
    }
  }

  // Fallback: local CSV file
  const csvRecords = loadCsvFallback();
  if (csvRecords) {
    res.json({
      success: true,
      data: csvRecords,
      count: csvRecords.length,
      source: 'csv',
      fetchedAt: new Date().toISOString(),
    });
    return;
  }

  // Neither source available
  res.status(400).json({
    success: false,
    error: 'Fabric Workflow API not reachable and no local CSV fallback found',
  });
}

/**
 * POST /api/fabric-workflow/test-connection
 * Test connectivity to a Fabric Workflow API endpoint.
 * Accepts { url, username, password } in body.
 */
export async function testConnection(req: Request, res: Response): Promise<void> {
  const { url, username, password } = req.body;

  if (!url) {
    res.status(400).json({ success: false, error: 'URL is required' });
    return;
  }

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      auth: username && password ? { username, password } : undefined,
      headers: { Accept: 'application/json' },
    });

    const rawData = response.data;
    const records = Array.isArray(rawData) ? rawData : (rawData?.data || rawData?.records || []);

    res.json({
      success: true,
      data: {
        connected: true,
        recordCount: records.length,
        status: response.status,
      },
    });
  } catch (error) {
    const message = error instanceof AxiosError
      ? (error.code === 'ECONNREFUSED' ? 'Connection refused'
        : error.code === 'ECONNABORTED' ? 'Connection timed out'
        : error.response ? `HTTP ${error.response.status}: ${error.response.statusText}`
        : error.message)
      : (error instanceof Error ? error.message : 'Unknown error');

    res.json({
      success: true,
      data: {
        connected: false,
        error: message,
      },
    });
  }
}

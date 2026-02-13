/**
 * Cache Refresh Scheduler
 *
 * Backup scheduler that triggers Node-RED cache refresh every 5 minutes
 * during business hours (7am-5pm CST, Mon-Fri).
 *
 * This is a fallback in case the Node-RED cron job isn't firing.
 */

import BetterSqlite3 from 'better-sqlite3';
import path from 'path';

// Database path for logging
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

const NODERED_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api';
const AUTH = 'Basic ' + Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

// Configuration
const CONFIG = {
  refreshIntervalMs: 5 * 60 * 1000, // 5 minutes
  startupDelayMs: 10 * 1000, // 10 seconds
  businessHoursStart: 7, // 7am CST
  businessHoursEnd: 17, // 5pm CST
  timezone: 'CST (UTC-6)',
};

// Track state
let intervalId: NodeJS.Timeout | null = null;
let lastRefreshTime: Date | null = null;
let lastRefreshResult: { success: boolean; message: string } | null = null;

/**
 * Initialize the database table for refresh logs
 */
function initializeDatabase(): void {
  try {
    const db = new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: false });
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS cache_refresh_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          timestamp TEXT NOT NULL,
          source TEXT NOT NULL DEFAULT 'backend-scheduler',
          success INTEGER NOT NULL,
          message TEXT,
          skipped INTEGER DEFAULT 0,
          skip_reason TEXT,
          duration_ms INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
      `);
      // Create index for timestamp queries
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_cache_refresh_logs_timestamp
        ON cache_refresh_logs(timestamp DESC)
      `);
    } finally {
      db.close();
    }
  } catch (err: unknown) {
    console.warn(`[CacheScheduler] Failed to initialize database: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Log a refresh attempt to the database
 */
function logRefreshAttempt(
  success: boolean,
  message: string,
  skipped: boolean = false,
  skipReason: string | null = null,
  durationMs: number | null = null
): void {
  try {
    const db = new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: false });
    try {
      db.prepare(`
        INSERT INTO cache_refresh_logs (timestamp, source, success, message, skipped, skip_reason, duration_ms)
        VALUES (?, 'backend-scheduler', ?, ?, ?, ?, ?)
      `).run(
        new Date().toISOString(),
        success ? 1 : 0,
        message,
        skipped ? 1 : 0,
        skipReason,
        durationMs
      );

      // Keep only last 500 logs
      db.exec(`
        DELETE FROM cache_refresh_logs
        WHERE id NOT IN (SELECT id FROM cache_refresh_logs ORDER BY id DESC LIMIT 500)
      `);
    } finally {
      db.close();
    }
  } catch (err: unknown) {
    console.warn(`[CacheScheduler] Failed to log refresh: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Check if current time is within business hours (7am-5pm CST, Mon-Fri)
 */
function isBusinessHours(): boolean {
  const now = new Date();

  // Convert to CST (UTC-6)
  const cstOffset = -6 * 60; // minutes
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const cstTime = new Date(utc + (cstOffset * 60000));

  const hour = cstTime.getHours();
  const dayOfWeek = cstTime.getDay(); // 0 = Sunday, 6 = Saturday

  const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
  const isDuringHours = hour >= CONFIG.businessHoursStart && hour < CONFIG.businessHoursEnd;

  return isWeekday && isDuringHours;
}

/**
 * Trigger cache refresh via Node-RED endpoint
 */
async function triggerCacheRefresh(): Promise<{ success: boolean; message: string }> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // Check business hours
  if (!isBusinessHours()) {
    const msg = 'Outside business hours, skipping refresh';
    console.log(`[CacheScheduler] ${timestamp} - ${msg}`);
    logRefreshAttempt(true, msg, true, 'outside_business_hours');
    return { success: true, message: 'Skipped - outside business hours' };
  }

  console.log(`[CacheScheduler] ${timestamp} - Triggering cache refresh...`);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    // Use /test/redis-slot-cache/trigger which actually writes to Redis
    // (the /chord/ortho-prd/cache/trigger endpoint only writes to flow context until v10 is deployed)
    const response = await fetch(`${NODERED_URL}/test/redis-slot-cache/trigger`, {
      method: 'POST',
      headers: {
        'Authorization': AUTH,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ source: 'backend-scheduler' }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);
    const durationMs = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json() as any;
      const msg = data.message || 'Cache refresh triggered successfully';
      console.log(`[CacheScheduler] ${timestamp} - ${msg} (${durationMs}ms)`);
      lastRefreshTime = new Date();
      lastRefreshResult = { success: true, message: msg };
      logRefreshAttempt(true, msg, false, null, durationMs);
      return lastRefreshResult;
    } else {
      const text = await response.text();
      const msg = `HTTP ${response.status}: ${text.substring(0, 100)}`;
      console.error(`[CacheScheduler] ${timestamp} - Refresh failed: ${msg}`);
      lastRefreshResult = { success: false, message: msg };
      logRefreshAttempt(false, msg, false, null, durationMs);
      return lastRefreshResult;
    }
  } catch (error: any) {
    const durationMs = Date.now() - startTime;
    const msg = error.message || 'Unknown error';
    console.error(`[CacheScheduler] ${timestamp} - Refresh error: ${msg}`);
    lastRefreshResult = { success: false, message: msg };
    logRefreshAttempt(false, msg, false, null, durationMs);
    return lastRefreshResult;
  }
}

/**
 * Start the cache refresh scheduler
 */
export function startCacheRefreshScheduler(): void {
  if (intervalId) {
    console.log('[CacheScheduler] Already running');
    return;
  }

  // Initialize database table
  initializeDatabase();

  console.log('[CacheScheduler] Starting cache refresh scheduler (every 5 minutes during business hours)');

  // Run immediately on startup (with a small delay to let services initialize)
  setTimeout(() => {
    triggerCacheRefresh();
  }, CONFIG.startupDelayMs);

  // Then run every 5 minutes
  intervalId = setInterval(() => {
    triggerCacheRefresh();
  }, CONFIG.refreshIntervalMs);
}

/**
 * Stop the cache refresh scheduler
 */
export function stopCacheRefreshScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log('[CacheScheduler] Stopped');
  }
}

/**
 * Get scheduler status including configuration
 */
export function getCacheSchedulerStatus(): {
  running: boolean;
  config: typeof CONFIG;
  lastRefreshTime: string | null;
  lastRefreshResult: { success: boolean; message: string } | null;
  nextRefreshIn: number;
  isBusinessHours: boolean;
} {
  return {
    running: intervalId !== null,
    config: CONFIG,
    lastRefreshTime: lastRefreshTime?.toISOString() || null,
    lastRefreshResult,
    nextRefreshIn: CONFIG.refreshIntervalMs / 1000,
    isBusinessHours: isBusinessHours()
  };
}

/**
 * Get refresh history from database
 */
export function getCacheRefreshHistory(limit: number = 50): Array<{
  id: number;
  timestamp: string;
  source: string;
  success: boolean;
  message: string;
  skipped: boolean;
  skipReason: string | null;
  durationMs: number | null;
}> {
  try {
    const db = new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: true });
    try {
      const rows = db.prepare(`
        SELECT id, timestamp, source, success, message, skipped, skip_reason, duration_ms
        FROM cache_refresh_logs
        ORDER BY timestamp DESC
        LIMIT ?
      `).all(limit) as any[];

      return rows.map(row => ({
        id: row.id,
        timestamp: row.timestamp,
        source: row.source,
        success: row.success === 1,
        message: row.message,
        skipped: row.skipped === 1,
        skipReason: row.skip_reason,
        durationMs: row.duration_ms
      }));
    } finally {
      db.close();
    }
  } catch (err: unknown) {
    console.warn(`[CacheScheduler] Failed to get history: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

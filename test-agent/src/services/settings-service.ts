/**
 * Settings Service
 * Fetches app settings from the backend API with direct DB fallback
 */

import axios from 'axios';
import { config } from '../config/config';
import * as path from 'path';
import * as fs from 'fs';

// Import better-sqlite3 for direct database access fallback
let BetterSqlite3: typeof import('better-sqlite3') | null = null;
try {
  BetterSqlite3 = require('better-sqlite3');
} catch {
  // better-sqlite3 not available
}

export interface FlowiseConfig {
  id: number;
  name: string;
  url: string;
  apiKey: string;
  hasApiKey: boolean;
  isDefault: boolean;
}

export interface LangfuseConfig {
  id: number;
  name: string;
  host: string;
  publicKey: string;
  secretKey: string;
  hasSecretKey: boolean;
  isDefault: boolean;
}

// Cache for settings to avoid repeated API calls
let cachedFlowiseConfig: FlowiseConfig | null = null;
let cachedLangfuseConfig: LangfuseConfig | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Get the active (default) Flowise configuration from the backend
 */
export async function getActiveFlowiseConfig(): Promise<FlowiseConfig | null> {
  // Check cache first
  if (cachedFlowiseConfig && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedFlowiseConfig;
  }

  try {
    const response = await axios.get(
      `${config.backend.baseUrl}/api/test-monitor/flowise-configs/active`,
      { timeout: 10000 }
    );

    if (response.data?.success && response.data?.data) {
      cachedFlowiseConfig = response.data.data;
      cacheTimestamp = Date.now();
      return cachedFlowiseConfig;
    }

    return null;
  } catch (error: any) {
    console.warn(`[SettingsService] Failed to fetch active Flowise config: ${error.message}`);
    return null;
  }
}

/**
 * Get the active (default) Langfuse configuration from the backend
 */
export async function getActiveLangfuseConfig(): Promise<LangfuseConfig | null> {
  // Check cache first
  if (cachedLangfuseConfig && Date.now() - cacheTimestamp < CACHE_TTL_MS) {
    return cachedLangfuseConfig;
  }

  try {
    const response = await axios.get(
      `${config.backend.baseUrl}/api/test-monitor/langfuse-configs/active`,
      { timeout: 10000 }
    );

    if (response.data?.success && response.data?.data) {
      cachedLangfuseConfig = response.data.data;
      cacheTimestamp = Date.now();
      return cachedLangfuseConfig;
    }

    return null;
  } catch (error: any) {
    console.warn(`[SettingsService] Failed to fetch active Langfuse config: ${error.message}`);
    return null;
  }
}

/**
 * Clear the settings cache
 */
export function clearSettingsCache(): void {
  cachedFlowiseConfig = null;
  cachedLangfuseConfig = null;
  cacheTimestamp = 0;
}

/**
 * Get Flowise config directly from local database (fallback when API unavailable)
 */
function getFlowiseConfigFromDb(id: number): FlowiseConfig | null {
  if (!BetterSqlite3) return null;

  const dbPath = path.resolve(__dirname, '../../data/test-results.db');
  if (!fs.existsSync(dbPath)) return null;

  try {
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(`
      SELECT id, name, url, api_key, is_default
      FROM flowise_configs
      WHERE id = ?
    `).get(id) as { id: number; name: string; url: string; api_key: string | null; is_default: number } | undefined;
    db.close();

    if (row) {
      return {
        id: row.id,
        name: row.name,
        url: row.url,
        apiKey: row.api_key || '',
        hasApiKey: !!row.api_key,
        isDefault: row.is_default === 1,
      };
    }
    return null;
  } catch (error: any) {
    console.warn(`[SettingsService] Direct DB fallback failed: ${error.message}`);
    return null;
  }
}

/**
 * Get a specific Flowise configuration by ID from the backend (with direct DB fallback)
 */
export async function getFlowiseConfigById(id: number): Promise<FlowiseConfig | null> {
  // Try API first
  try {
    const response = await axios.get(
      `${config.backend.baseUrl}/api/test-monitor/flowise-configs/${id}`,
      { timeout: 5000 }
    );

    if (response.data?.success && response.data?.data) {
      return response.data.data;
    }
  } catch (error: any) {
    // API failed, try direct database access
    console.log(`[SettingsService] API unavailable, trying direct DB access for config ${id}`);
    const dbConfig = getFlowiseConfigFromDb(id);
    if (dbConfig) {
      console.log(`[SettingsService] Got config from DB: ${dbConfig.name} (${dbConfig.url.substring(0, 60)}...)`);
      return dbConfig;
    }
    console.warn(`[SettingsService] Failed to fetch Flowise config ID ${id}: ${error.message}`);
  }

  return null;
}

/**
 * Get a specific Langfuse configuration by ID from the backend
 */
export async function getLangfuseConfigById(id: number): Promise<LangfuseConfig | null> {
  try {
    const response = await axios.get(
      `${config.backend.baseUrl}/api/test-monitor/langfuse-configs/${id}`,
      { timeout: 10000 }
    );

    if (response.data?.success && response.data?.data) {
      return response.data.data;
    }

    return null;
  } catch (error: any) {
    console.warn(`[SettingsService] Failed to fetch Langfuse config ID ${id}: ${error.message}`);
    return null;
  }
}

/**
 * Get Flowise endpoint URL, with fallback to hardcoded config
 * @param configId Optional specific config ID to use instead of active/default
 */
export async function getFlowiseEndpoint(configId?: number): Promise<{ url: string; apiKey?: string }> {
  // If a specific config ID is provided, fetch that one
  if (configId !== undefined) {
    const specificConfig = await getFlowiseConfigById(configId);
    if (specificConfig) {
      console.log(`[SettingsService] Using Flowise config ID ${configId}: ${specificConfig.name}`);
      return {
        url: specificConfig.url,
        apiKey: specificConfig.hasApiKey ? specificConfig.apiKey : undefined,
      };
    }
    console.warn(`[SettingsService] Flowise config ID ${configId} not found, falling back to default`);
  }

  // Use the active/default config
  const activeConfig = await getActiveFlowiseConfig();

  if (activeConfig) {
    return {
      url: activeConfig.url,
      apiKey: activeConfig.hasApiKey ? activeConfig.apiKey : undefined,
    };
  }

  // No hardcoded fallbacks - throw error if no config found
  throw new Error('[SettingsService] No Flowise configuration found. Ensure the backend is running and a default config exists in the database.');
}

/**
 * Get Langfuse configuration, with optional specific config ID
 * @param configId Optional specific config ID to use instead of active/default
 */
export async function getLangfuseEndpoint(configId?: number): Promise<LangfuseConfig | null> {
  // If a specific config ID is provided, fetch that one
  if (configId !== undefined) {
    const specificConfig = await getLangfuseConfigById(configId);
    if (specificConfig) {
      console.log(`[SettingsService] Using Langfuse config ID ${configId}: ${specificConfig.name}`);
      return specificConfig;
    }
    console.warn(`[SettingsService] Langfuse config ID ${configId} not found, falling back to default`);
  }

  // Use the active/default config
  return getActiveLangfuseConfig();
}

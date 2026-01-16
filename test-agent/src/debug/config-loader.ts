/**
 * Config Loader
 * Loads environment configurations from the database for layer testing
 */

import BetterSqlite3 from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { Environment, EnvironmentConfig, Cloud9Credentials } from './types';

// ============================================================================
// DEFAULT CONFIGURATIONS
// ============================================================================

// Cloud9 Sandbox (Testing) credentials
const CLOUD9_SANDBOX: Cloud9Credentials = {
  clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
  userName: 'IntelepeerTest',
  password: '#!InteleP33rTest!#',
  vendorUserName: 'IntelepeerTest',
};

// Cloud9 Production credentials (placeholder - should be loaded from secure storage)
const CLOUD9_PRODUCTION: Cloud9Credentials = {
  clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
  userName: 'IntelepeerProd',  // Placeholder
  password: '',  // Should be loaded from env/secrets
  vendorUserName: 'IntelepeerProd',
};

// Node-RED configuration
const NODERED_BASE = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api';
const NODERED_AUTH = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

// Default test GUIDs (from Cloud9 sandbox)
const DEFAULT_GUIDS = {
  providerGUID: '79ec29fe-c315-4982-845a-0005baefb5a8',
  locationGUID: '1070d281-0952-4f01-9a6e-1a2e6926a7db',
  appointmentTypeGUID: '8fc9d063-ae46-4975-a5ae-734c6efe341a',
  scheduleViewGUID: '2544683a-8e79-4b32-a4d4-bf851996bac3',
  scheduleColumnGUID: 'e062b81f-1fff-40fc-b4a4-1cf9ecc2f32b',
};

// Fallback configurations
const FALLBACK_CONFIGS: Record<Environment, EnvironmentConfig> = {
  production: {
    name: 'production',
    displayName: 'Production',
    flowiseEndpoint: undefined,  // Must be loaded from DB
    noderedBase: NODERED_BASE,
    noderedAuth: NODERED_AUTH,
    cloud9Endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    cloud9Credentials: CLOUD9_PRODUCTION,
    defaults: DEFAULT_GUIDS,
  },
  sandbox_a: {
    name: 'sandbox_a',
    displayName: 'Sandbox A',
    flowiseEndpoint: undefined,  // Loaded from ab_sandboxes
    noderedBase: NODERED_BASE,
    noderedAuth: NODERED_AUTH,
    cloud9Endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    cloud9Credentials: CLOUD9_SANDBOX,
    defaults: DEFAULT_GUIDS,
  },
  sandbox_b: {
    name: 'sandbox_b',
    displayName: 'Sandbox B',
    flowiseEndpoint: undefined,  // Loaded from ab_sandboxes
    noderedBase: NODERED_BASE,
    noderedAuth: NODERED_AUTH,
    cloud9Endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    cloud9Credentials: CLOUD9_SANDBOX,
    defaults: DEFAULT_GUIDS,
  },
};

// ============================================================================
// DATABASE ACCESS
// ============================================================================

function getDbPath(): string {
  return path.resolve(__dirname, '../../data/test-results.db');
}

function openDb(): BetterSqlite3.Database | null {
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    console.warn(`[ConfigLoader] Database not found at ${dbPath}`);
    return null;
  }

  try {
    return new BetterSqlite3(dbPath, { readonly: true });
  } catch (error: any) {
    console.warn(`[ConfigLoader] Failed to open database: ${error.message}`);
    return null;
  }
}

// ============================================================================
// CONFIG LOADING FUNCTIONS
// ============================================================================

/**
 * Load configuration for a specific environment
 */
export function loadEnvironmentConfig(env: Environment): EnvironmentConfig {
  const db = openDb();

  if (!db) {
    console.warn(`[ConfigLoader] Using fallback config for ${env}`);
    return { ...FALLBACK_CONFIGS[env] };
  }

  try {
    const config = { ...FALLBACK_CONFIGS[env] };

    if (env === 'production') {
      // Load production Flowise endpoint from flowise_configs
      const defaultFlowise = db.prepare(`
        SELECT url, api_key FROM flowise_configs WHERE is_default = 1
      `).get() as { url: string; api_key: string } | undefined;

      if (defaultFlowise) {
        config.flowiseEndpoint = defaultFlowise.url;
        config.flowiseApiKey = defaultFlowise.api_key || undefined;
      }
    } else {
      // Load sandbox Flowise endpoint from ab_sandboxes
      const sandbox = db.prepare(`
        SELECT flowise_endpoint, flowise_api_key
        FROM ab_sandboxes
        WHERE sandbox_id = ?
      `).get(env) as { flowise_endpoint: string; flowise_api_key: string } | undefined;

      if (sandbox) {
        config.flowiseEndpoint = sandbox.flowise_endpoint || undefined;
        config.flowiseApiKey = sandbox.flowise_api_key || undefined;
      }
    }

    db.close();
    return config;
  } catch (error: any) {
    console.warn(`[ConfigLoader] Error loading config for ${env}: ${error.message}`);
    db.close();
    return { ...FALLBACK_CONFIGS[env] };
  }
}

/**
 * Load sandbox file content (scheduling_tool, patient_tool, system_prompt, nodered_flow)
 */
export function loadSandboxFile(sandboxId: string, fileKey: string): string | null {
  const db = openDb();
  if (!db) return null;

  try {
    const file = db.prepare(`
      SELECT content FROM ab_sandbox_files
      WHERE sandbox_id = ? AND file_key = ?
    `).get(sandboxId, fileKey) as { content: string } | undefined;

    db.close();
    return file?.content || null;
  } catch (error: any) {
    console.warn(`[ConfigLoader] Error loading sandbox file ${sandboxId}/${fileKey}: ${error.message}`);
    db.close();
    return null;
  }
}

/**
 * List all available environments with their status
 */
export function listEnvironments(): { name: Environment; displayName: string; hasFlowiseEndpoint: boolean }[] {
  const envs: { name: Environment; displayName: string; hasFlowiseEndpoint: boolean }[] = [];

  for (const env of ['production', 'sandbox_a', 'sandbox_b'] as Environment[]) {
    const config = loadEnvironmentConfig(env);
    envs.push({
      name: env,
      displayName: config.displayName,
      hasFlowiseEndpoint: !!config.flowiseEndpoint,
    });
  }

  return envs;
}

/**
 * Get environment preset by name (for resolution from environment_presets table)
 */
export function getEnvironmentPresetByName(presetName: string): {
  flowiseConfigId?: number;
  langfuseConfigId?: number;
  environment?: Environment;
} | null {
  const db = openDb();
  if (!db) return null;

  try {
    const preset = db.prepare(`
      SELECT flowise_config_id, langfuse_config_id, name
      FROM environment_presets
      WHERE name = ?
    `).get(presetName) as { flowise_config_id: number | null; langfuse_config_id: number | null; name: string } | undefined;

    db.close();

    if (!preset) return null;

    // Map preset name to environment
    let environment: Environment | undefined;
    const lowerName = preset.name.toLowerCase();
    if (lowerName.includes('sandbox a') || lowerName === 'sandbox_a') {
      environment = 'sandbox_a';
    } else if (lowerName.includes('sandbox b') || lowerName === 'sandbox_b') {
      environment = 'sandbox_b';
    } else if (lowerName.includes('prod') || lowerName === 'production') {
      environment = 'production';
    }

    return {
      flowiseConfigId: preset.flowise_config_id || undefined,
      langfuseConfigId: preset.langfuse_config_id || undefined,
      environment,
    };
  } catch (error: any) {
    console.warn(`[ConfigLoader] Error getting preset ${presetName}: ${error.message}`);
    db.close();
    return null;
  }
}

/**
 * Get Flowise config by ID
 */
export function getFlowiseConfigById(configId: number): { url: string; apiKey?: string; name: string } | null {
  const db = openDb();
  if (!db) return null;

  try {
    const config = db.prepare(`
      SELECT name, url, api_key FROM flowise_configs WHERE id = ?
    `).get(configId) as { name: string; url: string; api_key: string | null } | undefined;

    db.close();

    if (!config) return null;

    return {
      name: config.name,
      url: config.url,
      apiKey: config.api_key || undefined,
    };
  } catch (error: any) {
    console.warn(`[ConfigLoader] Error getting Flowise config ${configId}: ${error.message}`);
    db.close();
    return null;
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  CLOUD9_SANDBOX,
  CLOUD9_PRODUCTION,
  NODERED_BASE,
  NODERED_AUTH,
  DEFAULT_GUIDS,
  FALLBACK_CONFIGS,
};

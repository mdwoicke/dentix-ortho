/**
 * Tool Harness Service - VM-based execution of actual Flowise tool JavaScript
 *
 * Executes the real tool JS code (patient_tool_func.js, scheduling_tool_func.js)
 * in a sandboxed Node.js VM context — identical to how Flowise runs them.
 * Supports loading code from production files or A/B sandbox variants.
 *
 * Key features:
 * - Loads tool code from filesystem (production/tenant) or database (A/B sandbox)
 * - Builds VM context replicating Flowise runtime ($action, $vars, $flow, etc.)
 * - Instruments fetch to capture all HTTP calls (debugCalls[])
 * - Instruments console to capture all log output (preCallLogs[])
 * - Executes via vm.Script with async wrapper
 */

import vm from 'vm';
import fs from 'fs';
import path from 'path';
import BetterSqlite3 from 'better-sqlite3';

// ============================================================================
// TYPES
// ============================================================================

export interface DebugCall {
  id: number;
  endpoint: string;
  method: string;
  requestBody: unknown;
  status: number | null;
  durationMs: number | null;
  response: unknown;
  error: string | null;
  startTime: string;
}

export interface HarnessRequest {
  toolName: string;
  action: string;
  input: Record<string, unknown>;
  variant?: 'production' | 'sandbox_a' | 'sandbox_b';
  tenantId?: number;
  varsConfig?: {
    $vars?: { c1mg_uui?: string; sessionId?: string; chatId?: string; apiEndPointURL?: string };
    $flow?: { sessionId?: string; chatId?: string; chatflowId?: string; input?: string; state?: Record<string, unknown> };
  };
  observationId?: string;
  dryRun?: boolean;
}

export interface HarnessResponse {
  success: boolean;
  data?: {
    response: unknown;
    durationMs: number;
    endpoint: string;
    statusCode: number;
    timestamp: string;
    toolVersion?: string;
    preCallLogs: string[];
    debugCalls: DebugCall[];
    variant: string;
  };
  error?: string;
}

export interface VariantInfo {
  variant: string;
  toolType: string;
  version: string | null;
  lastUpdated: string | null;
  tenantId: number;
  source: 'filesystem' | 'database';
}

export interface CompareResponse {
  success: boolean;
  results: {
    variant: string;
    response: HarnessResponse;
  }[];
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const DOCS_V1_DIR = path.join(PROJECT_ROOT, 'docs/v1');
const CHORD_V1_DIR = path.join(PROJECT_ROOT, 'tenants/chord/v1');
const TEST_AGENT_DB_PATH = path.resolve(__dirname, '../../../test-agent/data/test-results.db');

// Default Flowise context values
const DEFAULT_UUI = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';
const CHORD_DEFAULT_UUI = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|77523|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';
const BASE_API_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

// Tool name → file type mapping
const TOOL_FILE_MAP: Record<string, { fileType: string; tenantId: number }> = {
  chord_ortho_patient: { fileType: 'patient_tool', tenantId: 1 },
  schedule_appointment_ortho: { fileType: 'scheduling_tool', tenantId: 1 },
  chord_patient_v07_stage: { fileType: 'chord_patient_tool', tenantId: 5 },
  chord_scheduling_v08: { fileType: 'scheduling_tool', tenantId: 5 },
};

// File type → production filesystem path mapping
const PRODUCTION_FILE_PATHS: Record<string, string> = {
  patient_tool: path.join(DOCS_V1_DIR, 'patient_tool_func.js'),
  scheduling_tool: path.join(DOCS_V1_DIR, 'scheduling_tool_func.js'),
  chord_patient_tool: path.join(CHORD_V1_DIR, 'patient_tool_func.js'),
  chord_scheduling_tool: path.join(CHORD_V1_DIR, 'scheduling_tool_func.js'),
};

// DB file types for sandbox lookup (sandbox stores Ortho tools as patient_tool/scheduling_tool)
const DB_FILE_TYPE_MAP: Record<string, string> = {
  patient_tool: 'patient_tool',
  scheduling_tool: 'scheduling_tool',
  chord_patient_tool: 'chord_patient_tool',
  chord_scheduling_tool: 'chord_scheduling_tool',
};

// ============================================================================
// LOAD TOOL CODE
// ============================================================================

/**
 * Load tool code from the appropriate source based on variant
 */
export function loadToolCode(
  toolName: string,
  variant: 'production' | 'sandbox_a' | 'sandbox_b' = 'production'
): { code: string; source: string; fileType: string } {
  const mapping = TOOL_FILE_MAP[toolName];
  if (!mapping) {
    throw new Error(`Unknown tool name: ${toolName}. Known tools: ${Object.keys(TOOL_FILE_MAP).join(', ')}`);
  }

  const { fileType } = mapping;

  if (variant === 'production') {
    // Load from filesystem
    const filePath = PRODUCTION_FILE_PATHS[fileType];
    if (!filePath) {
      throw new Error(`No production file path mapped for fileType: ${fileType}`);
    }
    if (!fs.existsSync(filePath)) {
      throw new Error(`Production file not found: ${filePath}`);
    }
    const code = fs.readFileSync(filePath, 'utf-8');
    return { code, source: filePath, fileType };
  }

  // Load from database (sandbox_a or sandbox_b)
  // ab_sandbox_files uses: sandbox_id (e.g., 'sandbox_a'), file_key (e.g., 'patient_tool')
  const dbFileKey = DB_FILE_TYPE_MAP[fileType] || fileType;
  const sandboxId = variant; // 'sandbox_a' or 'sandbox_b'

  if (!fs.existsSync(TEST_AGENT_DB_PATH)) {
    throw new Error(`Test agent database not found: ${TEST_AGENT_DB_PATH}`);
  }

  const db = new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: true });
  try {
    const row = db.prepare(
      'SELECT content, version, updated_at FROM ab_sandbox_files WHERE file_key = ? AND sandbox_id = ? ORDER BY id DESC LIMIT 1'
    ).get(dbFileKey, sandboxId) as { content: string; version: number; updated_at: string } | undefined;

    if (!row || !row.content) {
      throw new Error(`No sandbox file found for file_key=${dbFileKey}, sandbox_id=${sandboxId}`);
    }

    return {
      code: row.content,
      source: `database:ab_sandbox_files[${dbFileKey}/${sandboxId}]`,
      fileType,
    };
  } finally {
    db.close();
  }
}

// ============================================================================
// INSTRUMENTED FETCH
// ============================================================================

/**
 * Create an instrumented fetch function that logs all HTTP calls
 */
function createInstrumentedFetch(debugCalls: DebugCall[], dryRun: boolean = false) {
  // Import node-fetch at runtime
  const realFetch = require('node-fetch');

  return async function instrumentedFetch(url: string, options: any = {}) {
    const callId = debugCalls.length + 1;
    const startTime = Date.now();
    const callInfo: DebugCall = {
      id: callId,
      endpoint: url,
      method: (options.method || 'GET').toUpperCase(),
      requestBody: options.body ? (() => { try { return JSON.parse(options.body); } catch { return options.body; } })() : null,
      status: null,
      durationMs: null,
      response: null,
      error: null,
      startTime: new Date().toISOString(),
    };

    if (dryRun) {
      callInfo.status = 0;
      callInfo.durationMs = 0;
      callInfo.response = { _dryRun: true, message: 'HTTP call intercepted (dry run mode)' };
      debugCalls.push(callInfo);
      // Return a mock response
      return {
        ok: true,
        status: 200,
        statusText: 'OK (dry run)',
        headers: new Map(),
        text: async () => JSON.stringify({ _dryRun: true }),
        json: async () => ({ _dryRun: true }),
      };
    }

    try {
      const response = await realFetch(url, options);
      const responseText = await response.text();
      let responseData: unknown;
      try { responseData = JSON.parse(responseText); } catch { responseData = responseText; }

      callInfo.durationMs = Date.now() - startTime;
      callInfo.status = response.status;
      callInfo.response = responseData;
      debugCalls.push(callInfo);

      // Return a mock response object mimicking fetch (like the tool's trackedFetch)
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
        text: async () => responseText,
        json: async () => responseData,
      };
    } catch (error: any) {
      callInfo.durationMs = Date.now() - startTime;
      callInfo.error = error.message || String(error);
      debugCalls.push(callInfo);
      throw error;
    }
  };
}

// ============================================================================
// VM CONTEXT BUILDER
// ============================================================================

/**
 * Build the VM context that replicates Flowise's runtime environment
 */
function buildVMContext(
  request: HarnessRequest,
  debugCalls: DebugCall[],
  preCallLogs: string[]
): vm.Context {
  const { action, input, varsConfig, dryRun } = request;

  // Determine tenant-specific defaults
  const mapping = TOOL_FILE_MAP[request.toolName];
  const tenantId = request.tenantId || mapping?.tenantId || 1;
  const isChord = tenantId === 5;
  const defaultUui = isChord ? CHORD_DEFAULT_UUI : DEFAULT_UUI;

  // Create instrumented fetch
  const instrumentedFetch = createInstrumentedFetch(debugCalls, dryRun);

  // Create instrumented console
  const instrumentedConsole = {
    log: (...args: unknown[]) => {
      preCallLogs.push(args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    },
    warn: (...args: unknown[]) => {
      preCallLogs.push('[WARN] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    },
    error: (...args: unknown[]) => {
      preCallLogs.push('[ERROR] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    },
    info: (...args: unknown[]) => {
      preCallLogs.push('[INFO] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    },
    debug: (...args: unknown[]) => {
      preCallLogs.push('[DEBUG] ' + args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' '));
    },
  };

  // Custom require that returns instrumented fetch for 'node-fetch'
  const customRequire = (moduleName: string) => {
    if (moduleName === 'node-fetch') {
      return instrumentedFetch;
    }
    // Allow other safe requires
    throw new Error(`Module not available in harness: ${moduleName}`);
  };

  // Build the sandbox context
  const sandbox: Record<string, unknown> = {
    // Node.js globals
    require: customRequire,
    console: instrumentedConsole,
    Buffer,
    setTimeout,
    clearTimeout,
    Date,
    JSON,
    Math,
    parseInt,
    parseFloat,
    isNaN,
    isFinite,
    encodeURIComponent,
    decodeURIComponent,
    encodeURI,
    decodeURI,
    Error,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    Promise,
    AbortController: typeof AbortController !== 'undefined' ? AbortController : undefined,

    // Flowise $action variable
    $action: action,

    // Flowise $vars context
    $vars: {
      c1mg_uui: varsConfig?.$vars?.c1mg_uui || defaultUui,
      apiEndPointURL: varsConfig?.$vars?.apiEndPointURL || BASE_API_URL,
      sessionId: varsConfig?.$vars?.sessionId || 'harness-session-' + Date.now(),
      chatId: varsConfig?.$vars?.chatId || 'harness-chat-' + Date.now(),
    },

    // Flowise $flow context
    $flow: {
      sessionId: varsConfig?.$flow?.sessionId || 'harness-flow-' + Date.now(),
      chatId: varsConfig?.$flow?.chatId || 'harness-chat-' + Date.now(),
      chatflowId: varsConfig?.$flow?.chatflowId || 'harness-chatflow',
      input: varsConfig?.$flow?.input || '',
      state: varsConfig?.$flow?.state || {},
    },
  };

  // Inject all input parameters as $-prefixed globals
  // The tool reads: typeof $phoneNumber !== 'undefined' ? $phoneNumber : null
  // Unset variables return typeof === 'undefined' naturally
  for (const [key, value] of Object.entries(input)) {
    sandbox[`$${key}`] = value;
  }

  return vm.createContext(sandbox);
}

// ============================================================================
// EXTRACT TOOL VERSION
// ============================================================================

function extractToolVersion(code: string): string | null {
  // Match patterns like: const TOOL_VERSION = 'v14';
  // or: * Version: v92 | Updated: ...
  const constMatch = code.match(/(?:const|let|var)\s+TOOL_VERSION\s*=\s*['"]([^'"]+)['"]/);
  if (constMatch) return constMatch[1];

  const commentMatch = code.match(/\*\s*Version:\s*(v\d+)/);
  if (commentMatch) return commentMatch[1];

  return null;
}

// ============================================================================
// MAIN EXECUTION
// ============================================================================

/**
 * Execute tool code in the VM harness
 */
export async function executeInHarness(request: HarnessRequest): Promise<HarnessResponse> {
  const variant = request.variant || 'production';
  const startTime = Date.now();
  const debugCalls: DebugCall[] = [];
  const preCallLogs: string[] = [];

  let code: string;
  let source: string;

  try {
    const loaded = loadToolCode(request.toolName, variant);
    code = loaded.code;
    source = loaded.source;
  } catch (error: any) {
    return {
      success: false,
      error: `Failed to load tool code: ${error.message}`,
    };
  }

  const toolVersion = extractToolVersion(code);

  // Build VM context
  const context = buildVMContext(request, debugCalls, preCallLogs);

  // Wrap the tool code in an async IIFE and execute
  const wrappedCode = `(async function() {\n${code}\n})()`;

  let script: vm.Script;
  try {
    script = new vm.Script(wrappedCode, {
      filename: `harness://${request.toolName}/${variant}`,
    });
  } catch (error: any) {
    return {
      success: false,
      error: `Syntax error in tool code: ${error.message}`,
      data: {
        response: null,
        durationMs: Date.now() - startTime,
        endpoint: source,
        statusCode: 0,
        timestamp: new Date().toISOString(),
        toolVersion: toolVersion || undefined,
        preCallLogs,
        debugCalls,
        variant,
      },
    };
  }

  try {
    const resultPromise = script.runInContext(context, {
      timeout: 30000, // 30 second timeout
    });

    const rawResult = await resultPromise;

    // Parse result - tool code returns a JSON string
    let parsedResponse: unknown;
    if (typeof rawResult === 'string') {
      try {
        parsedResponse = JSON.parse(rawResult);
      } catch {
        parsedResponse = rawResult;
      }
    } else {
      parsedResponse = rawResult;
    }

    // Determine last HTTP call info
    const lastCall = debugCalls.length > 0 ? debugCalls[debugCalls.length - 1] : null;
    const endpoint = lastCall?.endpoint || source;
    const statusCode = lastCall?.status || 200;

    return {
      success: true,
      data: {
        response: parsedResponse,
        durationMs: Date.now() - startTime,
        endpoint,
        statusCode,
        timestamp: new Date().toISOString(),
        toolVersion: toolVersion || undefined,
        preCallLogs,
        debugCalls,
        variant,
      },
    };
  } catch (error: any) {
    // Runtime error - return partial data captured before the error
    const lastCall = debugCalls.length > 0 ? debugCalls[debugCalls.length - 1] : null;

    return {
      success: false,
      error: `Runtime error: ${error.message}`,
      data: {
        response: null,
        durationMs: Date.now() - startTime,
        endpoint: lastCall?.endpoint || source,
        statusCode: lastCall?.status || 0,
        timestamp: new Date().toISOString(),
        toolVersion: toolVersion || undefined,
        preCallLogs,
        debugCalls,
        variant,
      },
    };
  }
}

// ============================================================================
// VARIANTS LISTING
// ============================================================================

/**
 * Get all available tool variants with metadata
 */
export function getAvailableVariants(tenantId?: number): VariantInfo[] {
  const variants: VariantInfo[] = [];

  // Production filesystem variants
  for (const [, mapping] of Object.entries(TOOL_FILE_MAP)) {
    if (tenantId && mapping.tenantId !== tenantId) continue;

    const filePath = PRODUCTION_FILE_PATHS[mapping.fileType];
    if (!filePath) continue;

    let version: string | null = null;
    let lastUpdated: string | null = null;

    if (fs.existsSync(filePath)) {
      try {
        const code = fs.readFileSync(filePath, 'utf-8');
        version = extractToolVersion(code);
        const stats = fs.statSync(filePath);
        lastUpdated = stats.mtime.toISOString();
      } catch { /* ignore read errors */ }
    }

    variants.push({
      variant: 'production',
      toolType: mapping.fileType,
      version,
      lastUpdated,
      tenantId: mapping.tenantId,
      source: 'filesystem',
    });
  }

  // Sandbox variants from database
  // Only include tool files (patient_tool, scheduling_tool, chord_*_tool), skip prompts/flows
  const toolFileKeys = ['patient_tool', 'scheduling_tool', 'chord_patient_tool', 'chord_scheduling_tool'];

  if (fs.existsSync(TEST_AGENT_DB_PATH)) {
    const db = new BetterSqlite3(TEST_AGENT_DB_PATH, { readonly: true });
    try {
      const rows = db.prepare(
        `SELECT sandbox_id, file_key, version, updated_at, content FROM ab_sandbox_files
         WHERE file_key IN (${toolFileKeys.map(() => '?').join(',')})
         ORDER BY id DESC`
      ).all(...toolFileKeys) as Array<{ sandbox_id: string; file_key: string; version: number; updated_at: string; content: string }>;

      // Deduplicate: keep the latest row per (sandbox_id, file_key) pair
      const seen = new Set<string>();
      for (const row of rows) {
        const key = `${row.sandbox_id}:${row.file_key}`;
        if (seen.has(key)) continue;
        seen.add(key);

        if (tenantId) {
          const isChordFile = row.file_key.startsWith('chord_');
          if (tenantId === 1 && isChordFile) continue;
          if (tenantId === 5 && !isChordFile) continue;
        }

        let version: string | null = null;
        if (row.content) {
          version = extractToolVersion(row.content);
        }

        variants.push({
          variant: row.sandbox_id,
          toolType: row.file_key,
          version: version || `db-v${row.version}`,
          lastUpdated: row.updated_at,
          tenantId: row.file_key.startsWith('chord_') ? 5 : 1,
          source: 'database',
        });
      }
    } finally {
      db.close();
    }
  }

  return variants;
}

// ============================================================================
// SYNTAX VALIDATION
// ============================================================================

/**
 * Validate tool code syntax without executing
 */
export function validateToolCode(
  toolName: string,
  variant: 'production' | 'sandbox_a' | 'sandbox_b' = 'production'
): { valid: boolean; error?: string; toolVersion?: string; lineCount?: number } {
  let code: string;
  try {
    const loaded = loadToolCode(toolName, variant);
    code = loaded.code;
  } catch (error: any) {
    return { valid: false, error: `Failed to load: ${error.message}` };
  }

  const toolVersion = extractToolVersion(code);
  const lineCount = code.split('\n').length;

  // Wrap in async function like execution would
  const wrappedCode = `(async function() {\n${code}\n})()`;

  try {
    new vm.Script(wrappedCode, {
      filename: `validate://${toolName}/${variant}`,
    });
    return { valid: true, toolVersion: toolVersion || undefined, lineCount };
  } catch (error: any) {
    return {
      valid: false,
      error: `Syntax error: ${error.message}`,
      toolVersion: toolVersion || undefined,
      lineCount,
    };
  }
}

// ============================================================================
// COMPARE VARIANTS
// ============================================================================

/**
 * Run the same input through two variants and return both results
 */
export async function compareVariants(
  request: HarnessRequest,
  variantA: 'production' | 'sandbox_a' | 'sandbox_b',
  variantB: 'production' | 'sandbox_a' | 'sandbox_b'
): Promise<CompareResponse> {
  const [resultA, resultB] = await Promise.all([
    executeInHarness({ ...request, variant: variantA }),
    executeInHarness({ ...request, variant: variantB }),
  ]);

  return {
    success: true,
    results: [
      { variant: variantA, response: resultA },
      { variant: variantB, response: resultB },
    ],
  };
}

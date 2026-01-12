/**
 * LLM Configuration
 * Shared configuration for LLM services across backend and test-agent
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Load environment variables
dotenv.config();

// ============================================================================
// Types
// ============================================================================

export interface LLMConfig {
  useClaudeCli: boolean;
  strictCliMode: boolean;  // When true, don't fallback to API if CLI unavailable
  apiKey?: string;
  defaultModel: string;
  timeout: number;
}

interface ClaudeCredentials {
  claudeAiOauth?: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    subscriptionType: string;
    rateLimitTier: string;
  };
}

// ============================================================================
// Credentials Cache
// ============================================================================

let cachedCredentials: ClaudeCredentials | null = null;
let credentialsCacheTime: number = 0;
const CREDENTIALS_CACHE_TTL = 60000; // 1 minute cache

/**
 * Get the path to Claude credentials file
 */
function getCredentialsPath(): string {
  // Check for custom path in environment
  if (process.env.CLAUDE_CREDENTIALS_PATH) {
    return process.env.CLAUDE_CREDENTIALS_PATH;
  }
  // Default: ~/.claude/.credentials.json
  return path.join(os.homedir(), '.claude', '.credentials.json');
}

/**
 * Load Claude credentials from the credentials file
 * Caches the result for 1 minute to avoid excessive file reads
 */
function loadClaudeCredentials(): ClaudeCredentials | null {
  // Return cached if fresh
  if (cachedCredentials && Date.now() - credentialsCacheTime < CREDENTIALS_CACHE_TTL) {
    return cachedCredentials;
  }

  const credentialsPath = getCredentialsPath();

  try {
    if (!fs.existsSync(credentialsPath)) {
      console.log(`[LLMConfig] Credentials file not found: ${credentialsPath}`);
      return null;
    }

    const content = fs.readFileSync(credentialsPath, 'utf8');
    cachedCredentials = JSON.parse(content) as ClaudeCredentials;
    credentialsCacheTime = Date.now();

    // Check if token is expired
    if (cachedCredentials.claudeAiOauth) {
      const expiresAt = cachedCredentials.claudeAiOauth.expiresAt;
      if (expiresAt && Date.now() > expiresAt) {
        console.warn('[LLMConfig] OAuth token is expired');
      }
    }

    return cachedCredentials;
  } catch (error: any) {
    console.error(`[LLMConfig] Failed to load credentials: ${error.message}`);
    return null;
  }
}

/**
 * Get the OAuth access token from Claude credentials file
 */
export function getOAuthToken(): string | undefined {
  const credentials = loadClaudeCredentials();
  return credentials?.claudeAiOauth?.accessToken;
}

/**
 * Clear the credentials cache (useful for testing or after token refresh)
 */
export function clearCredentialsCache(): void {
  cachedCredentials = null;
  credentialsCacheTime = 0;
}

// ============================================================================
// Configuration Functions
// ============================================================================

/**
 * Check if Replit mode is enabled
 * When enabled, automatically disables CLI mode and uses API-only
 */
export function isReplitMode(): boolean {
  return process.env.REPLIT_MODE === 'true';
}

/**
 * Check if Claude CLI mode is enabled
 * Note: REPLIT_MODE=true automatically disables CLI mode
 */
export function isClaudeCliEnabled(): boolean {
  // REPLIT_MODE automatically disables CLI (CLI not available on Replit)
  if (isReplitMode()) {
    return false;
  }
  return process.env.USE_CLAUDE_CLI === 'true';
}

/**
 * Check if strict CLI mode is enabled
 * When enabled, will NOT fall back to API if CLI is unavailable
 * Set STRICT_CLI_MODE=true to enable
 */
export function isStrictCliMode(): boolean {
  return process.env.STRICT_CLI_MODE === 'true';
}

/**
 * Get the full LLM configuration
 */
export function getLLMConfig(): LLMConfig {
  // Log Replit mode on first config access
  if (isReplitMode()) {
    console.log('[LLMConfig] Replit mode enabled - using API-only mode');
  }

  return {
    useClaudeCli: isClaudeCliEnabled(), // Respects REPLIT_MODE
    strictCliMode: isStrictCliMode(),   // Don't fallback to API
    apiKey: getApiKey(),
    defaultModel: 'claude-sonnet-4-20250514',
    timeout: 120000, // 2 minutes
  };
}

/**
 * Get the API key/token for LLM access
 * Priority:
 * 1. ANTHROPIC_API_KEY env var (direct API key)
 * 2. OAuth token from ~/.claude/.credentials.json
 * 3. CLAUDE_CODE_OAUTH_TOKEN env var (legacy fallback)
 */
export function getApiKey(): string | undefined {
  // Direct API key takes priority (works with Anthropic SDK)
  if (process.env.ANTHROPIC_API_KEY) {
    return process.env.ANTHROPIC_API_KEY;
  }

  // Try to load OAuth token from credentials file
  const oauthToken = getOAuthToken();
  if (oauthToken) {
    return oauthToken;
  }

  // Legacy fallback to env var
  return process.env.CLAUDE_CODE_OAUTH_TOKEN;
}

/**
 * Check if any LLM provider is available (CLI or API)
 */
export function hasLLMProvider(): boolean {
  if (isClaudeCliEnabled()) {
    // CLI mode - will check availability at runtime
    return true;
  }
  // API mode - check for API key
  return !!getApiKey();
}

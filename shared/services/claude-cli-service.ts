/**
 * Claude CLI Service
 * Wraps the Claude CLI as a subprocess for LLM operations
 * Uses async spawn to avoid blocking the Node.js event loop
 */

import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ============================================================================
// Types
// ============================================================================

export interface ClaudeCliRequest {
  prompt: string;
  model?: string;  // 'sonnet', 'opus', 'haiku' or full model name
  systemPrompt?: string;
  timeout?: number;
}

export interface ClaudeCliResponse {
  success: boolean;
  result?: string;
  error?: string;
  durationMs?: number;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    costUsd: number;
  };
}

export interface ClaudeCliStatus {
  installed: boolean;
  authenticated: boolean;
  version?: string;
  error?: string;
}

// ============================================================================
// Claude CLI Service
// ============================================================================

export class ClaudeCliService {
  private static instance: ClaudeCliService;
  private statusCache: ClaudeCliStatus | null = null;
  private statusCacheTime: number = 0;
  private readonly STATUS_CACHE_TTL = 600000; // 10 minutes (prevent mid-diagnosis fallbacks)

  static getInstance(): ClaudeCliService {
    if (!ClaudeCliService.instance) {
      ClaudeCliService.instance = new ClaudeCliService();
    }
    return ClaudeCliService.instance;
  }

  /**
   * Check if Claude CLI is installed and authenticated
   * Note: We only verify CLI installation and credentials file exists
   * We don't make an actual API call during auth check, as that would fail
   * if the user has low credits, even though CLI itself is working fine.
   */
  async checkStatus(): Promise<ClaudeCliStatus> {
    // Return cached status if fresh
    if (this.statusCache && Date.now() - this.statusCacheTime < this.STATUS_CACHE_TTL) {
      return this.statusCache;
    }

    try {
      // Check if CLI is installed by running --version
      const versionResult = await this.runCommand(['--version'], 10000);
      if (!versionResult.success) {
        this.statusCache = {
          installed: false,
          authenticated: false,
          error: 'Claude CLI not installed or not in PATH',
        };
        this.statusCacheTime = Date.now();
        return this.statusCache;
      }

      // Check if credentials file exists (indicates CLI is authenticated)
      // This avoids making an actual API call which could fail due to low credits
      const credentialsPath = path.join(os.homedir(), '.claude', '.credentials.json');
      const hasCredentials = fs.existsSync(credentialsPath);

      if (hasCredentials) {
        // Verify credentials file has valid OAuth token
        try {
          const credContent = fs.readFileSync(credentialsPath, 'utf8');
          const creds = JSON.parse(credContent);
          const hasOAuthToken = !!(creds.claudeAiOauth?.accessToken);

          if (hasOAuthToken) {
            console.log('[ClaudeCLI] Credentials found with OAuth token - assuming authenticated');
            this.statusCache = {
              installed: true,
              authenticated: true,
              version: versionResult.result?.trim(),
            };
            this.statusCacheTime = Date.now();
            return this.statusCache;
          }
        } catch (parseError) {
          console.warn('[ClaudeCLI] Could not parse credentials file:', parseError);
        }
      }

      // No credentials file or no OAuth token - CLI is not authenticated
      console.log('[ClaudeCLI] No valid credentials found');
      this.statusCache = {
        installed: true,
        authenticated: false,
        version: versionResult.result?.trim(),
        error: 'Claude CLI not authenticated - run "claude login" to authenticate',
      };
      this.statusCacheTime = Date.now();
      return this.statusCache;

    } catch (error: any) {
      this.statusCache = {
        installed: false,
        authenticated: false,
        error: error.message,
      };
      this.statusCacheTime = Date.now();
      return this.statusCache;
    }
  }

  /**
   * Clear the status cache to force a fresh check
   */
  clearStatusCache(): void {
    this.statusCache = null;
    this.statusCacheTime = 0;
  }

  /**
   * Execute a prompt via Claude CLI
   */
  async execute(request: ClaudeCliRequest): Promise<ClaudeCliResponse> {
    const startTime = Date.now();
    const buildResult = this.buildArgs(request);
    const { args, tempFile } = buildResult;
    const usePipe = 'usePipe' in buildResult && buildResult.usePipe;
    const timeout = request.timeout || 120000;

    // Helper to clean up temp file
    const cleanup = () => {
      if (tempFile) {
        try {
          fs.unlinkSync(tempFile);
        } catch {
          // Ignore cleanup errors
        }
      }
    };

    try {
      const result = await this.runCommand(args, timeout, usePipe ? tempFile : undefined);
      cleanup();
      const durationMs = Date.now() - startTime;

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'CLI execution failed',
          durationMs,
        };
      }

      // Try to parse JSON response from CLI
      try {
        const jsonResponse = JSON.parse(result.result || '{}');

        return {
          success: !jsonResponse.is_error,
          result: jsonResponse.result || result.result,
          durationMs: jsonResponse.duration_ms || durationMs,
          usage: jsonResponse.usage ? {
            inputTokens: jsonResponse.usage.input_tokens || 0,
            outputTokens: jsonResponse.usage.output_tokens || 0,
            costUsd: jsonResponse.total_cost_usd || 0,
          } : undefined,
          error: jsonResponse.is_error ? jsonResponse.result : undefined,
        };
      } catch {
        // If JSON parsing fails, return raw result
        return {
          success: true,
          result: result.result,
          durationMs,
        };
      }

    } catch (error: any) {
      cleanup();
      return {
        success: false,
        error: error.message,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Build CLI arguments from request
   * Returns args array and optional temp file path (caller must clean up)
   * Always uses temp file approach to avoid shell escaping issues on Windows
   */
  private buildArgs(request: ClaudeCliRequest): { args: string[]; tempFile?: string; usePipe?: boolean } {
    const args: string[] = [
      '--print',                    // Non-interactive mode
      '--output-format', 'json',    // JSON output for parsing
    ];

    // Add model if specified
    if (request.model) {
      args.push('--model', this.mapModelName(request.model));
    }

    // Add system prompt if specified
    if (request.systemPrompt) {
      args.push('--system-prompt', request.systemPrompt);
    }

    // Always use temp file approach to avoid shell escaping issues
    // This is more reliable on Windows where shell escaping is complex
    const tempFile = path.join(os.tmpdir(), `claude-prompt-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`);
    fs.writeFileSync(tempFile, request.prompt, 'utf8');
    // Don't add -p flag - prompt will be piped via stdin from temp file
    return { args, tempFile, usePipe: true };
  }

  /**
   * Map full model names to CLI aliases
   */
  private mapModelName(model: string): string {
    const modelMap: Record<string, string> = {
      'claude-opus-4-5-20251101': 'opus',
      'claude-sonnet-4-5-20250929': 'sonnet',
      'claude-sonnet-4-20250514': 'sonnet',
      'claude-haiku-4-5-20251001': 'haiku',
    };
    return modelMap[model] || model;
  }

  /**
   * Run a CLI command and return the result
   * Uses async spawn to avoid blocking the Node.js event loop
   */
  private runCommand(
    args: string[],
    timeout: number = 30000,
    pipeFromFile?: string // Optional file path to pipe content from via stdin
  ): Promise<{ success: boolean; result?: string; error?: string }> {
    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout | null = null;
      let resolved = false;

      // Helper to resolve only once
      const safeResolve = (result: { success: boolean; result?: string; error?: string }) => {
        if (resolved) return;
        resolved = true;
        if (timeoutId) clearTimeout(timeoutId);
        resolve(result);
      };

      try {
        // Use shell: true on all platforms for PATH resolution and proper stdin forwarding
        // This is more reliable than manually invoking cmd.exe on Windows
        const proc = spawn('claude', args, {
          env: { ...process.env },
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });

        // If we have a file to pipe, read and write to stdin
        if (pipeFromFile) {
          try {
            const content = fs.readFileSync(pipeFromFile, 'utf8');
            if (proc.stdin) {
              proc.stdin.write(content);
              proc.stdin.end();
            }
          } catch (readError: any) {
            safeResolve({ success: false, error: `Failed to read pipe file: ${readError.message}` });
            proc.kill();
            return;
          }
        }

        // Set timeout
        timeoutId = setTimeout(() => {
          proc.kill('SIGTERM');
          // Give it a moment to terminate gracefully, then force kill
          setTimeout(() => {
            if (!resolved) {
              proc.kill('SIGKILL');
              safeResolve({ success: false, error: `Command timed out after ${timeout}ms` });
            }
          }, 1000);
        }, timeout);

        // Collect stdout
        proc.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString();
        });

        // Collect stderr
        proc.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString();
        });

        // Handle process errors (e.g., command not found)
        proc.on('error', (error: Error) => {
          safeResolve({ success: false, error: error.message });
        });

        // Handle process exit
        proc.on('close', (code: number | null, signal: string | null) => {
          if (resolved) return;

          if (signal) {
            // Process was killed by signal (likely our timeout)
            if (!resolved) {
              safeResolve({
                success: false,
                error: `Process killed by signal: ${signal}`,
                result: stdout.trim() || undefined,
              });
            }
          } else if (code === 0) {
            // Success
            safeResolve({ success: true, result: stdout.trim() });
          } else {
            // Non-zero exit code
            safeResolve({
              success: false,
              error: stderr.trim() || `Exit code: ${code}${stdout ? ` (stdout: ${stdout.substring(0, 200)})` : ''}`,
              result: stdout.trim() || undefined,
            });
          }
        });

      } catch (error: any) {
        safeResolve({ success: false, error: error.message });
      }
    });
  }
}

// Export singleton
export const claudeCliService = ClaudeCliService.getInstance();

/**
 * LLM Provider Abstraction
 * Strategy pattern to switch between Claude CLI and Anthropic API
 * Enhanced with Langfuse tracing for comprehensive observability
 */

import Anthropic from '@anthropic-ai/sdk';
import { claudeCliService, ClaudeCliRequest } from './claude-cli-service';
import { getLLMConfig, isClaudeCliEnabled, isStrictCliMode, getApiKey } from '../config/llm-config';
import { getLangfuseService } from './langfuse-service';
import { getCurrentTraceContext } from './langfuse-context';
import type { GenerationPurpose } from '../types/langfuse.types';

// ============================================================================
// Types
// ============================================================================

export interface LLMRequest {
  prompt: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  timeout?: number;
  /** Purpose of this LLM call - used for Langfuse tracing categorization */
  purpose?: GenerationPurpose;
  /** Additional metadata to include in Langfuse trace */
  metadata?: Record<string, any>;
}

export interface LLMResponse {
  success: boolean;
  content?: string;
  error?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  provider: 'api' | 'cli' | 'none';
  durationMs?: number;
}

export interface LLMProviderStatus {
  available: boolean;
  provider: 'api' | 'cli' | 'none';
  error?: string;
  cliStatus?: {
    installed: boolean;
    authenticated: boolean;
    version?: string;
  };
}

// ============================================================================
// LLM Provider
// ============================================================================

export class LLMProvider {
  private anthropicClient: Anthropic | null = null;
  private useCliMode: boolean;
  private strictCliMode: boolean;

  constructor() {
    this.useCliMode = isClaudeCliEnabled();
    this.strictCliMode = isStrictCliMode();

    if (!this.useCliMode) {
      this.initializeApiClient();
    }

    // Log strict mode if enabled
    if (this.useCliMode && this.strictCliMode) {
      console.log('[LLMProvider] Strict CLI mode enabled - will NOT fallback to API');
    }
  }

  /**
   * Initialize the Anthropic API client
   */
  private initializeApiClient(): void {
    const apiKey = getApiKey();
    if (apiKey) {
      this.anthropicClient = new Anthropic({ apiKey });
      console.log('[LLMProvider] Initialized with Anthropic API');
    } else {
      console.log('[LLMProvider] No API key found');
    }
  }

  /**
   * Check if LLM is available (either via CLI or API)
   */
  async checkAvailability(): Promise<LLMProviderStatus> {
    if (this.useCliMode) {
      const cliStatus = await claudeCliService.checkStatus();

      if (cliStatus.installed && cliStatus.authenticated) {
        return {
          available: true,
          provider: 'cli',
          cliStatus: {
            installed: cliStatus.installed,
            authenticated: cliStatus.authenticated,
            version: cliStatus.version,
          },
        };
      }

      // CLI not available - check if we should fallback to API
      if (this.strictCliMode) {
        // Strict mode: do NOT fallback to API
        console.log('[LLMProvider] CLI unavailable, strict mode enabled - NOT falling back to API');
        return {
          available: false,
          provider: 'none',
          error: cliStatus.error || 'Claude CLI not available (strict mode - no API fallback)',
          cliStatus: {
            installed: cliStatus.installed,
            authenticated: cliStatus.authenticated,
            version: cliStatus.version,
          },
        };
      }

      // Non-strict mode: check for API fallback
      if (!this.anthropicClient) {
        this.initializeApiClient();
      }

      if (this.anthropicClient) {
        console.log('[LLMProvider] CLI unavailable, falling back to API');
        return {
          available: true,
          provider: 'api',
          error: cliStatus.error,
          cliStatus: {
            installed: cliStatus.installed,
            authenticated: cliStatus.authenticated,
            version: cliStatus.version,
          },
        };
      }

      return {
        available: false,
        provider: 'none',
        error: cliStatus.error || 'Claude CLI not available and no API key configured',
        cliStatus: {
          installed: cliStatus.installed,
          authenticated: cliStatus.authenticated,
          version: cliStatus.version,
        },
      };
    } else {
      // API mode
      return {
        available: this.anthropicClient !== null,
        provider: this.anthropicClient ? 'api' : 'none',
        error: this.anthropicClient ? undefined : 'No API key configured (set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY)',
      };
    }
  }

  /**
   * Check if the provider is available (sync check based on config)
   */
  isAvailable(): boolean {
    if (this.useCliMode) {
      // CLI mode - we assume it might be available, actual check is async
      return true;
    }
    return this.anthropicClient !== null;
  }

  /**
   * Get the current provider mode
   */
  getMode(): 'cli' | 'api' {
    return this.useCliMode ? 'cli' : 'api';
  }

  /**
   * Execute an LLM request
   */
  async execute(request: LLMRequest): Promise<LLMResponse> {
    const startTime = Date.now();

    if (this.useCliMode) {
      // Try CLI first
      const cliStatus = await claudeCliService.checkStatus();

      if (cliStatus.installed && cliStatus.authenticated) {
        return this.executeViaCli(request);
      }

      // CLI unavailable - check if we should fallback to API
      if (this.strictCliMode) {
        // Strict mode: do NOT fallback to API
        console.warn('[LLMProvider] CLI unavailable, strict mode enabled - NOT falling back to API');
        return {
          success: false,
          error: `Claude CLI not available: ${cliStatus.error}. Strict CLI mode enabled - no API fallback.`,
          provider: 'none',
          durationMs: Date.now() - startTime,
        };
      }

      // Non-strict mode: fallback to API
      console.warn('[LLMProvider] CLI unavailable, attempting API fallback');
      if (!this.anthropicClient) {
        this.initializeApiClient();
      }

      if (this.anthropicClient) {
        return this.executeViaApi(request);
      }

      return {
        success: false,
        error: `Claude CLI not available: ${cliStatus.error}. No API key configured for fallback.`,
        provider: 'none',
        durationMs: Date.now() - startTime,
      };
    } else {
      // API mode
      if (this.anthropicClient) {
        return this.executeViaApi(request);
      }

      return {
        success: false,
        error: 'Anthropic API client not initialized. Set CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY.',
        provider: 'none',
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute request via Anthropic API
   * Includes Langfuse generation tracking for observability
   */
  private async executeViaApi(request: LLMRequest): Promise<LLMResponse> {
    if (!this.anthropicClient) {
      return {
        success: false,
        error: 'Anthropic API client not initialized',
        provider: 'api',
      };
    }

    const startTime = Date.now();
    const config = getLLMConfig();
    const model = request.model || config.defaultModel;

    // Get Langfuse context and start generation tracking
    const langfuse = getLangfuseService();
    const traceContext = getCurrentTraceContext();
    let generation: any = null;

    if (traceContext && await langfuse.ensureInitialized()) {
      try {
        generation = await langfuse.startGeneration({
          name: 'llm-provider-api',
          traceId: traceContext.traceId,
          parentObservationId: traceContext.parentObservationId,
          model,
          modelParameters: {
            temperature: request.temperature ?? 0.2,
            maxTokens: request.maxTokens || 4096,
          },
          input: {
            prompt: request.prompt.substring(0, 1000), // Truncate for storage
            systemPrompt: request.systemPrompt?.substring(0, 500),
          },
          metadata: {
            provider: 'anthropic',
            purpose: request.purpose || 'generic-llm-call',
            ...request.metadata,
          },
        });
      } catch (e: any) {
        console.warn(`[LLMProvider] Langfuse generation start failed: ${e.message}`);
      }
    }

    try {
      const messages: Anthropic.MessageParam[] = [
        { role: 'user', content: request.prompt },
      ];

      const response = await this.anthropicClient.messages.create({
        model,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.2,
        system: request.systemPrompt,
        messages,
      }, {
        timeout: request.timeout || config.timeout,
      });

      const textContent = response.content.find(c => c.type === 'text');
      const content = textContent?.type === 'text' ? textContent.text : '';
      const durationMs = Date.now() - startTime;

      // End Langfuse generation with success
      if (generation) {
        try {
          langfuse.endGeneration(generation.id, {
            output: { content: content.substring(0, 1000) }, // Truncate for storage
            usage: {
              input: response.usage?.input_tokens || 0,
              output: response.usage?.output_tokens || 0,
              total: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
            },
            level: 'DEFAULT',
          });
        } catch (e: any) {
          console.warn(`[LLMProvider] Langfuse generation end failed: ${e.message}`);
        }
      }

      return {
        success: true,
        content,
        usage: {
          inputTokens: response.usage?.input_tokens || 0,
          outputTokens: response.usage?.output_tokens || 0,
        },
        provider: 'api',
        durationMs,
      };
    } catch (error: any) {
      const durationMs = Date.now() - startTime;

      // End Langfuse generation with error
      if (generation) {
        try {
          langfuse.endGeneration(generation.id, {
            output: { error: error.message },
            level: 'ERROR',
            statusMessage: error.message,
          });
        } catch (e: any) {
          console.warn(`[LLMProvider] Langfuse generation error end failed: ${e.message}`);
        }
      }

      return {
        success: false,
        error: error.message,
        provider: 'api',
        durationMs,
      };
    }
  }

  /**
   * Execute request via Claude CLI
   * Includes Langfuse generation tracking for observability
   */
  private async executeViaCli(request: LLMRequest): Promise<LLMResponse> {
    const cliRequest: ClaudeCliRequest = {
      prompt: request.prompt,
      model: request.model,
      systemPrompt: request.systemPrompt,
      timeout: request.timeout,
    };

    // Get Langfuse context and start generation tracking
    const langfuse = getLangfuseService();
    const traceContext = getCurrentTraceContext();
    let generation: any = null;

    if (traceContext && await langfuse.ensureInitialized()) {
      try {
        generation = await langfuse.startGeneration({
          name: 'llm-provider-cli',
          traceId: traceContext.traceId,
          parentObservationId: traceContext.parentObservationId,
          model: request.model || 'claude-cli',
          modelParameters: {},
          input: {
            prompt: request.prompt.substring(0, 1000),
            systemPrompt: request.systemPrompt?.substring(0, 500),
          },
          metadata: {
            provider: 'cli',
            purpose: request.purpose || 'generic-llm-call',
            ...request.metadata,
          },
        });
      } catch (e: any) {
        console.warn(`[LLMProvider] Langfuse CLI generation start failed: ${e.message}`);
      }
    }

    const cliResponse = await claudeCliService.execute(cliRequest);

    // End Langfuse generation
    if (generation) {
      try {
        langfuse.endGeneration(generation.id, {
          output: cliResponse.success
            ? { content: cliResponse.result?.substring(0, 1000) }
            : { error: cliResponse.error },
          usage: cliResponse.usage
            ? {
                input: cliResponse.usage.inputTokens,
                output: cliResponse.usage.outputTokens,
                total: cliResponse.usage.inputTokens + cliResponse.usage.outputTokens,
              }
            : undefined,
          level: cliResponse.success ? 'DEFAULT' : 'ERROR',
          statusMessage: cliResponse.error,
        });
      } catch (e: any) {
        console.warn(`[LLMProvider] Langfuse CLI generation end failed: ${e.message}`);
      }
    }

    return {
      success: cliResponse.success,
      content: cliResponse.result,
      error: cliResponse.error,
      usage: cliResponse.usage,
      provider: 'cli',
      durationMs: cliResponse.durationMs,
    };
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let providerInstance: LLMProvider | null = null;

/**
 * Get the singleton LLM provider instance
 */
export function getLLMProvider(): LLMProvider {
  if (!providerInstance) {
    providerInstance = new LLMProvider();
  }
  return providerInstance;
}

/**
 * Reset the provider instance (useful for testing)
 */
export function resetLLMProvider(): void {
  providerInstance = null;
}

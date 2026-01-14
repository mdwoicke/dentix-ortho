/**
 * Langfuse Service
 * Singleton service for comprehensive LLM tracing and observability
 *
 * Features:
 * - Lazy async initialization from database config
 * - Trace/Span/Generation creation and management
 * - Auto-scoring integration
 * - Graceful error handling (never fails tests)
 */

import { Langfuse, LangfuseTraceClient, LangfuseSpanClient, LangfuseGenerationClient } from 'langfuse';
import type {
  LangfuseConfig,
  TraceOptions,
  SpanOptions,
  GenerationOptions,
  ScorePayload,
  LangfuseErrorContext,
  ErrorSeverity,
} from '../types/langfuse.types';

// ============================================================================
// Error Severity Mapping
// ============================================================================

const ERROR_SEVERITY_MAP: Record<string, ErrorSeverity> = {
  // Critical - Test cannot continue
  timeout: 'critical',
  api_connection_failed: 'critical',
  session_expired: 'critical',
  network_error: 'critical',

  // High - Test fails but can continue
  pattern_mismatch: 'high',
  semantic_evaluation_failed: 'high',
  tool_error: 'high',
  llm_error: 'high',
  api_error: 'high',

  // Medium - Degraded experience
  response_too_short: 'medium',
  banned_word_used: 'medium',
  unclear_response: 'medium',
  validation_error: 'medium',
  parse_error: 'medium',

  // Low - Cosmetic issues
  response_too_long: 'low',
  missing_greeting: 'low',
};

export function getErrorSeverity(errorType: string): ErrorSeverity {
  return ERROR_SEVERITY_MAP[errorType] || 'medium';
}

export function getErrorSeverityScore(errorType: string): number {
  const severity = getErrorSeverity(errorType);
  switch (severity) {
    case 'critical':
      return 0.0;
    case 'high':
      return 0.25;
    case 'medium':
      return 0.5;
    case 'low':
      return 0.75;
    case 'none':
      return 1.0;
    default:
      return 0.5;
  }
}

// ============================================================================
// Langfuse Service Class
// ============================================================================

export class LangfuseService {
  private client: Langfuse | null = null;
  private initPromise: Promise<boolean> | null = null;
  private storedConfig: LangfuseConfig | null = null;
  private enabled: boolean = true;

  /**
   * Get the stored configuration (for debugging/inspection)
   */
  getConfig(): LangfuseConfig | null {
    return this.storedConfig;
  }

  // Track active observations for context
  private activeTraces: Map<string, LangfuseTraceClient> = new Map();
  private activeSpans: Map<string, LangfuseSpanClient> = new Map();
  private activeGenerations: Map<string, LangfuseGenerationClient> = new Map();

  // Direct config override (set before initialization)
  private directConfig: LangfuseConfig | null = null;

  /**
   * Configure the service with direct settings (call before ensureInitialized)
   * Use this for A/B sandbox testing with custom Langfuse endpoints
   */
  configureWithDirectSettings(host: string, publicKey: string, secretKey: string): void {
    if (this.client) {
      console.warn('[Langfuse] Already initialized, direct config will be ignored');
      return;
    }
    this.directConfig = { host, publicKey, secretKey };
    console.log(`[Langfuse] Direct config set: ${host}`);
  }

  /**
   * Ensure the Langfuse client is initialized
   * Returns true if successfully initialized, false otherwise
   */
  async ensureInitialized(): Promise<boolean> {
    if (this.client) return true;
    if (!this.enabled) return false;

    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }

    return this.initPromise;
  }

  /**
   * Initialize the Langfuse client from config
   */
  private async initialize(): Promise<boolean> {
    try {
      // Use direct config if provided, otherwise load from backend API
      const config = this.directConfig || await this.loadConfig();

      if (!config) {
        console.log('[Langfuse] No configuration found, tracing disabled');
        this.enabled = false;
        return false;
      }

      this.storedConfig = config;
      this.client = new Langfuse({
        publicKey: config.publicKey,
        secretKey: config.secretKey,
        baseUrl: config.host,
        // Disable automatic flushing - we'll control it manually
        flushAt: 50,
        flushInterval: 5000,
      });

      console.log(`[Langfuse] Initialized with host: ${config.host || 'default'}`);
      return true;
    } catch (error: any) {
      console.warn(`[Langfuse] Initialization failed: ${error.message}`);
      this.enabled = false;
      return false;
    }
  }

  /**
   * Load Langfuse configuration from backend API
   */
  private async loadConfig(): Promise<LangfuseConfig | null> {
    try {
      // Use native fetch (Node.js 18+) to avoid module resolution issues
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(
        'http://localhost:3001/api/test-monitor/app-settings/langfuse-config',
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      if (response.ok) {
        const json = await response.json() as { success?: boolean; data?: Record<string, string> };
        if (json?.success && json?.data) {
          const data = json.data;
          return {
            publicKey: data.publicKey || data.public_key,
            secretKey: data.secretKey || data.secret_key,
            host: data.host,
          };
        }
      }

      return null;
    } catch (error: any) {
      // Fallback: try environment variables
      const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
      const secretKey = process.env.LANGFUSE_SECRET_KEY;
      const host = process.env.LANGFUSE_HOST;

      if (publicKey && secretKey) {
        return { publicKey, secretKey, host };
      }

      return null;
    }
  }

  /**
   * Check if Langfuse is available
   */
  isAvailable(): boolean {
    return this.client !== null && this.enabled;
  }

  // ============================================================================
  // Trace Management
  // ============================================================================

  /**
   * Create a new trace
   */
  async createTrace(options: TraceOptions): Promise<LangfuseTraceClient | null> {
    if (!(await this.ensureInitialized()) || !this.client) {
      return null;
    }

    try {
      const trace = this.client.trace({
        name: options.name,
        sessionId: options.sessionId,
        userId: options.userId,
        metadata: options.metadata,
        tags: options.tags,
        input: options.input,
      });

      this.activeTraces.set(trace.id, trace);
      return trace;
    } catch (error: any) {
      console.warn(`[Langfuse] Failed to create trace: ${error.message}`);
      return null;
    }
  }

  /**
   * Get an active trace by ID
   */
  getTrace(traceId: string): LangfuseTraceClient | undefined {
    return this.activeTraces.get(traceId);
  }

  /**
   * Update a trace
   */
  async updateTrace(
    traceId: string,
    updates: { output?: any; metadata?: Record<string, any>; tags?: string[] }
  ): Promise<void> {
    const trace = this.activeTraces.get(traceId);
    if (trace) {
      try {
        trace.update(updates);
      } catch (error: any) {
        console.warn(`[Langfuse] Failed to update trace: ${error.message}`);
      }
    }
  }

  // ============================================================================
  // Span Management
  // ============================================================================

  /**
   * Start a new span
   */
  async startSpan(options: SpanOptions): Promise<LangfuseSpanClient | null> {
    if (!(await this.ensureInitialized()) || !this.client) {
      return null;
    }

    try {
      // Get parent trace or span
      const parent = options.parentObservationId
        ? this.activeSpans.get(options.parentObservationId) ||
          this.activeGenerations.get(options.parentObservationId)
        : options.traceId
          ? this.activeTraces.get(options.traceId)
          : null;

      let span: LangfuseSpanClient;

      if (parent && 'span' in parent) {
        // Parent is a trace
        span = (parent as LangfuseTraceClient).span({
          name: options.name,
          metadata: options.metadata,
          input: options.input,
        });
      } else if (parent && 'span' in (parent as any)) {
        // Parent is a span
        span = (parent as LangfuseSpanClient).span({
          name: options.name,
          metadata: options.metadata,
          input: options.input,
        });
      } else if (this.client && options.traceId) {
        // Create span directly on client
        span = this.client.span({
          name: options.name,
          traceId: options.traceId,
          metadata: options.metadata,
          input: options.input,
        });
      } else {
        return null;
      }

      this.activeSpans.set(span.id, span);
      return span;
    } catch (error: any) {
      console.warn(`[Langfuse] Failed to start span: ${error.message}`);
      return null;
    }
  }

  /**
   * End a span
   */
  endSpan(
    spanId: string,
    options?: { output?: any; statusMessage?: string; level?: 'DEFAULT' | 'DEBUG' | 'WARNING' | 'ERROR' }
  ): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      try {
        span.end({
          output: options?.output,
          statusMessage: options?.statusMessage,
          level: options?.level,
        });
        this.activeSpans.delete(spanId);
      } catch (error: any) {
        console.warn(`[Langfuse] Failed to end span: ${error.message}`);
      }
    }
  }

  // ============================================================================
  // Generation Management
  // ============================================================================

  /**
   * Start a new generation (for LLM calls)
   */
  async startGeneration(options: GenerationOptions): Promise<LangfuseGenerationClient | null> {
    if (!(await this.ensureInitialized()) || !this.client) {
      return null;
    }

    try {
      // Get parent trace or span
      const parent = options.parentObservationId
        ? this.activeSpans.get(options.parentObservationId)
        : options.traceId
          ? this.activeTraces.get(options.traceId)
          : null;

      let generation: LangfuseGenerationClient;

      if (parent && 'generation' in parent) {
        // Parent is a trace
        generation = (parent as LangfuseTraceClient).generation({
          name: options.name,
          model: options.model,
          modelParameters: options.modelParameters,
          input: options.input,
          metadata: options.metadata,
        });
      } else if (parent && 'generation' in (parent as any)) {
        // Parent is a span
        generation = (parent as LangfuseSpanClient).generation({
          name: options.name,
          model: options.model,
          modelParameters: options.modelParameters,
          input: options.input,
          metadata: options.metadata,
        });
      } else if (this.client && options.traceId) {
        // Create generation directly
        generation = this.client.generation({
          name: options.name,
          traceId: options.traceId,
          model: options.model,
          modelParameters: options.modelParameters,
          input: options.input,
          metadata: options.metadata,
        });
      } else {
        return null;
      }

      this.activeGenerations.set(generation.id, generation);
      return generation;
    } catch (error: any) {
      console.warn(`[Langfuse] Failed to start generation: ${error.message}`);
      return null;
    }
  }

  /**
   * End a generation
   */
  endGeneration(
    generationId: string,
    options?: {
      output?: any;
      usage?: { input?: number; output?: number; total?: number };
      statusMessage?: string;
      level?: 'DEFAULT' | 'DEBUG' | 'WARNING' | 'ERROR';
    }
  ): void {
    const generation = this.activeGenerations.get(generationId);
    if (generation) {
      try {
        generation.end({
          output: options?.output,
          usage: options?.usage,
          statusMessage: options?.statusMessage,
          level: options?.level,
        });
        this.activeGenerations.delete(generationId);
      } catch (error: any) {
        console.warn(`[Langfuse] Failed to end generation: ${error.message}`);
      }
    }
  }

  // ============================================================================
  // Scoring
  // ============================================================================

  /**
   * Submit a score
   */
  async score(payload: ScorePayload): Promise<void> {
    if (!this.client || !this.enabled) return;
    // value is required by Langfuse SDK - skip if not provided
    if (payload.value === undefined) return;

    try {
      this.client.score({
        traceId: payload.traceId,
        observationId: payload.observationId,
        name: payload.name,
        value: payload.value,
        comment: payload.comment,
        dataType: payload.dataType,
      });
    } catch (error: any) {
      console.warn(`[Langfuse] Failed to submit score: ${error.message}`);
    }
  }

  /**
   * Submit an error with severity score
   */
  async scoreError(context: LangfuseErrorContext): Promise<void> {
    await this.score({
      traceId: context.traceId,
      observationId: context.spanId,
      name: 'error-severity',
      value: getErrorSeverityScore(context.errorType),
      comment: `${context.errorType}: ${context.errorMessage}`,
      dataType: 'NUMERIC',
    });
  }

  // ============================================================================
  // Lifecycle Management
  // ============================================================================

  /**
   * Flush pending events
   */
  async flush(): Promise<void> {
    if (this.client) {
      try {
        await this.client.flushAsync();
      } catch (error: any) {
        console.warn(`[Langfuse] Flush failed: ${error.message}`);
      }
    }
  }

  /**
   * Shutdown the client
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      try {
        await this.client.shutdownAsync();
        console.log('[Langfuse] Shutdown complete');
      } catch (error: any) {
        console.warn(`[Langfuse] Shutdown failed: ${error.message}`);
      }
      this.client = null;
    }

    // Clear active observations
    this.activeTraces.clear();
    this.activeSpans.clear();
    this.activeGenerations.clear();
  }

  /**
   * Get current client (for advanced use cases)
   */
  getClient(): Langfuse | null {
    return this.client;
  }
}

// ============================================================================
// Singleton Factory
// ============================================================================

let serviceInstance: LangfuseService | null = null;

/**
 * Get the singleton Langfuse service instance
 */
export function getLangfuseService(): LangfuseService {
  if (!serviceInstance) {
    serviceInstance = new LangfuseService();
  }
  return serviceInstance;
}

/**
 * Reset the service instance (useful for testing)
 */
export function resetLangfuseService(): void {
  if (serviceInstance) {
    serviceInstance.shutdown();
  }
  serviceInstance = null;
}

// ============================================================================
// Convenience Functions
// ============================================================================

/**
 * Safe wrapper for Langfuse operations
 * Never throws - returns fallback value on failure
 */
export async function safeLangfuse<T>(
  operation: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    console.warn(`[Langfuse] Operation failed: ${error.message}`);
    return fallback;
  }
}

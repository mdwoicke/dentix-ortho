/**
 * Langfuse Type Definitions
 * Types for comprehensive LLM tracing and observability
 */

// ============================================================================
// Trace Context
// ============================================================================

export interface TraceContext {
  traceId: string;
  runId: string;
  testId?: string;
  sessionId?: string;
  parentObservationId?: string;
  metadata?: Record<string, any>;
}

// ============================================================================
// Generation Metadata
// ============================================================================

export interface GenerationMetadata {
  provider: 'anthropic' | 'flowise' | 'cli';
  model: string;
  purpose: GenerationPurpose;
  testId?: string;
  stepId?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: any;
}

export type GenerationPurpose =
  | 'response-generation'
  | 'semantic-evaluation'
  | 'failure-analysis'
  | 'chatbot-interaction'
  | 'generic-llm-call'
  | 'trace_analysis';

// ============================================================================
// Generation Result
// ============================================================================

export interface GenerationResult {
  success: boolean;
  content?: string;
  error?: string;
  usage?: TokenUsage;
  durationMs: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// ============================================================================
// Tool Call Tracking
// ============================================================================

export interface ToolCallMetadata {
  toolName: string;
  input?: any;
  output?: any;
  status: 'completed' | 'error' | 'pending';
  durationMs?: number;
  error?: string;
}

// ============================================================================
// Error Enrichment
// ============================================================================

export interface LangfuseErrorContext {
  // Correlation
  traceId: string;
  spanId?: string;
  runId: string;
  testId: string;
  stepId?: string;

  // Error Details
  errorType: ErrorType;
  errorMessage: string;
  stackTrace?: string;
  errorCode?: string;

  // Context
  input?: any;
  output?: any;
  expectedPattern?: string;
  actualResponse?: string;

  // Environment
  environment: string;
  flowiseEndpoint?: string;
  promptVersion?: string;

  // Timing
  timestamp: string;
  durationMs?: number;
}

export type ErrorType =
  | 'api_error'
  | 'validation_error'
  | 'timeout'
  | 'llm_error'
  | 'tool_error'
  | 'network_error'
  | 'parse_error'
  | 'unknown_error';

// ============================================================================
// Scoring
// ============================================================================

export interface ScoreDefinition {
  name: ScoreName;
  dataType: 'NUMERIC' | 'BOOLEAN' | 'CATEGORICAL';
  description: string;
  minValue?: number;
  maxValue?: number;
  categories?: string[];
}

export type ScoreName =
  | 'test-passed'
  | 'goal-completion-rate'
  | 'semantic-confidence'
  | 'error-severity'
  | 'fix-confidence'
  | 'run-pass-rate'
  | 'response-latency-avg'
  | 'turn-efficiency';

export interface ScorePayload {
  traceId: string;
  observationId?: string;
  name: ScoreName;
  value?: number;
  stringValue?: string;
  comment?: string;
  dataType?: 'NUMERIC' | 'BOOLEAN' | 'CATEGORICAL';
}

export type ErrorSeverity = 'critical' | 'high' | 'medium' | 'low' | 'none';

// ============================================================================
// Test Result Types (for scoring)
// ============================================================================

export interface TestResultForScoring {
  passed: boolean;
  status: 'passed' | 'failed' | 'skipped' | 'error';
  goalResults?: Array<{ passed: boolean }>;
  turnCount?: number;
  transcript?: Array<{ responseTimeMs?: number }>;
  constraintViolations?: any[];
  findings?: any[];
  errorMessage?: string;
  durationMs?: number;
}

export interface SemanticEvaluationForScoring {
  passed: boolean;
  confidence: number;
  reasoning?: string;
  matchedExpectations?: string[];
  unmatchedExpectations?: string[];
  isFallback?: boolean;
}

export interface AnalysisResultForScoring {
  fixes: Array<{ confidence: number }>;
  rootCauseType?: string;
  classification?: {
    botIssue: number;
    testAgentIssue: number;
  };
}

// ============================================================================
// Configuration
// ============================================================================

export interface LangfuseConfig {
  publicKey: string;
  secretKey: string;
  host?: string;
  enabled?: boolean;
}

// ============================================================================
// Trace/Span/Generation Options
// ============================================================================

export interface TraceOptions {
  name: string;
  sessionId?: string;
  userId?: string;
  metadata?: Record<string, any>;
  tags?: string[];
  input?: any;
}

export interface SpanOptions {
  name: string;
  traceId?: string;
  parentObservationId?: string;
  metadata?: Record<string, any>;
  input?: any;
}

export interface GenerationOptions {
  name: string;
  traceId?: string;
  parentObservationId?: string;
  model: string;
  modelParameters?: {
    temperature?: number;
    maxTokens?: number;
    [key: string]: any;
  };
  input?: any;
  metadata?: Record<string, any>;
}

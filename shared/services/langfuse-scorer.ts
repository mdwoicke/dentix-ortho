/**
 * Langfuse Auto-Scoring
 * Calculates and submits scores based on test results
 *
 * Score Types:
 * - test-passed: Boolean (0/1) - Did the test pass?
 * - goal-completion-rate: Numeric (0-1) - What % of goals were achieved?
 * - semantic-confidence: Numeric (0-1) - How confident was the semantic evaluation?
 * - error-severity: Categorical - How severe was any error?
 * - fix-confidence: Numeric (0-1) - How confident is the suggested fix?
 * - run-pass-rate: Numeric (0-1) - What % of tests in the run passed?
 * - response-latency-avg: Numeric (ms) - Average response time
 * - turn-efficiency: Numeric (0-1) - How efficiently was the goal achieved?
 */

import { getLangfuseService, getErrorSeverityScore, getErrorSeverity } from './langfuse-service';
import type {
  ScoreName,
  ScorePayload,
  TestResultForScoring,
  SemanticEvaluationForScoring,
  AnalysisResultForScoring,
} from '../types/langfuse.types';

// ============================================================================
// Score Definitions
// ============================================================================

interface ScoreCalculator<T> {
  name: ScoreName;
  calculate: (data: T) => number | string | undefined;
  dataType: 'NUMERIC' | 'BOOLEAN' | 'CATEGORICAL';
  description: string;
}

// ============================================================================
// Test Result Scores
// ============================================================================

const TEST_RESULT_SCORES: ScoreCalculator<TestResultForScoring>[] = [
  {
    name: 'test-passed',
    calculate: (r) => (r.passed ? 1 : 0),
    dataType: 'BOOLEAN',
    description: 'Test pass (1) or fail (0)',
  },
  {
    name: 'goal-completion-rate',
    calculate: (r) => {
      if (!r.goalResults || r.goalResults.length === 0) return undefined;
      const passed = r.goalResults.filter((g) => g.passed).length;
      return passed / r.goalResults.length;
    },
    dataType: 'NUMERIC',
    description: 'Percentage of goals achieved',
  },
  {
    name: 'turn-efficiency',
    calculate: (r) => {
      if (!r.turnCount) return undefined;
      // Lower turns = better efficiency (normalized to 0-1)
      // Assume max 50 turns for normalization
      const maxTurns = 50;
      return Math.max(0, 1 - r.turnCount / maxTurns);
    },
    dataType: 'NUMERIC',
    description: 'Efficiency score based on turn count',
  },
  {
    name: 'response-latency-avg',
    calculate: (r) => {
      if (!r.transcript || r.transcript.length === 0) return undefined;
      const latencies = r.transcript
        .filter((t) => t.responseTimeMs !== undefined)
        .map((t) => t.responseTimeMs!);
      if (latencies.length === 0) return undefined;
      return latencies.reduce((a, b) => a + b, 0) / latencies.length;
    },
    dataType: 'NUMERIC',
    description: 'Average response latency in milliseconds',
  },
];

// ============================================================================
// Scoring Functions
// ============================================================================

/**
 * Score a test result
 */
export async function scoreTestResult(
  traceId: string,
  result: TestResultForScoring,
  observationId?: string
): Promise<void> {
  const langfuse = getLangfuseService();
  if (!langfuse.isAvailable()) return;

  for (const scorer of TEST_RESULT_SCORES) {
    const value = scorer.calculate(result);
    if (value === undefined) continue;

    await langfuse.score({
      traceId,
      observationId,
      name: scorer.name,
      value: typeof value === 'number' ? value : undefined,
      dataType: scorer.dataType,
      comment: scorer.description,
    });
  }
}

/**
 * Score a semantic evaluation result
 */
export async function scoreSemanticEvaluation(
  traceId: string,
  evaluation: SemanticEvaluationForScoring,
  observationId?: string
): Promise<void> {
  const langfuse = getLangfuseService();
  if (!langfuse.isAvailable()) return;

  await langfuse.score({
    traceId,
    observationId,
    name: 'semantic-confidence',
    value: evaluation.confidence,
    dataType: 'NUMERIC',
    comment: evaluation.reasoning || `Passed: ${evaluation.passed}, Fallback: ${evaluation.isFallback}`,
  });
}

/**
 * Score an error occurrence
 */
export async function scoreError(
  traceId: string,
  errorType: string,
  errorMessage: string,
  observationId?: string
): Promise<void> {
  const langfuse = getLangfuseService();
  if (!langfuse.isAvailable()) return;

  const severity = getErrorSeverity(errorType);
  const severityScore = getErrorSeverityScore(errorType);

  await langfuse.score({
    traceId,
    observationId,
    name: 'error-severity',
    value: severityScore,
    dataType: 'NUMERIC',
    comment: `${severity}: ${errorType} - ${errorMessage.substring(0, 100)}`,
  });
}

/**
 * Score analysis results (fix confidence)
 */
export async function scoreAnalysisResult(
  traceId: string,
  analysis: AnalysisResultForScoring,
  observationId?: string
): Promise<void> {
  const langfuse = getLangfuseService();
  if (!langfuse.isAvailable()) return;

  if (analysis.fixes && analysis.fixes.length > 0) {
    // Average confidence across all fixes
    const avgConfidence =
      analysis.fixes.reduce((sum, fix) => sum + fix.confidence, 0) / analysis.fixes.length;

    await langfuse.score({
      traceId,
      observationId,
      name: 'fix-confidence',
      value: avgConfidence,
      dataType: 'NUMERIC',
      comment: `${analysis.fixes.length} fixes generated, avg confidence: ${avgConfidence.toFixed(2)}`,
    });
  }
}

/**
 * Score a complete test run
 */
export async function scoreTestRun(
  traceId: string,
  results: TestResultForScoring[]
): Promise<void> {
  const langfuse = getLangfuseService();
  if (!langfuse.isAvailable()) return;

  // Calculate run-level metrics
  const total = results.length;
  const passed = results.filter((r) => r.passed).length;
  const passRate = total > 0 ? passed / total : 0;

  // Calculate average latency across all tests
  let totalLatency = 0;
  let latencyCount = 0;
  for (const result of results) {
    if (result.transcript) {
      for (const turn of result.transcript) {
        if (turn.responseTimeMs !== undefined) {
          totalLatency += turn.responseTimeMs;
          latencyCount++;
        }
      }
    }
  }
  const avgLatency = latencyCount > 0 ? totalLatency / latencyCount : undefined;

  // Submit run-level scores
  await langfuse.score({
    traceId,
    name: 'run-pass-rate',
    value: passRate,
    dataType: 'NUMERIC',
    comment: `${passed}/${total} tests passed`,
  });

  if (avgLatency !== undefined) {
    await langfuse.score({
      traceId,
      name: 'response-latency-avg',
      value: avgLatency,
      dataType: 'NUMERIC',
      comment: `Average response latency: ${avgLatency.toFixed(0)}ms`,
    });
  }
}

// ============================================================================
// Batch Scoring
// ============================================================================

/**
 * Submit multiple scores at once
 */
export async function submitScores(scores: ScorePayload[]): Promise<void> {
  const langfuse = getLangfuseService();
  if (!langfuse.isAvailable()) return;

  for (const score of scores) {
    await langfuse.score(score);
  }
}

// ============================================================================
// Score Helpers
// ============================================================================

/**
 * Create a test-passed score payload
 */
export function createTestPassedScore(traceId: string, passed: boolean): ScorePayload {
  return {
    traceId,
    name: 'test-passed',
    value: passed ? 1 : 0,
    dataType: 'BOOLEAN',
  };
}

/**
 * Create a semantic confidence score payload
 */
export function createSemanticConfidenceScore(
  traceId: string,
  confidence: number,
  observationId?: string
): ScorePayload {
  return {
    traceId,
    observationId,
    name: 'semantic-confidence',
    value: confidence,
    dataType: 'NUMERIC',
  };
}

/**
 * Create an error severity score payload
 */
export function createErrorSeverityScore(
  traceId: string,
  errorType: string,
  observationId?: string
): ScorePayload {
  return {
    traceId,
    observationId,
    name: 'error-severity',
    value: getErrorSeverityScore(errorType),
    dataType: 'NUMERIC',
    comment: `Severity: ${getErrorSeverity(errorType)}`,
  };
}

/**
 * Create a fix confidence score payload
 */
export function createFixConfidenceScore(
  traceId: string,
  confidence: number,
  observationId?: string
): ScorePayload {
  return {
    traceId,
    observationId,
    name: 'fix-confidence',
    value: confidence,
    dataType: 'NUMERIC',
  };
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validate a score value is within expected bounds
 */
export function validateScore(name: ScoreName, value: number): boolean {
  switch (name) {
    case 'test-passed':
      return value === 0 || value === 1;
    case 'goal-completion-rate':
    case 'semantic-confidence':
    case 'error-severity':
    case 'fix-confidence':
    case 'run-pass-rate':
    case 'turn-efficiency':
      return value >= 0 && value <= 1;
    case 'response-latency-avg':
      return value >= 0; // Latency can be any positive number
    default:
      return true;
  }
}

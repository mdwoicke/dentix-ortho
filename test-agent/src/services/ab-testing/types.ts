/**
 * A/B Testing Framework Types
 *
 * Defines interfaces for variants, experiments, metrics, and statistical analysis
 */

import { GeneratedFix } from '../../storage/database';

// ============================================================================
// VARIANT TYPES
// ============================================================================

export type VariantType = 'prompt' | 'tool' | 'config';
export type VariantCreator = 'manual' | 'llm-analysis' | 'auto-generated';

/**
 * A variant represents a versioned copy of a prompt, tool, or config
 * that can be tested against other variants
 */
export interface Variant {
  variantId: string;           // e.g., 'VAR-PROMPT-001'
  variantType: VariantType;
  targetFile: string;          // File path being varied
  name: string;                // Human-readable name
  description: string;         // What this variant changes
  content: string;             // Full content or JSON config
  contentHash: string;         // SHA256 for deduplication
  baselineVariantId?: string;  // Parent variant (for A/B comparison)
  sourceFixId?: string;        // If created from a GeneratedFix
  isBaseline: boolean;         // Is this the current production version?
  createdAt: string;
  createdBy: VariantCreator;
  metadata?: VariantMetadata;
}

export interface VariantMetadata {
  section?: string;            // For prompts: which section changed
  changeType?: string;         // add-rule, clarify-instruction, etc.
  function?: string;           // For tools: which function changed
  parameters?: Record<string, any>;  // For configs: changed params
  rootCause?: string;          // From the original fix analysis
  confidence?: number;         // Confidence from fix analysis
}

export interface CreateVariantInput {
  variantType: VariantType;
  targetFile: string;
  name: string;
  description: string;
  content: string;
  baselineVariantId?: string;
  sourceFixId?: string;
  createdBy?: VariantCreator;
  metadata?: VariantMetadata;
}

// ============================================================================
// EXPERIMENT TYPES
// ============================================================================

export type ExperimentStatus = 'draft' | 'running' | 'paused' | 'completed' | 'aborted';
export type ExperimentType = 'prompt' | 'tool' | 'config' | 'multi';
export type VariantRole = 'control' | 'treatment';

/**
 * An experiment defines which variants to test and how
 */
export interface Experiment {
  experimentId: string;        // e.g., 'EXP-2024-12-27-001'
  name: string;
  description?: string;
  hypothesis: string;          // What we expect to happen
  status: ExperimentStatus;
  experimentType: ExperimentType;
  variants: ExperimentVariant[];
  testIds: string[];           // Which tests to run (e.g., GOAL-HAPPY-001)
  trafficSplit: Record<string, number>;  // variantId -> percentage (0-100)
  minSampleSize: number;       // Minimum runs per variant
  maxSampleSize: number;       // Maximum runs per variant
  significanceThreshold: number;  // e.g., 0.05 for 95% confidence
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  winningVariantId?: string;
  conclusion?: string;
}

export interface ExperimentVariant {
  variantId: string;
  role: VariantRole;
  weight: number;              // Traffic weight (0-100)
}

export interface CreateExperimentInput {
  name: string;
  description?: string;
  hypothesis: string;
  experimentType: ExperimentType;
  controlVariantId: string;
  treatmentVariantIds: string[];
  testIds: string[];
  trafficSplit?: Record<string, number>;  // Default: 50/50
  minSampleSize?: number;      // Default: 10
  maxSampleSize?: number;      // Default: 100
  significanceThreshold?: number;  // Default: 0.05
}

// ============================================================================
// EXPERIMENT RUN TYPES
// ============================================================================

/**
 * Tracks which variant was used in each test execution
 */
export interface ExperimentRun {
  id?: number;
  experimentId: string;
  runId: string;               // Links to test_runs table
  testId: string;
  variantId: string;
  variantRole: VariantRole;
  startedAt: string;
  completedAt: string;
  passed: boolean;
  turnCount: number;
  durationMs: number;
  goalCompletionRate: number;  // 0.0 - 1.0 (percentage of goals achieved)
  constraintViolations: number;
  errorOccurred: boolean;
  metrics: ExperimentMetrics;
}

export interface ExperimentMetrics {
  // Success metrics
  testPassed: boolean;
  goalsCompleted: number;
  goalsTotal: number;
  goalCompletionRate: number;

  // Efficiency metrics
  turnCount: number;
  durationMs: number;
  avgTurnDurationMs: number;

  // Quality metrics
  constraintViolations: number;
  issuesDetected: number;
  errorCount: number;

  // Cost metrics (for LLM variants)
  inputTokens?: number;
  outputTokens?: number;
  llmCost?: number;
}

// ============================================================================
// VARIANT SELECTION
// ============================================================================

/**
 * Result of selecting a variant for a test run
 */
export interface VariantSelection {
  variantId: string;
  role: VariantRole;
  content: string;
  targetFile: string;
}

// ============================================================================
// STATISTICAL ANALYSIS TYPES
// ============================================================================

/**
 * Aggregated statistics for a variant in an experiment
 */
export interface VariantStats {
  experimentId: string;
  variantId: string;
  role: VariantRole;
  sampleSize: number;

  // Success rates
  passRate: number;
  passCount: number;
  failCount: number;
  avgGoalCompletionRate: number;

  // Efficiency
  avgTurnCount: number;
  avgDurationMs: number;
  medianTurnCount: number;
  medianDurationMs: number;

  // Quality
  avgConstraintViolations: number;
  errorRate: number;

  // Statistical measures
  passRateStdDev: number;
  turnCountStdDev: number;
  durationStdDev: number;

  // Confidence intervals (95%)
  passRateCI: { lower: number; upper: number };
  turnCountCI: { lower: number; upper: number };
}

/**
 * Result of a chi-square test for comparing pass rates
 */
export interface ChiSquareResult {
  chiSquare: number;
  pValue: number;
  degreesOfFreedom: number;
  significant: boolean;  // p < significanceThreshold
}

/**
 * Result of a two-sample t-test for comparing means
 */
export interface TTestResult {
  tStatistic: number;
  pValue: number;
  degreesOfFreedom: number;
  significant: boolean;
  effectSize: number;  // Cohen's d
  effectMagnitude: 'negligible' | 'small' | 'medium' | 'large';
}

/**
 * Comprehensive experiment analysis
 */
export interface ExperimentAnalysis {
  experimentId: string;
  status: ExperimentStatus;

  // Sample sizes
  controlSampleSize: number;
  treatmentSampleSize: number;
  totalSampleSize: number;

  // Key metrics comparison
  controlPassRate: number;
  treatmentPassRate: number;
  passRateDifference: number;
  passRateLift: number;  // Percentage improvement (treatment vs control)

  controlAvgTurns: number;
  treatmentAvgTurns: number;
  turnsDifference: number;

  // Statistical significance
  passRatePValue: number;
  passRateSignificant: boolean;
  turnsCountPValue: number;
  turnsCountSignificant: boolean;

  // Effect sizes
  passRateEffectSize?: number;
  turnsEffectSize?: number;

  // Recommendation
  isSignificant: boolean;
  recommendedWinner: string | null;  // variantId or null if no clear winner
  confidenceLevel: number;  // 1 - pValue
  recommendation: 'continue' | 'adopt-treatment' | 'keep-control' | 'no-difference';
  recommendationReason: string;

  // Detailed stats
  controlStats: VariantStats;
  treatmentStats: VariantStats;
}

/**
 * Recommendation on whether to conclude an experiment
 */
export interface ConclusionRecommendation {
  shouldConclude: boolean;
  reason: 'min-sample-reached' | 'max-sample-reached' | 'significance-achieved' | 'no-difference' | 'continue';
  winningVariantId?: string;
  winningRole?: VariantRole;
  confidence?: number;
  message: string;
}

// ============================================================================
// TRIGGER TYPES
// ============================================================================

export type TriggerType = 'fix-applied' | 'scheduled' | 'pass-rate-drop' | 'manual';

/**
 * Triggers define when to suggest/run A/B tests
 */
export interface ExperimentTrigger {
  triggerId: string;
  experimentId: string;
  triggerType: TriggerType;
  condition?: TriggerCondition;
  enabled: boolean;
  lastTriggered?: string;
}

export interface TriggerCondition {
  fixId?: string;              // Trigger when specific fix is applied
  passRateThreshold?: number;  // Trigger when pass rate drops below
  schedule?: string;           // Cron expression for scheduled triggers
}

export interface CreateTriggerInput {
  experimentId: string;
  triggerType: TriggerType;
  condition?: TriggerCondition;
}

// ============================================================================
// IMPACT ASSESSMENT
// ============================================================================

export type ImpactLevel = 'high' | 'medium' | 'low' | 'minimal';

/**
 * Assessment of whether a fix warrants A/B testing
 */
export interface FixImpactAssessment {
  shouldTest: boolean;
  impactLevel: ImpactLevel;
  reason: string;
  affectedTests: string[];
  affectedFlows: string[];  // e.g., 'booking', 'data-collection', 'transfer'
  suggestedMinSampleSize: number;
}

// ============================================================================
// A/B RECOMMENDATION (for LLMAnalysisService integration)
// ============================================================================

/**
 * Recommendation to create an A/B test for a fix
 */
export interface ABRecommendation {
  fix: GeneratedFix;
  impactLevel: ImpactLevel;
  reason: string;
  suggestedExperiment: {
    name: string;
    hypothesis: string;
    testIds: string[];
    minSampleSize: number;
  };
}

/**
 * Extended analysis result with A/B recommendations
 */
export interface AnalysisResultWithAB {
  // Original analysis fields will be spread here
  abRecommendations: ABRecommendation[];
}

// ============================================================================
// CONFIG VARIANT TYPES
// ============================================================================

/**
 * Configuration parameters that can be varied in A/B tests
 */
export interface ConfigVariant {
  // LLM Configuration
  llm?: {
    model?: string;              // e.g., 'claude-3-5-haiku-20241022'
    temperature?: number;        // 0.0 - 1.0
    maxTokens?: number;
  };

  // Intent Detection Configuration
  intentDetection?: {
    model?: string;
    temperature?: number;
    maxTokens?: number;
    cacheEnabled?: boolean;
    cacheTtlMs?: number;
  };

  // Response Generation Configuration
  responseGeneration?: {
    useLlm?: boolean;
    model?: string;
    temperature?: number;
    maxTokens?: number;
  };

  // Test Behavior Configuration
  test?: {
    maxTurns?: number;
    responseDelayMs?: number;
    handleUnknownIntents?: 'fail' | 'clarify' | 'generic';
  };
}

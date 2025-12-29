/**
 * Experiment Service for A/B Testing
 *
 * Orchestrates A/B test experiments including lifecycle management,
 * variant selection, and result collection.
 */

import { v4 as uuidv4 } from 'uuid';
import { Database, ABExperiment, ABExperimentRun } from '../../storage/database';
import { StatisticsService } from './statistics-service';
import { VariantService } from './variant-service';
import type {
  CreateExperimentInput,
  Experiment,
  ExperimentVariant,
  VariantSelection,
  ExperimentAnalysis,
  ConclusionRecommendation,
  ExperimentMetrics,
} from './types';

export class ExperimentService {
  private statisticsService: StatisticsService;

  constructor(
    private db: Database,
    private variantService: VariantService
  ) {
    this.statisticsService = new StatisticsService(db);
  }

  /**
   * Create a new experiment
   */
  createExperiment(input: CreateExperimentInput): Experiment {
    const experimentId = this.generateExperimentId();
    const now = new Date().toISOString();

    // Build variants array
    const variants: ExperimentVariant[] = [
      { variantId: input.controlVariantId, role: 'control', weight: 50 },
      ...input.treatmentVariantIds.map(id => ({
        variantId: id,
        role: 'treatment' as const,
        weight: Math.floor(50 / input.treatmentVariantIds.length),
      })),
    ];

    // Adjust weights to sum to 100
    const totalWeight = variants.reduce((sum, v) => sum + v.weight, 0);
    if (totalWeight !== 100) {
      variants[0].weight += 100 - totalWeight;
    }

    // Build traffic split
    const trafficSplit: Record<string, number> = input.trafficSplit || {};
    if (Object.keys(trafficSplit).length === 0) {
      variants.forEach(v => {
        trafficSplit[v.variantId] = v.weight;
      });
    }

    const experiment: ABExperiment = {
      experimentId,
      name: input.name,
      description: input.description,
      hypothesis: input.hypothesis,
      status: 'draft',
      experimentType: input.experimentType,
      variants,
      testIds: input.testIds,
      trafficSplit,
      minSampleSize: input.minSampleSize || 10,
      maxSampleSize: input.maxSampleSize || 100,
      significanceThreshold: input.significanceThreshold || 0.05,
      createdAt: now,
    };

    this.db.saveExperiment(experiment);

    return this.mapToExperiment(experiment);
  }

  /**
   * Start an experiment
   */
  startExperiment(experimentId: string): void {
    const experiment = this.db.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'draft' && experiment.status !== 'paused') {
      throw new Error(`Cannot start experiment in ${experiment.status} status`);
    }

    this.db.updateExperimentStatus(experimentId, 'running', {
      startedAt: experiment.startedAt || new Date().toISOString(),
    });
  }

  /**
   * Pause an experiment
   */
  pauseExperiment(experimentId: string): void {
    const experiment = this.db.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'running') {
      throw new Error(`Cannot pause experiment in ${experiment.status} status`);
    }

    this.db.updateExperimentStatus(experimentId, 'paused');
  }

  /**
   * Complete an experiment
   */
  completeExperiment(experimentId: string, conclusion?: string): void {
    const experiment = this.db.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    // Get analysis to determine winner
    const analysis = this.statisticsService.analyzeExperiment(experimentId);

    this.db.updateExperimentStatus(experimentId, 'completed', {
      completedAt: new Date().toISOString(),
      winningVariantId: analysis.recommendedWinner || undefined,
      conclusion: conclusion || analysis.recommendationReason,
    });
  }

  /**
   * Abort an experiment
   */
  abortExperiment(experimentId: string, reason: string): void {
    this.db.updateExperimentStatus(experimentId, 'aborted', {
      completedAt: new Date().toISOString(),
      conclusion: `Aborted: ${reason}`,
    });
  }

  /**
   * Select a variant for a test run
   * Uses weighted random selection based on traffic split
   */
  selectVariant(experimentId: string, testId: string): VariantSelection {
    const experiment = this.db.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (experiment.status !== 'running') {
      throw new Error(`Experiment ${experimentId} is not running`);
    }

    // Weighted random selection
    const random = Math.random() * 100;
    let cumulative = 0;

    for (const [variantId, weight] of Object.entries(experiment.trafficSplit)) {
      cumulative += weight;
      if (random <= cumulative) {
        const variant = this.variantService.getVariant(variantId);
        if (!variant) {
          throw new Error(`Variant ${variantId} not found`);
        }

        const experimentVariant = experiment.variants.find(v => v.variantId === variantId);

        return {
          variantId,
          role: experimentVariant?.role || 'treatment',
          content: variant.content,
          targetFile: variant.targetFile,
        };
      }
    }

    // Fallback to control
    const controlVariant = experiment.variants.find(v => v.role === 'control');
    if (!controlVariant) {
      throw new Error('No control variant found');
    }

    const variant = this.variantService.getVariant(controlVariant.variantId);
    if (!variant) {
      throw new Error(`Control variant ${controlVariant.variantId} not found`);
    }

    return {
      variantId: controlVariant.variantId,
      role: 'control',
      content: variant.content,
      targetFile: variant.targetFile,
    };
  }

  /**
   * Record an experiment run
   */
  recordExperimentRun(run: Omit<ABExperimentRun, 'id'>): number {
    return this.db.saveExperimentRun(run as ABExperimentRun);
  }

  /**
   * Record a test result as an experiment run
   */
  recordTestResult(
    experimentId: string,
    runId: string,
    testId: string,
    variantSelection: VariantSelection,
    result: {
      passed: boolean;
      turnCount: number;
      durationMs: number;
      goalCompletionRate: number;
      constraintViolations: number;
      errorOccurred: boolean;
      goalsCompleted?: number;
      goalsTotal?: number;
      issuesDetected?: number;
    }
  ): number {
    const now = new Date().toISOString();

    const metrics: ExperimentMetrics = {
      testPassed: result.passed,
      goalsCompleted: result.goalsCompleted || (result.passed ? 1 : 0),
      goalsTotal: result.goalsTotal || 1,
      goalCompletionRate: result.goalCompletionRate,
      turnCount: result.turnCount,
      durationMs: result.durationMs,
      avgTurnDurationMs: result.turnCount > 0 ? result.durationMs / result.turnCount : 0,
      constraintViolations: result.constraintViolations,
      issuesDetected: result.issuesDetected || 0,
      errorCount: result.errorOccurred ? 1 : 0,
    };

    const run: ABExperimentRun = {
      experimentId,
      runId,
      testId,
      variantId: variantSelection.variantId,
      variantRole: variantSelection.role,
      startedAt: new Date(Date.now() - result.durationMs).toISOString(),
      completedAt: now,
      passed: result.passed,
      turnCount: result.turnCount,
      durationMs: result.durationMs,
      goalCompletionRate: result.goalCompletionRate,
      constraintViolations: result.constraintViolations,
      errorOccurred: result.errorOccurred,
      metrics,
    };

    return this.db.saveExperimentRun(run);
  }

  /**
   * Get an experiment by ID
   */
  getExperiment(experimentId: string): Experiment | null {
    const experiment = this.db.getExperiment(experimentId);
    return experiment ? this.mapToExperiment(experiment) : null;
  }

  /**
   * Get active (running) experiments
   */
  getActiveExperiments(): Experiment[] {
    return this.db.getExperimentsByStatus('running').map(e => this.mapToExperiment(e));
  }

  /**
   * Get all experiments with optional filters
   */
  getAllExperiments(options?: { status?: string; limit?: number }): Experiment[] {
    return this.db.getAllExperiments(options).map(e => this.mapToExperiment(e));
  }

  /**
   * Get experiments that include a specific test
   */
  getExperimentsForTest(testId: string): Experiment[] {
    return this.getAllExperiments()
      .filter(e => e.testIds.includes(testId));
  }

  /**
   * Get experiment statistics and analysis
   */
  getExperimentStats(experimentId: string): ExperimentAnalysis {
    return this.statisticsService.analyzeExperiment(experimentId);
  }

  /**
   * Check if an experiment should be concluded
   */
  shouldConcludeExperiment(experimentId: string): ConclusionRecommendation {
    return this.statisticsService.shouldConcludeExperiment(experimentId);
  }

  /**
   * Get experiment run counts per variant
   */
  getRunCounts(experimentId: string): { variantId: string; count: number; passCount: number }[] {
    return this.db.countExperimentRuns(experimentId);
  }

  /**
   * Adopt the winning variant as the new baseline
   */
  async adoptWinner(experimentId: string): Promise<boolean> {
    const experiment = this.db.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    if (!experiment.winningVariantId) {
      throw new Error('No winning variant to adopt');
    }

    // Set the winning variant as the new baseline
    this.variantService.setAsBaseline(experiment.winningVariantId);

    // Get the variant content and write it to the file
    const variant = this.variantService.getVariant(experiment.winningVariantId);
    if (variant) {
      await this.variantService.applyVariant(experiment.winningVariantId);
      // Note: This makes the change permanent. Don't call rollback.
    }

    return true;
  }

  /**
   * Get summary for display
   */
  getExperimentSummary(experimentId: string): ExperimentSummary {
    const experiment = this.db.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const runCounts = this.getRunCounts(experimentId);
    const analysis = experiment.status === 'running' || experiment.status === 'completed'
      ? this.statisticsService.analyzeExperiment(experimentId)
      : null;

    const controlRuns = runCounts.find(r =>
      experiment.variants.find(v => v.variantId === r.variantId && v.role === 'control')
    );
    const treatmentRuns = runCounts.find(r =>
      experiment.variants.find(v => v.variantId === r.variantId && v.role === 'treatment')
    );

    return {
      experimentId: experiment.experimentId,
      name: experiment.name,
      status: experiment.status,
      hypothesis: experiment.hypothesis,
      createdAt: experiment.createdAt,
      startedAt: experiment.startedAt,
      completedAt: experiment.completedAt,

      // Sample counts
      controlSamples: controlRuns?.count || 0,
      treatmentSamples: treatmentRuns?.count || 0,
      minSampleSize: experiment.minSampleSize,

      // Results (if available)
      controlPassRate: analysis?.controlPassRate,
      treatmentPassRate: analysis?.treatmentPassRate,
      passRateLift: analysis?.passRateLift,
      pValue: analysis?.passRatePValue,
      isSignificant: analysis?.isSignificant,
      recommendation: analysis?.recommendation,
      winningVariantId: experiment.winningVariantId,
      conclusion: experiment.conclusion,
    };
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private generateExperimentId(): string {
    const date = new Date().toISOString().slice(0, 10);
    const random = uuidv4().substring(0, 8);
    return `EXP-${date}-${random}`;
  }

  private mapToExperiment(abExperiment: ABExperiment): Experiment {
    return {
      experimentId: abExperiment.experimentId,
      name: abExperiment.name,
      description: abExperiment.description,
      hypothesis: abExperiment.hypothesis,
      status: abExperiment.status,
      experimentType: abExperiment.experimentType,
      variants: abExperiment.variants,
      testIds: abExperiment.testIds,
      trafficSplit: abExperiment.trafficSplit,
      minSampleSize: abExperiment.minSampleSize,
      maxSampleSize: abExperiment.maxSampleSize,
      significanceThreshold: abExperiment.significanceThreshold,
      createdAt: abExperiment.createdAt,
      startedAt: abExperiment.startedAt,
      completedAt: abExperiment.completedAt,
      winningVariantId: abExperiment.winningVariantId,
      conclusion: abExperiment.conclusion,
    };
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface ExperimentSummary {
  experimentId: string;
  name: string;
  status: string;
  hypothesis: string;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;

  controlSamples: number;
  treatmentSamples: number;
  minSampleSize: number;

  controlPassRate?: number;
  treatmentPassRate?: number;
  passRateLift?: number;
  pValue?: number;
  isSignificant?: boolean;
  recommendation?: string;
  winningVariantId?: string;
  conclusion?: string;
}

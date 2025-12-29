/**
 * Statistics Service for A/B Testing
 *
 * Provides statistical analysis for A/B test results including:
 * - Chi-square test for comparing pass rates
 * - Two-sample t-test for comparing means (turns, duration)
 * - Confidence interval calculations
 * - Effect size (Cohen's d)
 */

import { Database, ABExperimentRun } from '../../storage/database';
import type {
  VariantStats,
  ChiSquareResult,
  TTestResult,
  ExperimentAnalysis,
  ConclusionRecommendation,
} from './types';

export class StatisticsService {
  constructor(private db: Database) {}

  /**
   * Calculate statistics for a specific variant in an experiment
   */
  calculateVariantStats(experimentId: string, variantId: string): VariantStats {
    const runs = this.db.getExperimentRunsByVariant(experimentId, variantId);

    if (runs.length === 0) {
      return this.emptyStats(experimentId, variantId, 'treatment');
    }

    const passCount = runs.filter(r => r.passed).length;
    const failCount = runs.length - passCount;
    const passRate = passCount / runs.length;

    const turnCounts = runs.map(r => r.turnCount);
    const durations = runs.map(r => r.durationMs);
    const goalRates = runs.map(r => r.goalCompletionRate);
    const violations = runs.map(r => r.constraintViolations);
    const errorCount = runs.filter(r => r.errorOccurred).length;

    // Get the role from the first run
    const role = runs[0]?.variantRole || 'treatment';

    return {
      experimentId,
      variantId,
      role,
      sampleSize: runs.length,

      // Success rates
      passRate,
      passCount,
      failCount,
      avgGoalCompletionRate: this.mean(goalRates),

      // Efficiency
      avgTurnCount: this.mean(turnCounts),
      avgDurationMs: this.mean(durations),
      medianTurnCount: this.median(turnCounts),
      medianDurationMs: this.median(durations),

      // Quality
      avgConstraintViolations: this.mean(violations),
      errorRate: errorCount / runs.length,

      // Statistical measures
      passRateStdDev: this.proportionStdDev(passRate, runs.length),
      turnCountStdDev: this.stdDev(turnCounts),
      durationStdDev: this.stdDev(durations),

      // Confidence intervals
      passRateCI: this.calculateProportionCI(passCount, runs.length, 0.95),
      turnCountCI: this.calculateConfidenceInterval(turnCounts, 0.95),
    };
  }

  /**
   * Chi-square test for comparing pass rates between control and treatment
   */
  performChiSquareTest(
    control: VariantStats,
    treatment: VariantStats,
    significanceThreshold: number = 0.05
  ): ChiSquareResult {
    // Handle edge cases
    if (control.sampleSize < 2 || treatment.sampleSize < 2) {
      return {
        chiSquare: 0,
        pValue: 1,
        degreesOfFreedom: 1,
        significant: false,
      };
    }

    const controlPassed = control.passCount;
    const controlFailed = control.failCount;
    const treatmentPassed = treatment.passCount;
    const treatmentFailed = treatment.failCount;

    const total = control.sampleSize + treatment.sampleSize;
    const totalPassed = controlPassed + treatmentPassed;
    const totalFailed = controlFailed + treatmentFailed;

    // Calculate expected values
    const expectedControlPassed = (control.sampleSize * totalPassed) / total;
    const expectedControlFailed = (control.sampleSize * totalFailed) / total;
    const expectedTreatmentPassed = (treatment.sampleSize * totalPassed) / total;
    const expectedTreatmentFailed = (treatment.sampleSize * totalFailed) / total;

    // Avoid division by zero
    if (
      expectedControlPassed === 0 ||
      expectedControlFailed === 0 ||
      expectedTreatmentPassed === 0 ||
      expectedTreatmentFailed === 0
    ) {
      return {
        chiSquare: 0,
        pValue: 1,
        degreesOfFreedom: 1,
        significant: false,
      };
    }

    // Chi-square calculation with Yates' correction for 2x2 tables
    const chiSquare =
      Math.pow(Math.abs(controlPassed - expectedControlPassed) - 0.5, 2) / expectedControlPassed +
      Math.pow(Math.abs(controlFailed - expectedControlFailed) - 0.5, 2) / expectedControlFailed +
      Math.pow(Math.abs(treatmentPassed - expectedTreatmentPassed) - 0.5, 2) / expectedTreatmentPassed +
      Math.pow(Math.abs(treatmentFailed - expectedTreatmentFailed) - 0.5, 2) / expectedTreatmentFailed;

    const pValue = this.chiSquarePValue(chiSquare, 1);

    return {
      chiSquare,
      pValue,
      degreesOfFreedom: 1,
      significant: pValue < significanceThreshold,
    };
  }

  /**
   * Two-sample t-test for comparing means (Welch's t-test)
   */
  performTTest(
    controlValues: number[],
    treatmentValues: number[],
    significanceThreshold: number = 0.05
  ): TTestResult {
    // Handle edge cases
    if (controlValues.length < 2 || treatmentValues.length < 2) {
      return {
        tStatistic: 0,
        pValue: 1,
        degreesOfFreedom: 0,
        significant: false,
        effectSize: 0,
        effectMagnitude: 'negligible',
      };
    }

    const n1 = controlValues.length;
    const n2 = treatmentValues.length;
    const mean1 = this.mean(controlValues);
    const mean2 = this.mean(treatmentValues);
    const var1 = this.variance(controlValues);
    const var2 = this.variance(treatmentValues);

    // Handle zero variance
    if (var1 === 0 && var2 === 0) {
      return {
        tStatistic: 0,
        pValue: 1,
        degreesOfFreedom: n1 + n2 - 2,
        significant: false,
        effectSize: 0,
        effectMagnitude: 'negligible',
      };
    }

    // Welch's t-test
    const se = Math.sqrt(var1 / n1 + var2 / n2);
    const tStatistic = se === 0 ? 0 : (mean1 - mean2) / se;

    // Welch-Satterthwaite degrees of freedom
    const numerator = Math.pow(var1 / n1 + var2 / n2, 2);
    const denominator =
      Math.pow(var1 / n1, 2) / (n1 - 1) + Math.pow(var2 / n2, 2) / (n2 - 1);
    const df = denominator === 0 ? n1 + n2 - 2 : numerator / denominator;

    const pValue = this.tTestPValue(Math.abs(tStatistic), df);

    // Effect size (Cohen's d)
    const pooledStd = Math.sqrt(((n1 - 1) * var1 + (n2 - 1) * var2) / (n1 + n2 - 2));
    const effectSize = pooledStd === 0 ? 0 : (mean1 - mean2) / pooledStd;

    return {
      tStatistic,
      pValue,
      degreesOfFreedom: df,
      significant: pValue < significanceThreshold,
      effectSize,
      effectMagnitude: this.interpretEffectSize(Math.abs(effectSize)),
    };
  }

  /**
   * Calculate confidence interval for a mean
   */
  calculateConfidenceInterval(values: number[], confidence: number = 0.95): { lower: number; upper: number } {
    if (values.length < 2) {
      const val = values.length === 1 ? values[0] : 0;
      return { lower: val, upper: val };
    }

    const mean = this.mean(values);
    const se = this.stdDev(values) / Math.sqrt(values.length);
    const tCritical = this.tCriticalValue(values.length - 1, confidence);

    return {
      lower: mean - tCritical * se,
      upper: mean + tCritical * se,
    };
  }

  /**
   * Calculate confidence interval for a proportion (Wilson score interval)
   */
  calculateProportionCI(successes: number, total: number, confidence: number = 0.95): { lower: number; upper: number } {
    if (total === 0) {
      return { lower: 0, upper: 0 };
    }

    const p = successes / total;
    const z = this.zCriticalValue(confidence);

    // Wilson score interval
    const denominator = 1 + z * z / total;
    const center = (p + z * z / (2 * total)) / denominator;
    const margin = (z / denominator) * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total));

    return {
      lower: Math.max(0, center - margin),
      upper: Math.min(1, center + margin),
    };
  }

  /**
   * Calculate required sample size for detecting a given effect
   */
  calculateRequiredSampleSize(
    baselineRate: number,
    minDetectableEffect: number,
    alpha: number = 0.05,
    power: number = 0.8
  ): number {
    const p1 = baselineRate;
    const p2 = baselineRate + minDetectableEffect;
    const pBar = (p1 + p2) / 2;

    const zAlpha = this.zCriticalValue(1 - alpha / 2);
    const zBeta = this.zCriticalValue(power);

    const numerator = Math.pow(
      zAlpha * Math.sqrt(2 * pBar * (1 - pBar)) + zBeta * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2)),
      2
    );
    const denominator = Math.pow(p1 - p2, 2);

    return Math.ceil(numerator / denominator);
  }

  /**
   * Comprehensive experiment analysis
   */
  analyzeExperiment(experimentId: string): ExperimentAnalysis {
    const experiment = this.db.getExperiment(experimentId);
    if (!experiment) {
      throw new Error(`Experiment ${experimentId} not found`);
    }

    const controlVariant = experiment.variants.find(v => v.role === 'control');
    const treatmentVariant = experiment.variants.find(v => v.role === 'treatment');

    if (!controlVariant || !treatmentVariant) {
      throw new Error('Experiment must have both control and treatment variants');
    }

    const controlStats = this.calculateVariantStats(experimentId, controlVariant.variantId);
    const treatmentStats = this.calculateVariantStats(experimentId, treatmentVariant.variantId);

    // Perform statistical tests
    const chiSquareResult = this.performChiSquareTest(controlStats, treatmentStats, experiment.significanceThreshold);

    const controlTurns = this.db.getExperimentRunsByVariant(experimentId, controlVariant.variantId).map(r => r.turnCount);
    const treatmentTurns = this.db.getExperimentRunsByVariant(experimentId, treatmentVariant.variantId).map(r => r.turnCount);
    const tTestResult = this.performTTest(controlTurns, treatmentTurns, experiment.significanceThreshold);

    // Calculate differences
    const passRateDifference = treatmentStats.passRate - controlStats.passRate;
    const passRateLift = controlStats.passRate === 0 ? 0 : (passRateDifference / controlStats.passRate) * 100;
    const turnsDifference = treatmentStats.avgTurnCount - controlStats.avgTurnCount;

    // Determine winner and recommendation
    const isSignificant = chiSquareResult.significant;
    let recommendedWinner: string | null = null;
    let recommendation: 'continue' | 'adopt-treatment' | 'keep-control' | 'no-difference' = 'continue';
    let recommendationReason = '';

    if (isSignificant) {
      if (passRateDifference > 0) {
        recommendedWinner = treatmentVariant.variantId;
        recommendation = 'adopt-treatment';
        recommendationReason = `Treatment has ${passRateLift.toFixed(1)}% higher pass rate with statistical significance (p=${chiSquareResult.pValue.toFixed(4)})`;
      } else if (passRateDifference < 0) {
        recommendedWinner = controlVariant.variantId;
        recommendation = 'keep-control';
        recommendationReason = `Control has ${Math.abs(passRateLift).toFixed(1)}% higher pass rate with statistical significance (p=${chiSquareResult.pValue.toFixed(4)})`;
      }
    } else {
      if (controlStats.sampleSize >= experiment.minSampleSize && treatmentStats.sampleSize >= experiment.minSampleSize) {
        recommendation = 'no-difference';
        recommendationReason = `No statistically significant difference detected (p=${chiSquareResult.pValue.toFixed(4)}). Min sample size reached.`;
      } else {
        recommendation = 'continue';
        recommendationReason = `Insufficient samples. Control: ${controlStats.sampleSize}/${experiment.minSampleSize}, Treatment: ${treatmentStats.sampleSize}/${experiment.minSampleSize}`;
      }
    }

    return {
      experimentId,
      status: experiment.status,

      controlSampleSize: controlStats.sampleSize,
      treatmentSampleSize: treatmentStats.sampleSize,
      totalSampleSize: controlStats.sampleSize + treatmentStats.sampleSize,

      controlPassRate: controlStats.passRate,
      treatmentPassRate: treatmentStats.passRate,
      passRateDifference,
      passRateLift,

      controlAvgTurns: controlStats.avgTurnCount,
      treatmentAvgTurns: treatmentStats.avgTurnCount,
      turnsDifference,

      passRatePValue: chiSquareResult.pValue,
      passRateSignificant: chiSquareResult.significant,
      turnsCountPValue: tTestResult.pValue,
      turnsCountSignificant: tTestResult.significant,

      passRateEffectSize: this.calculatePassRateEffectSize(controlStats, treatmentStats),
      turnsEffectSize: tTestResult.effectSize,

      isSignificant,
      recommendedWinner,
      confidenceLevel: 1 - chiSquareResult.pValue,
      recommendation,
      recommendationReason,

      controlStats,
      treatmentStats,
    };
  }

  /**
   * Recommend whether to conclude an experiment
   */
  shouldConcludeExperiment(experimentId: string): ConclusionRecommendation {
    const experiment = this.db.getExperiment(experimentId);
    if (!experiment) {
      return {
        shouldConclude: false,
        reason: 'continue',
        message: 'Experiment not found',
      };
    }

    const analysis = this.analyzeExperiment(experimentId);

    // Check if max sample size reached
    if (
      analysis.controlSampleSize >= experiment.maxSampleSize ||
      analysis.treatmentSampleSize >= experiment.maxSampleSize
    ) {
      return {
        shouldConclude: true,
        reason: 'max-sample-reached',
        winningVariantId: analysis.recommendedWinner || undefined,
        winningRole: analysis.recommendedWinner
          ? experiment.variants.find(v => v.variantId === analysis.recommendedWinner)?.role
          : undefined,
        confidence: analysis.confidenceLevel,
        message: `Maximum sample size reached. ${analysis.recommendationReason}`,
      };
    }

    // Check if significance achieved with min samples
    if (
      analysis.isSignificant &&
      analysis.controlSampleSize >= experiment.minSampleSize &&
      analysis.treatmentSampleSize >= experiment.minSampleSize
    ) {
      return {
        shouldConclude: true,
        reason: 'significance-achieved',
        winningVariantId: analysis.recommendedWinner || undefined,
        winningRole: analysis.recommendedWinner
          ? experiment.variants.find(v => v.variantId === analysis.recommendedWinner)?.role
          : undefined,
        confidence: analysis.confidenceLevel,
        message: `Statistical significance achieved. ${analysis.recommendationReason}`,
      };
    }

    // Check if min samples reached but no significance (may indicate no real difference)
    if (
      !analysis.isSignificant &&
      analysis.controlSampleSize >= experiment.minSampleSize * 2 &&
      analysis.treatmentSampleSize >= experiment.minSampleSize * 2
    ) {
      return {
        shouldConclude: true,
        reason: 'no-difference',
        message: `Double minimum samples collected with no significant difference. Consider keeping control.`,
      };
    }

    return {
      shouldConclude: false,
      reason: 'continue',
      message: analysis.recommendationReason,
    };
  }

  // ============================================================================
  // HELPER METHODS
  // ============================================================================

  private mean(values: number[]): number {
    if (values.length === 0) return 0;
    return values.reduce((sum, v) => sum + v, 0) / values.length;
  }

  private median(values: number[]): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  private variance(values: number[]): number {
    if (values.length < 2) return 0;
    const avg = this.mean(values);
    return values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) / (values.length - 1);
  }

  private stdDev(values: number[]): number {
    return Math.sqrt(this.variance(values));
  }

  private proportionStdDev(p: number, n: number): number {
    if (n === 0) return 0;
    return Math.sqrt(p * (1 - p) / n);
  }

  /**
   * Approximate chi-square p-value using Wilson-Hilferty transformation
   */
  private chiSquarePValue(chiSquare: number, df: number): number {
    if (chiSquare <= 0) return 1;

    // Wilson-Hilferty approximation
    const term1 = Math.pow(chiSquare / df, 1 / 3);
    const term2 = 1 - 2 / (9 * df);
    const term3 = Math.sqrt(2 / (9 * df));

    const z = (term1 - term2) / term3;

    // Convert z to p-value using normal CDF approximation
    return 1 - this.normalCDF(z);
  }

  /**
   * Approximate t-test p-value (two-tailed)
   */
  private tTestPValue(tStatistic: number, df: number): number {
    if (df <= 0) return 1;

    // For large df, t-distribution approaches normal
    if (df > 100) {
      return 2 * (1 - this.normalCDF(tStatistic));
    }

    // Approximation using the incomplete beta function
    const x = df / (df + tStatistic * tStatistic);
    const a = df / 2;
    const b = 0.5;

    // Regularized incomplete beta function approximation
    const beta = this.incompleteBeta(x, a, b);
    return beta;
  }

  /**
   * Standard normal CDF approximation (Abramowitz and Stegun)
   */
  private normalCDF(z: number): number {
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = z < 0 ? -1 : 1;
    z = Math.abs(z) / Math.sqrt(2);

    const t = 1.0 / (1.0 + p * z);
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-z * z);

    return 0.5 * (1.0 + sign * y);
  }

  /**
   * Incomplete beta function approximation
   */
  private incompleteBeta(x: number, a: number, b: number): number {
    if (x === 0) return 0;
    if (x === 1) return 1;

    // Use continued fraction expansion for better accuracy
    const bt =
      x === 0 || x === 1
        ? 0
        : Math.exp(
            this.logGamma(a + b) -
              this.logGamma(a) -
              this.logGamma(b) +
              a * Math.log(x) +
              b * Math.log(1 - x)
          );

    if (x < (a + 1) / (a + b + 2)) {
      return (bt * this.betaContinuedFraction(x, a, b)) / a;
    }
    return 1 - (bt * this.betaContinuedFraction(1 - x, b, a)) / b;
  }

  private betaContinuedFraction(x: number, a: number, b: number): number {
    const maxIterations = 100;
    const epsilon = 1e-10;

    let c = 1;
    let d = 1 - ((a + b) * x) / (a + 1);
    if (Math.abs(d) < epsilon) d = epsilon;
    d = 1 / d;
    let result = d;

    for (let m = 1; m <= maxIterations; m++) {
      const m2 = 2 * m;

      // Even step
      let aa = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2));
      d = 1 + aa * d;
      if (Math.abs(d) < epsilon) d = epsilon;
      c = 1 + aa / c;
      if (Math.abs(c) < epsilon) c = epsilon;
      d = 1 / d;
      result *= d * c;

      // Odd step
      aa = -((a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1));
      d = 1 + aa * d;
      if (Math.abs(d) < epsilon) d = epsilon;
      c = 1 + aa / c;
      if (Math.abs(c) < epsilon) c = epsilon;
      d = 1 / d;
      const delta = d * c;
      result *= delta;

      if (Math.abs(delta - 1) < epsilon) break;
    }

    return result;
  }

  private logGamma(x: number): number {
    // Lanczos approximation
    const g = 7;
    const c = [
      0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
      -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
      1.5056327351493116e-7,
    ];

    if (x < 0.5) {
      return Math.log(Math.PI / Math.sin(Math.PI * x)) - this.logGamma(1 - x);
    }

    x -= 1;
    let sum = c[0];
    for (let i = 1; i < g + 2; i++) {
      sum += c[i] / (x + i);
    }

    const t = x + g + 0.5;
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(sum);
  }

  /**
   * Critical value for t-distribution (two-tailed)
   */
  private tCriticalValue(df: number, confidence: number): number {
    // Approximation using normal distribution for large df
    if (df > 100) {
      return this.zCriticalValue(confidence);
    }

    // Lookup table for common values
    const alpha = 1 - confidence;
    if (alpha === 0.05) {
      if (df <= 10) {
        const table = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228];
        return table[df - 1] || 2.228;
      }
      if (df <= 30) return 2.042;
      return 1.96;
    }

    // Fall back to normal approximation
    return this.zCriticalValue(confidence);
  }

  /**
   * Critical value for standard normal (z-score)
   */
  private zCriticalValue(confidence: number): number {
    const alpha = 1 - confidence;
    const p = 1 - alpha / 2;

    // Approximation of inverse normal CDF
    const a = [
      -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
      1.383577518672690e2, -3.066479806614716e1, 2.506628277459239e0,
    ];
    const b = [
      -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
      6.680131188771972e1, -1.328068155288572e1,
    ];
    const c = [
      -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e0,
      -2.549732539343734e0, 4.374664141464968e0, 2.938163982698783e0,
    ];
    const d = [
      7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e0, 3.754408661907416e0,
    ];

    const pLow = 0.02425;
    const pHigh = 1 - pLow;

    let q: number;
    let r: number;

    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (
        (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
        ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
      );
    }

    if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (
        ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
        (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
      );
    }

    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }

  /**
   * Interpret Cohen's d effect size
   */
  private interpretEffectSize(d: number): 'negligible' | 'small' | 'medium' | 'large' {
    if (d < 0.2) return 'negligible';
    if (d < 0.5) return 'small';
    if (d < 0.8) return 'medium';
    return 'large';
  }

  /**
   * Calculate effect size for pass rate difference (Cohen's h)
   */
  private calculatePassRateEffectSize(control: VariantStats, treatment: VariantStats): number {
    const phi1 = 2 * Math.asin(Math.sqrt(control.passRate));
    const phi2 = 2 * Math.asin(Math.sqrt(treatment.passRate));
    return phi2 - phi1;
  }

  private emptyStats(experimentId: string, variantId: string, role: 'control' | 'treatment'): VariantStats {
    return {
      experimentId,
      variantId,
      role,
      sampleSize: 0,
      passRate: 0,
      passCount: 0,
      failCount: 0,
      avgGoalCompletionRate: 0,
      avgTurnCount: 0,
      avgDurationMs: 0,
      medianTurnCount: 0,
      medianDurationMs: 0,
      avgConstraintViolations: 0,
      errorRate: 0,
      passRateStdDev: 0,
      turnCountStdDev: 0,
      durationStdDev: 0,
      passRateCI: { lower: 0, upper: 0 },
      turnCountCI: { lower: 0, upper: 0 },
    };
  }
}

/**
 * Adaptive Concurrency Manager
 *
 * Dynamically adjusts concurrency based on API response times.
 * - Increases workers when response times are low (API is healthy)
 * - Decreases workers when response times are high (API is stressed)
 * - Uses exponential moving average for smooth adjustments
 */

import { EventEmitter } from 'events';

export interface ConcurrencyConfig {
  initialConcurrency: number;
  minConcurrency: number;
  maxConcurrency: number;
  targetLatencyMs: number;      // Target average response time
  scaleUpThresholdMs: number;   // Scale up if below this
  scaleDownThresholdMs: number; // Scale down if above this
  windowSize: number;           // Number of samples for moving average
  cooldownMs: number;           // Minimum time between adjustments
  enabled: boolean;             // Feature flag
}

export interface ConcurrencyStats {
  currentConcurrency: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  sampleCount: number;
  adjustmentCount: number;
  lastAdjustment: string | null;
  enabled: boolean;
}

const DEFAULT_CONFIG: ConcurrencyConfig = {
  initialConcurrency: 3,
  minConcurrency: 1,
  maxConcurrency: 20,
  targetLatencyMs: 3000,      // 3 seconds target
  scaleUpThresholdMs: 2000,   // Scale up if avg is below 2s
  scaleDownThresholdMs: 5000, // Scale down if avg is above 5s
  windowSize: 10,             // Rolling window of 10 samples
  cooldownMs: 30000,          // 30 seconds between adjustments
  enabled: true,
};

export class AdaptiveConcurrencyManager extends EventEmitter {
  private config: ConcurrencyConfig;
  private currentConcurrency: number;
  private latencySamples: number[] = [];
  private lastAdjustmentTime: number = 0;
  private adjustmentCount: number = 0;
  private minLatency: number = Infinity;
  private maxLatency: number = 0;

  constructor(config: Partial<ConcurrencyConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.currentConcurrency = this.config.initialConcurrency;
  }

  /**
   * Record a response latency sample
   */
  recordLatency(latencyMs: number): void {
    if (!this.config.enabled) return;

    this.latencySamples.push(latencyMs);

    // Maintain window size
    if (this.latencySamples.length > this.config.windowSize) {
      this.latencySamples.shift();
    }

    // Track min/max
    this.minLatency = Math.min(this.minLatency, latencyMs);
    this.maxLatency = Math.max(this.maxLatency, latencyMs);

    // Check if we should adjust
    this.maybeAdjust();
  }

  /**
   * Check and adjust concurrency based on current metrics
   */
  private maybeAdjust(): void {
    const now = Date.now();

    // Check cooldown
    if (now - this.lastAdjustmentTime < this.config.cooldownMs) {
      return;
    }

    // Need enough samples
    if (this.latencySamples.length < Math.min(3, this.config.windowSize)) {
      return;
    }

    const avgLatency = this.getAverageLatency();
    const previousConcurrency = this.currentConcurrency;

    // Scale up if latency is low (API is healthy)
    if (avgLatency < this.config.scaleUpThresholdMs && this.currentConcurrency < this.config.maxConcurrency) {
      this.currentConcurrency = Math.min(this.currentConcurrency + 1, this.config.maxConcurrency);
    }
    // Scale down if latency is high (API is stressed)
    else if (avgLatency > this.config.scaleDownThresholdMs && this.currentConcurrency > this.config.minConcurrency) {
      this.currentConcurrency = Math.max(this.currentConcurrency - 1, this.config.minConcurrency);
    }

    // If we adjusted, record it
    if (this.currentConcurrency !== previousConcurrency) {
      this.lastAdjustmentTime = now;
      this.adjustmentCount++;

      const direction = this.currentConcurrency > previousConcurrency ? 'up' : 'down';
      console.log(
        `[Adaptive Concurrency] Scaled ${direction}: ${previousConcurrency} → ${this.currentConcurrency} ` +
        `(avg latency: ${avgLatency.toFixed(0)}ms)`
      );

      this.emit('concurrency-changed', {
        previous: previousConcurrency,
        current: this.currentConcurrency,
        avgLatency,
        direction,
      });
    }
  }

  /**
   * Get the current recommended concurrency
   */
  getConcurrency(): number {
    return this.currentConcurrency;
  }

  /**
   * Get the average latency from the sample window
   */
  getAverageLatency(): number {
    if (this.latencySamples.length === 0) return 0;
    return this.latencySamples.reduce((a, b) => a + b, 0) / this.latencySamples.length;
  }

  /**
   * Get current stats
   */
  getStats(): ConcurrencyStats {
    return {
      currentConcurrency: this.currentConcurrency,
      avgLatencyMs: this.getAverageLatency(),
      minLatencyMs: this.minLatency === Infinity ? 0 : this.minLatency,
      maxLatencyMs: this.maxLatency,
      sampleCount: this.latencySamples.length,
      adjustmentCount: this.adjustmentCount,
      lastAdjustment: this.lastAdjustmentTime > 0 ? new Date(this.lastAdjustmentTime).toISOString() : null,
      enabled: this.config.enabled,
    };
  }

  /**
   * Reset stats (useful between test runs)
   */
  reset(): void {
    this.latencySamples = [];
    this.minLatency = Infinity;
    this.maxLatency = 0;
    this.adjustmentCount = 0;
    this.lastAdjustmentTime = 0;
    // Keep current concurrency for continuity between runs
  }

  /**
   * Force set concurrency (for manual override)
   */
  setConcurrency(value: number): void {
    const bounded = Math.max(this.config.minConcurrency, Math.min(value, this.config.maxConcurrency));
    if (bounded !== this.currentConcurrency) {
      const previous = this.currentConcurrency;
      this.currentConcurrency = bounded;
      this.lastAdjustmentTime = Date.now();
      console.log(`[Adaptive Concurrency] Manual set: ${previous} → ${bounded}`);
      this.emit('concurrency-changed', {
        previous,
        current: bounded,
        avgLatency: this.getAverageLatency(),
        direction: 'manual',
      });
    }
  }

  /**
   * Enable/disable adaptive scaling
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
    console.log(`[Adaptive Concurrency] ${enabled ? 'Enabled' : 'Disabled'}`);
  }

  /**
   * Check if adaptive scaling should add more workers
   * Used by the worker pool to decide whether to spawn new workers
   */
  shouldAddWorker(currentWorkerCount: number): boolean {
    if (!this.config.enabled) return false;
    return currentWorkerCount < this.currentConcurrency;
  }

  /**
   * Check if adaptive scaling should remove workers
   * Workers will gracefully exit after completing their current task
   */
  shouldRemoveWorker(currentWorkerCount: number): boolean {
    if (!this.config.enabled) return false;
    return currentWorkerCount > this.currentConcurrency;
  }
}

// Singleton instance for shared use
let sharedInstance: AdaptiveConcurrencyManager | null = null;

export function getAdaptiveConcurrencyManager(config?: Partial<ConcurrencyConfig>): AdaptiveConcurrencyManager {
  if (!sharedInstance) {
    sharedInstance = new AdaptiveConcurrencyManager(config);
  }
  return sharedInstance;
}

export function resetAdaptiveConcurrencyManager(): void {
  if (sharedInstance) {
    sharedInstance.reset();
  }
}

/**
 * A/B Testing Framework
 *
 * This module provides a selective A/B testing system for comparing variants of:
 * - Prompts (system prompts, analysis prompts)
 * - Tool JSON files (scheduling tool, patient tool)
 * - Configuration parameters (models, temperatures)
 *
 * Key features:
 * - Selective triggering: Only tests high-impact changes
 * - Statistical analysis: Chi-square and t-tests for significance
 * - Semi-automatic workflow: System suggests, user approves
 * - Agile iteration: Analyze → test → iterate
 */

// Types
export * from './types';

// Services
export { StatisticsService } from './statistics-service';
export { VariantService } from './variant-service';
export { TriggerService, type PassRateAlert } from './trigger-service';
export { ExperimentService, type ExperimentSummary } from './experiment-service';

// Re-export database types for convenience
export type {
  ABVariant,
  ABExperiment,
  ABExperimentRun,
  ABExperimentTrigger,
} from '../../storage/database';

// Factory function to create all A/B testing services
import { Database } from '../../storage/database';
import { StatisticsService } from './statistics-service';
import { VariantService } from './variant-service';
import { TriggerService } from './trigger-service';
import { ExperimentService } from './experiment-service';

export interface ABTestingServices {
  statisticsService: StatisticsService;
  variantService: VariantService;
  triggerService: TriggerService;
  experimentService: ExperimentService;
}

/**
 * Create all A/B testing services with shared database connection
 */
export function createABTestingServices(db: Database): ABTestingServices {
  const variantService = new VariantService(db);
  const statisticsService = new StatisticsService(db);
  const triggerService = new TriggerService(db);
  const experimentService = new ExperimentService(db, variantService);

  return {
    statisticsService,
    variantService,
    triggerService,
    experimentService,
  };
}

/**
 * Singleton instance for shared access
 */
let abTestingServices: ABTestingServices | null = null;

export function getABTestingServices(db: Database): ABTestingServices {
  if (!abTestingServices) {
    abTestingServices = createABTestingServices(db);
  }
  return abTestingServices;
}

export function resetABTestingServices(): void {
  abTestingServices = null;
}

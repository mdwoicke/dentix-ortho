/**
 * Test Scenarios Registry
 * Exports all test scenarios
 */

import { TestCase } from '../test-case';
import { happyPathScenarios } from './happy-path';
import { edgeCaseScenarios } from './edge-cases';
import { errorHandlingScenarios } from './error-handling';
import { chordHappyPathScenarios } from './chord-happy-path';

// Combine all scenarios
export const allScenarios: TestCase[] = [
  ...happyPathScenarios,
  ...edgeCaseScenarios,
  ...errorHandlingScenarios,
  ...chordHappyPathScenarios,
];

// Export by category for filtering
export const scenariosByCategory = {
  'happy-path': happyPathScenarios,
  'edge-case': edgeCaseScenarios,
  'error-handling': errorHandlingScenarios,
  'chord-happy-path': chordHappyPathScenarios,
};

// Export individual collections
export { happyPathScenarios, edgeCaseScenarios, errorHandlingScenarios, chordHappyPathScenarios };

// Get scenario by ID
export function getScenarioById(id: string): TestCase | undefined {
  return allScenarios.find(s => s.id === id);
}

// Get scenarios by tag
export function getScenariosByTag(tag: string): TestCase[] {
  return allScenarios.filter(s => s.tags.includes(tag));
}

// Get scenario summary
export function getScenarioSummary(): { total: number; byCategory: Record<string, number> } {
  return {
    total: allScenarios.length,
    byCategory: {
      'happy-path': happyPathScenarios.length,
      'edge-case': edgeCaseScenarios.length,
      'error-handling': errorHandlingScenarios.length,
    },
  };
}

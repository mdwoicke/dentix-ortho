/**
 * Tool Sequence Mapper Service
 *
 * Maps expected tool call sequences for each caller intent type,
 * then compares against actual observations to determine completion status.
 */

import type { CallerIntent, CallerIntentType } from './callerIntentClassifier';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type OccurrenceType = 'once' | 'per_child';

export interface ExpectedStep {
  toolName: string;
  action?: string;
  description: string;
  occurrences: OccurrenceType;
  optional?: boolean;
}

export type StepStatusValue = 'completed' | 'failed' | 'missing';

export interface StepStatus {
  step: ExpectedStep;
  status: StepStatusValue;
  actualCount: number;
  expectedCount: number;
  observationIds: string[];
  errors: string[];
}

export interface ToolSequenceResult {
  expectedSteps: ExpectedStep[];
  stepStatuses: StepStatus[];
  completionRate: number;
}

// ============================================================================
// EXPECTED SEQUENCES
// ============================================================================

const BOOKING_SEQUENCE: ExpectedStep[] = [
  { toolName: 'current_date_time', description: 'Get current date/time', occurrences: 'once' },
  { toolName: 'chord_ortho_patient', action: 'lookup', description: 'Patient lookup', occurrences: 'once' },
  { toolName: 'schedule_appointment_ortho', action: 'slots', description: 'Fetch available slots', occurrences: 'per_child' },
  { toolName: 'chord_ortho_patient', action: 'create_patient', description: 'Create new patient', occurrences: 'per_child', optional: true },
  { toolName: 'schedule_appointment_ortho', action: 'book_child', description: 'Book appointment', occurrences: 'per_child' },
];

const RESCHEDULING_SEQUENCE: ExpectedStep[] = [
  { toolName: 'current_date_time', description: 'Get current date/time', occurrences: 'once' },
  { toolName: 'chord_ortho_patient', action: 'lookup', description: 'Patient lookup', occurrences: 'once' },
  { toolName: 'schedule_appointment_ortho', action: 'slots', description: 'Fetch available slots', occurrences: 'once' },
  { toolName: 'schedule_appointment_ortho', action: 'cancel', description: 'Cancel existing appointment', occurrences: 'once' },
  { toolName: 'schedule_appointment_ortho', action: 'book_child', description: 'Book new appointment', occurrences: 'once' },
];

const CANCELLATION_SEQUENCE: ExpectedStep[] = [
  { toolName: 'chord_ortho_patient', action: 'lookup', description: 'Patient lookup', occurrences: 'once' },
  { toolName: 'schedule_appointment_ortho', action: 'cancel', description: 'Cancel appointment', occurrences: 'once' },
];

const INFO_LOOKUP_SEQUENCE: ExpectedStep[] = [
  { toolName: 'chord_ortho_patient', action: 'lookup', description: 'Patient lookup', occurrences: 'once' },
];

const SEQUENCE_MAP: Record<CallerIntentType, ExpectedStep[]> = {
  booking: BOOKING_SEQUENCE,
  rescheduling: RESCHEDULING_SEQUENCE,
  cancellation: CANCELLATION_SEQUENCE,
  info_lookup: INFO_LOOKUP_SEQUENCE,
};

// ============================================================================
// PUBLIC FUNCTIONS
// ============================================================================

/**
 * Get the expected tool call sequence for a given caller intent.
 */
export function getExpectedSequence(intent: CallerIntent): ExpectedStep[] {
  return SEQUENCE_MAP[intent.type] || INFO_LOOKUP_SEQUENCE;
}

/**
 * Map actual observations against expected tool sequence to determine completion.
 */
export function mapToolSequence(intent: CallerIntent, observations: any[]): ToolSequenceResult {
  const expectedSteps = getExpectedSequence(intent);
  const childCount = intent.bookingDetails?.childCount || 1;

  const stepStatuses: StepStatus[] = expectedSteps.map((step) => {
    const expectedCount = step.occurrences === 'per_child' ? childCount : 1;

    // Find matching observations
    const matching = observations.filter((obs) => {
      if (obs.name !== step.toolName) return false;

      // If step has an action, check the observation input for that action
      if (step.action) {
        const input = parseObservationInput(obs.input);
        if (input?.action !== step.action) return false;
      }

      return true;
    });

    // Detect errors in matching observations
    const errors: string[] = [];
    const observationIds: string[] = [];
    let failedCount = 0;

    for (const obs of matching) {
      const obsId = obs.observation_id || obs.id || 'unknown';
      observationIds.push(obsId);

      if (isObservationError(obs)) {
        failedCount++;
        const errorMsg = extractErrorMessage(obs);
        if (errorMsg) {
          errors.push(`${obsId}: ${errorMsg}`);
        }
      }
    }

    const successCount = matching.length - failedCount;

    // Determine status
    let status: StepStatusValue;
    if (matching.length === 0) {
      status = 'missing';
    } else if (failedCount > 0 && successCount < expectedCount) {
      status = 'failed';
    } else {
      status = 'completed';
    }

    return {
      step,
      status,
      actualCount: matching.length,
      expectedCount,
      observationIds,
      errors,
    };
  });

  // Calculate completion rate (exclude optional missing steps)
  const requiredSteps = stepStatuses.filter((s) => !s.step.optional || s.status !== 'missing');
  const completedSteps = requiredSteps.filter((s) => s.status === 'completed');
  const completionRate = requiredSteps.length > 0
    ? completedSteps.length / requiredSteps.length
    : 0;

  return {
    expectedSteps,
    stepStatuses,
    completionRate,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Parse observation input to extract action field.
 */
function parseObservationInput(input: any): any {
  if (!input) return null;

  try {
    if (typeof input === 'string') {
      return JSON.parse(input);
    }
    return input;
  } catch {
    return null;
  }
}

/**
 * Check if an observation represents an error.
 */
function isObservationError(obs: any): boolean {
  if (obs.level === 'ERROR') return true;

  const output = typeof obs.output === 'string' ? obs.output : JSON.stringify(obs.output || '');
  if (output.includes('"success":false') || output.includes('"success": false')) return true;
  if (output.includes('_debug_error')) return true;

  return false;
}

/**
 * Extract a human-readable error message from an observation.
 */
function extractErrorMessage(obs: any): string | null {
  try {
    const output = typeof obs.output === 'string' ? JSON.parse(obs.output) : obs.output;
    if (output?.error) return output.error;
    if (output?.message) return output.message;
    if (output?._debug_error) return output._debug_error;
    if (obs.statusMessage) return obs.statusMessage;
  } catch {
    // Fall through
  }

  if (obs.level === 'ERROR') return 'Observation marked as ERROR';
  return null;
}

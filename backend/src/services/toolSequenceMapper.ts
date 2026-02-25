/**
 * Tool Sequence Mapper Service
 *
 * Maps expected tool call sequences for each caller intent type,
 * then compares against actual observations to determine completion status.
 */

import type { CallerIntent, CallerIntentType } from './callerIntentClassifier';
import type { ToolNames } from './toolNameResolver';
import { getDefaultToolNames } from './toolNameResolver';

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

// Action aliases: map canonical action names to all observed variants
const ACTION_ALIASES: Record<string, string[]> = {
  slots: ['slots', 'grouped_slots', 'get_slots'],
  lookup: ['lookup', 'clinic_info', 'patient_lookup'],
  book_child: ['book_child', 'book_appointment'],
  create_patient: ['create_patient', 'new_patient'],
  cancel: ['cancel', 'cancel_appointment'],
};

/** Build tool sequences dynamically from resolved tool names */
function buildSequences(tools: ToolNames): Record<CallerIntentType, ExpectedStep[]> {
  return {
    booking: [
      { toolName: tools.dateTimeTool, description: 'Get current date/time', occurrences: 'once' },
      { toolName: tools.patientTool, action: 'lookup', description: 'Patient lookup', occurrences: 'once' },
      { toolName: tools.schedulingTool, action: 'slots', description: 'Fetch available slots', occurrences: 'per_child' },
      { toolName: tools.patientTool, action: 'create_patient', description: 'Create new patient', occurrences: 'per_child', optional: true },
      { toolName: tools.schedulingTool, action: 'book_child', description: 'Book appointment', occurrences: 'per_child' },
    ],
    rescheduling: [
      { toolName: tools.dateTimeTool, description: 'Get current date/time', occurrences: 'once' },
      { toolName: tools.patientTool, action: 'lookup', description: 'Patient lookup', occurrences: 'once' },
      { toolName: tools.schedulingTool, action: 'slots', description: 'Fetch available slots', occurrences: 'once' },
      { toolName: tools.schedulingTool, action: 'cancel', description: 'Cancel existing appointment', occurrences: 'once' },
      { toolName: tools.schedulingTool, action: 'book_child', description: 'Book new appointment', occurrences: 'once' },
    ],
    cancellation: [
      { toolName: tools.patientTool, action: 'lookup', description: 'Patient lookup', occurrences: 'once' },
      { toolName: tools.schedulingTool, action: 'cancel', description: 'Cancel appointment', occurrences: 'once' },
    ],
    info_lookup: [
      { toolName: tools.patientTool, action: 'lookup', description: 'Patient lookup', occurrences: 'once' },
    ],
  };
}

// Default sequences (Ortho/Cloud9) for backward compatibility
const DEFAULT_SEQUENCE_MAP = buildSequences(getDefaultToolNames());

// ============================================================================
// PUBLIC FUNCTIONS
// ============================================================================

/**
 * Get the expected tool call sequence for a given caller intent.
 * Pass toolNames to use tenant-specific tool names (e.g., Chord vs Ortho).
 */
export function getExpectedSequence(intent: CallerIntent, toolNames?: ToolNames): ExpectedStep[] {
  const seqMap = toolNames ? buildSequences(toolNames) : DEFAULT_SEQUENCE_MAP;
  return seqMap[intent.type] || seqMap.info_lookup;
}

/**
 * Map actual observations against expected tool sequence to determine completion.
 * Pass toolNames to use tenant-specific tool names (e.g., Chord vs Ortho).
 */
export function mapToolSequence(intent: CallerIntent, observations: any[], toolNames?: ToolNames): ToolSequenceResult {
  const expectedSteps = getExpectedSequence(intent, toolNames);
  const childCount = intent.bookingDetails?.childCount || 1;

  // Pre-scan for patient creations embedded in book_child outputs
  const schedToolNames = toolNames ? toolNames.schedulingTools : undefined;
  const embeddedCreations = countEmbeddedPatientCreations(observations, schedToolNames);

  const stepStatuses: StepStatus[] = expectedSteps.map((step) => {
    const expectedCount = step.occurrences === 'per_child' ? childCount : 1;

    // Find matching observations
    const matching = observations.filter((obs) => {
      if (obs.name !== step.toolName) return false;

      // If step has an action, check the observation input for that action (with aliases)
      if (step.action) {
        const input = parseObservationInput(obs.input);
        const obsAction = input?.action;
        if (!obsAction) return false;
        const aliases = ACTION_ALIASES[step.action] || [step.action];
        if (!aliases.includes(obsAction)) return false;
      }

      return true;
    });

    // Special case: create_patient step can be satisfied by embedded creations in book_child
    if (step.action === 'create_patient' && matching.length === 0 && embeddedCreations.count > 0) {
      return {
        step,
        status: 'completed' as StepStatusValue,
        actualCount: embeddedCreations.count,
        expectedCount,
        observationIds: embeddedCreations.observationIds,
        errors: [],
      };
    }

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
 * Count patient creations embedded in book_child outputs.
 * The book_child action creates patients inline (output.children[].created: true)
 * rather than using a separate create_patient tool call.
 */
function countEmbeddedPatientCreations(observations: any[], schedulingToolNames?: string[]): { count: number; observationIds: string[] } {
  const schedNames = schedulingToolNames || ['schedule_appointment_ortho', 'chord_scheduling_v08', 'chord_scheduling_v07_dev'];
  let count = 0;
  const observationIds: string[] = [];

  for (const obs of observations) {
    // Look for scheduling tool with book_child action
    if (!schedNames.includes(obs.name)) continue;

    const input = parseObservationInput(obs.input);
    if (input?.action !== 'book_child') continue;

    const output = parseObservationInput(obs.output);
    if (!output) continue;

    const obsId = obs.observation_id || obs.id || 'unknown';
    let createdInThisObs = 0;

    // Check parent.created
    if (output.parent?.created === true) {
      createdInThisObs++;
    }

    // Check children[].created
    if (Array.isArray(output.children)) {
      for (const child of output.children) {
        if (child.created === true) {
          createdInThisObs++;
        }
      }
    }

    if (createdInThisObs > 0) {
      count += createdInThisObs;
      observationIds.push(obsId);
    }
  }

  return { count, observationIds };
}

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

  const parsed = typeof obs.output === 'string' ? (() => { try { return JSON.parse(obs.output); } catch { return null; } })() : obs.output;

  // partialSuccess means some children succeeded — not a full error
  if (parsed?.partialSuccess === true) return false;

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

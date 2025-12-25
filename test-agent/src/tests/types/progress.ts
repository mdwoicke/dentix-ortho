/**
 * Progress Tracking Types for Goal-Oriented Testing
 *
 * Tracks conversation progress toward goals.
 */

import type { CollectableField } from './goals';
import type { AgentIntent } from './intent';

/**
 * A value that has been collected during the conversation
 */
export interface CollectedValue {
  /** The field that was collected */
  field: CollectableField;

  /** The value provided by the user */
  value: any;

  /** Which turn this was collected in */
  collectedAtTurn: number;

  /** Whether the agent confirmed/acknowledged this value */
  confirmedByAgent: boolean;

  /** The user's exact response */
  userResponse?: string;
}

/**
 * An issue detected during the conversation
 */
export interface ProgressIssue {
  /** Type of issue */
  type: 'stuck' | 'repeating' | 'off_topic' | 'error' | 'timeout' | 'unknown_intent';

  /** Description of the issue */
  description: string;

  /** Turn number when issue was detected */
  turnNumber: number;

  /** Severity of the issue */
  severity: 'low' | 'medium' | 'high' | 'critical';

  /** Additional context */
  context?: Record<string, any>;
}

/**
 * Current state of conversation progress
 */
export interface ProgressState {
  // Data collection progress
  /** Fields that have been collected */
  collectedFields: Map<CollectableField, CollectedValue>;

  /** Fields still needed to complete goals */
  pendingFields: CollectableField[];

  // Goal progress
  /** IDs of completed goals */
  completedGoals: string[];

  /** IDs of goals currently being worked on */
  activeGoals: string[];

  /** IDs of goals that failed */
  failedGoals: string[];

  // Conversation state
  /** Current flow state (greeting, collecting_info, booking, etc.) */
  currentFlowState: string;

  /** Current turn number */
  turnNumber: number;

  /** Last detected agent intent */
  lastAgentIntent: AgentIntent;

  /** History of recent intents (for detecting repetition) */
  intentHistory: AgentIntent[];

  // Timing
  /** When the conversation started */
  startedAt: Date;

  /** Last activity timestamp */
  lastActivityAt: Date;

  // Issues
  /** Issues detected during the conversation */
  issues: ProgressIssue[];
}

/**
 * Summary of current progress (for reporting)
 */
export interface ProgressSummary {
  /** Number of fields collected */
  collectedCount: number;

  /** Number of fields still pending */
  pendingCount: number;

  /** Number of completed goals */
  completedGoals: number;

  /** Total number of goals */
  totalGoals: number;

  /** All detected issues */
  issues: ProgressIssue[];

  /** Current turn number */
  turnNumber: number;

  /** Percentage complete (0-100) */
  percentComplete: number;

  /** Estimated turns remaining */
  estimatedTurnsRemaining?: number;
}

/**
 * Create initial progress state
 */
export function createInitialProgressState(pendingFields: CollectableField[]): ProgressState {
  return {
    collectedFields: new Map(),
    pendingFields: [...pendingFields],
    completedGoals: [],
    activeGoals: [],
    failedGoals: [],
    currentFlowState: 'initial',
    turnNumber: 0,
    lastAgentIntent: 'greeting',
    intentHistory: [],
    startedAt: new Date(),
    lastActivityAt: new Date(),
    issues: [],
  };
}

/**
 * Check if a field has been collected
 */
export function isFieldCollected(state: ProgressState, field: CollectableField): boolean {
  return state.collectedFields.has(field);
}

/**
 * Get all missing required fields
 */
export function getMissingFields(
  state: ProgressState,
  requiredFields: CollectableField[]
): CollectableField[] {
  return requiredFields.filter(f => !state.collectedFields.has(f));
}

/**
 * Calculate progress summary
 */
export function calculateProgressSummary(
  state: ProgressState,
  totalGoals: number
): ProgressSummary {
  const collectedCount = state.collectedFields.size;
  const pendingCount = state.pendingFields.length;
  const total = collectedCount + pendingCount;

  return {
    collectedCount,
    pendingCount,
    completedGoals: state.completedGoals.length,
    totalGoals,
    issues: state.issues,
    turnNumber: state.turnNumber,
    percentComplete: total > 0 ? Math.round((collectedCount / total) * 100) : 0,
    estimatedTurnsRemaining: pendingCount > 0 ? pendingCount * 2 : 0,
  };
}

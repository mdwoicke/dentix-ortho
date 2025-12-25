/**
 * Conversation Goal Types for Goal-Oriented Testing
 *
 * Defines what a test conversation should achieve.
 */

import type { ConversationTurn } from '../test-case';

/**
 * Types of conversation goals
 */
export type GoalType =
  | 'data_collection'      // Agent collects specific data fields
  | 'booking_confirmed'    // Appointment successfully scheduled
  | 'transfer_initiated'   // Transferred to live agent (for existing patients, etc.)
  | 'error_handled'        // Error was gracefully handled
  | 'conversation_ended'   // Proper conversation closure
  | 'custom';              // Custom goal with custom criteria

/**
 * Fields that the agent should collect from the user
 */
export type CollectableField =
  | 'parent_name'
  | 'parent_name_spelling'
  | 'parent_phone'
  | 'parent_email'
  | 'child_count'
  | 'child_names'
  | 'child_dob'
  | 'is_new_patient'
  | 'previous_visit'
  | 'previous_ortho'
  | 'insurance'
  | 'special_needs'
  | 'time_preference'
  | 'location_preference'
  | 'location_confirmation';

/**
 * Context passed to goal evaluation functions
 */
export interface GoalContext {
  /** Data collected during the conversation */
  collectedData: Map<CollectableField, any>;

  /** Full conversation history */
  conversationHistory: ConversationTurn[];

  /** Whether agent confirmed a booking */
  agentConfirmedBooking: boolean;

  /** Whether agent initiated transfer to live agent */
  agentInitiatedTransfer: boolean;

  /** Number of conversation turns */
  turnCount: number;

  /** Elapsed time in milliseconds */
  elapsedTimeMs: number;

  /** Any extracted entities from agent responses */
  extractedEntities?: Record<string, any>;
}

/**
 * Result of evaluating a single goal
 */
export interface GoalResult {
  goalId: string;
  passed: boolean;
  message: string;
  details?: {
    required?: CollectableField[];
    collected?: CollectableField[];
    missing?: CollectableField[];
  };
}

/**
 * A single conversation goal
 */
export interface ConversationGoal {
  /** Unique identifier for this goal */
  id: string;

  /** Type of goal */
  type: GoalType;

  /** Human-readable description */
  description: string;

  /** For data_collection goals: which fields must be collected */
  requiredFields?: CollectableField[];

  /** Custom success criteria function */
  successCriteria?: (context: GoalContext) => boolean;

  /** Priority for ordering multiple goals (lower = higher priority) */
  priority: number;

  /** Whether this goal must be achieved for test to pass */
  required: boolean;
}

/**
 * Preset goals for common scenarios
 */
export const PRESET_GOALS = {
  /** Collect parent contact information */
  collectParentInfo: (required = true): ConversationGoal => ({
    id: 'collect-parent-info',
    type: 'data_collection',
    description: 'Agent collects parent name and contact info',
    requiredFields: ['parent_name', 'parent_phone'],
    priority: 1,
    required,
  }),

  /** Collect child information */
  collectChildInfo: (required = true): ConversationGoal => ({
    id: 'collect-child-info',
    type: 'data_collection',
    description: 'Agent collects child name and date of birth',
    requiredFields: ['child_count', 'child_names', 'child_dob'],
    priority: 2,
    required,
  }),

  /** Collect insurance information */
  collectInsurance: (required = true): ConversationGoal => ({
    id: 'collect-insurance',
    type: 'data_collection',
    description: 'Agent collects insurance information',
    requiredFields: ['insurance'],
    priority: 3,
    required,
  }),

  /** Collect patient history */
  collectHistory: (required = true): ConversationGoal => ({
    id: 'collect-history',
    type: 'data_collection',
    description: 'Agent collects visit and treatment history',
    requiredFields: ['is_new_patient', 'previous_visit', 'previous_ortho'],
    priority: 3,
    required,
  }),

  /** Booking confirmed */
  bookingConfirmed: (required = true): ConversationGoal => ({
    id: 'booking-confirmed',
    type: 'booking_confirmed',
    description: 'Agent confirms the appointment is booked',
    priority: 10,
    required,
  }),

  /** Transfer to live agent */
  transferInitiated: (required = true): ConversationGoal => ({
    id: 'transfer-initiated',
    type: 'transfer_initiated',
    description: 'Agent transfers to live agent',
    priority: 10,
    required,
  }),

  /** Conversation ended properly */
  conversationEnded: (required = false): ConversationGoal => ({
    id: 'conversation-ended',
    type: 'conversation_ended',
    description: 'Conversation ended with proper goodbye',
    priority: 11,
    required,
  }),
};

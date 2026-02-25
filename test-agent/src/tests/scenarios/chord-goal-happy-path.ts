/**
 * Chord Dental IVA Goal-Oriented Happy Path Tests
 *
 * Goal-oriented tests that adapt to IVA ordering variability.
 * These are the PRIMARY test approach since the Chord IVA shows
 * moderate variability between calls.
 *
 * Key differences from Ortho goal tests:
 * - Chord flow starts with DOB (via ANI lookup), not greeting → name
 * - ANI confirmation step is unique to Chord
 * - Parent DOB collected separately from child DOB
 * - Insurance network check with OON $99 special offer
 */

import type { GoalOrientedTestCase } from '../types/goal-test';
import type { ConversationGoal } from '../types/goals';
import { PRESET_GOALS } from '../types/goals';
import { PRESET_CONSTRAINTS } from '../types/goal-test';
import {
  CHORD_JENNIFER_SINGLE,
  CHORD_PARENT_ASTON_OON,
  CHORD_PARENT_TWO_KIDS,
  CHORD_TERSE_CALLER,
} from '../personas/chord-personas';

// ============================================================================
// CHORD-SPECIFIC GOALS
// ============================================================================

/**
 * Chord-specific goals that extend beyond the standard PRESET_GOALS
 */
const CHORD_GOALS = {
  /** Agent collects patient DOB (asked first in Chord flow) */
  collectPatientDOB: (): ConversationGoal => ({
    id: 'collect-patient-dob',
    type: 'data_collection',
    description: 'Agent collects patient date of birth (asked first in Chord flow)',
    requiredFields: ['child_dob'],
    priority: 0,
    required: true,
  }),

  /** Agent reads back caller phone from ANI and gets confirmation */
  confirmANI: (): ConversationGoal => ({
    id: 'confirm-ani',
    type: 'data_collection',
    description: 'Agent reads back caller phone from ANI and gets confirmation',
    requiredFields: ['parent_phone'],
    priority: 1,
    required: true,
  }),

  /** Agent handles out-of-network insurance disclosure */
  outOfNetworkHandled: (): ConversationGoal => ({
    id: 'out-of-network-handled',
    type: 'custom',
    description: 'Agent informs caller about out-of-network status and offers $99 special or self-pay option',
    successCriteria: (ctx) => {
      const assistantMessages = ctx.conversationHistory
        .filter(t => t.role === 'assistant')
        .map(t => t.content)
        .join(' ')
        .toLowerCase();
      return (
        /not in.?network|out of network/i.test(assistantMessages) ||
        /\$99|self.pay|special/i.test(assistantMessages)
      );
    },
    priority: 5,
    required: true,
  }),
};

// ============================================================================
// CHORD GOAL-ORIENTED HAPPY PATH TESTS
// ============================================================================

/**
 * CHORD-GOAL-HAPPY-001: New Patient Single Child
 *
 * Standard happy path with in-network insurance at Bethlehem.
 * Tests the full Chord IVA flow from DOB → booking confirmation.
 */
export const CHORD_GOAL_HAPPY_001: GoalOrientedTestCase = {
  id: 'CHORD-GOAL-HAPPY-001',
  name: 'Chord - New Patient Single Child (Goal-Based)',
  description: 'Complete new patient booking at Bethlehem using goal-oriented approach',
  category: 'happy-path',
  tags: ['chord', 'goal-based', 'booking', 'new-patient', 'single-child', 'priority-high'],

  persona: CHORD_JENNIFER_SINGLE,

  goals: [
    CHORD_GOALS.collectPatientDOB(),
    {
      ...PRESET_GOALS.collectParentInfo(),
      id: 'collect-parent-info',
      requiredFields: ['parent_name', 'parent_phone', 'parent_dob'],
    },
    CHORD_GOALS.confirmANI(),
    {
      ...PRESET_GOALS.collectChildInfo(),
      id: 'collect-child-info',
      requiredFields: ['child_names', 'child_dob'],
    },
    {
      ...PRESET_GOALS.collectInsurance(),
      id: 'collect-insurance',
    },
    {
      ...PRESET_GOALS.bookingConfirmed(),
      id: 'booking-confirmed',
      required: true,
    },
    {
      ...PRESET_GOALS.conversationEnded(),
      id: 'conversation-ended',
      required: false,
    },
  ],

  constraints: [
    PRESET_CONSTRAINTS.noErrors(),
    PRESET_CONSTRAINTS.noInternalExposure(),
    PRESET_CONSTRAINTS.maxTurns(50),
  ],

  responseConfig: {
    maxTurns: 50,
    useLlmResponses: false,
    handleUnknownIntents: 'clarify',
  },

  initialMessage: 'Hi',
};

/**
 * CHORD-GOAL-HAPPY-002: New Patient OON Insurance
 *
 * Out-of-network insurance at Aston triggers $99 special offer.
 * Same flow as 001 but adds outOfNetworkHandled goal.
 */
export const CHORD_GOAL_HAPPY_002: GoalOrientedTestCase = {
  id: 'CHORD-GOAL-HAPPY-002',
  name: 'Chord - New Patient OON Insurance (Goal-Based)',
  description: 'New patient with out-of-network insurance at Aston, tests $99 special offer',
  category: 'happy-path',
  tags: ['chord', 'goal-based', 'booking', 'new-patient', 'oon-insurance', 'aston'],

  persona: CHORD_PARENT_ASTON_OON,

  goals: [
    CHORD_GOALS.collectPatientDOB(),
    {
      ...PRESET_GOALS.collectParentInfo(),
      id: 'collect-parent-info',
      requiredFields: ['parent_name', 'parent_phone', 'parent_dob'],
    },
    CHORD_GOALS.confirmANI(),
    {
      ...PRESET_GOALS.collectChildInfo(),
      id: 'collect-child-info',
      requiredFields: ['child_names', 'child_dob'],
    },
    {
      ...PRESET_GOALS.collectInsurance(),
      id: 'collect-insurance',
    },
    CHORD_GOALS.outOfNetworkHandled(),
    {
      ...PRESET_GOALS.bookingConfirmed(),
      id: 'booking-confirmed',
      required: true,
    },
    {
      ...PRESET_GOALS.conversationEnded(),
      id: 'conversation-ended',
      required: false,
    },
  ],

  constraints: [
    PRESET_CONSTRAINTS.noErrors(),
    PRESET_CONSTRAINTS.noInternalExposure(),
    PRESET_CONSTRAINTS.maxTurns(50),
  ],

  responseConfig: {
    maxTurns: 50,
    useLlmResponses: false,
    handleUnknownIntents: 'clarify',
  },

  initialMessage: 'Hi',
};

/**
 * CHORD-GOAL-HAPPY-003: New Patient Two Siblings
 *
 * Tests multi-child booking with grouped_slots at Bethlehem.
 */
export const CHORD_GOAL_HAPPY_003: GoalOrientedTestCase = {
  id: 'CHORD-GOAL-HAPPY-003',
  name: 'Chord - New Patient Two Siblings (Goal-Based)',
  description: 'Two children booking with grouped_slots at Bethlehem',
  category: 'happy-path',
  tags: ['chord', 'goal-based', 'booking', 'new-patient', 'siblings', 'multiple-children', 'grouped-slots'],

  persona: CHORD_PARENT_TWO_KIDS,

  goals: [
    CHORD_GOALS.collectPatientDOB(),
    {
      ...PRESET_GOALS.collectParentInfo(),
      id: 'collect-parent-info',
      requiredFields: ['parent_name', 'parent_phone', 'parent_dob'],
    },
    CHORD_GOALS.confirmANI(),
    {
      ...PRESET_GOALS.collectChildInfo(),
      id: 'collect-children-info',
      description: 'Collect information for both children',
      requiredFields: ['child_count', 'child_names', 'child_dob'],
    },
    {
      ...PRESET_GOALS.collectInsurance(),
      id: 'collect-insurance',
    },
    {
      ...PRESET_GOALS.bookingConfirmed(),
      id: 'booking-confirmed',
      required: true,
    },
    {
      ...PRESET_GOALS.conversationEnded(),
      id: 'conversation-ended',
      required: false,
    },
  ],

  constraints: [
    PRESET_CONSTRAINTS.noErrors(),
    PRESET_CONSTRAINTS.noInternalExposure(),
    PRESET_CONSTRAINTS.maxTurns(50),
  ],

  responseConfig: {
    maxTurns: 50,
    useLlmResponses: false,
    handleUnknownIntents: 'clarify',
  },

  initialMessage: 'Hi',
};

/**
 * CHORD-GOAL-HAPPY-004: Terse Caller
 *
 * Tests handling of minimal responses with Aston location.
 * Caller declines email - common real-world pattern.
 */
export const CHORD_GOAL_HAPPY_004: GoalOrientedTestCase = {
  id: 'CHORD-GOAL-HAPPY-004',
  name: 'Chord - Terse Caller (Goal-Based)',
  description: 'Handle parent who gives very brief answers, declines email, Aston location',
  category: 'happy-path',
  tags: ['chord', 'goal-based', 'booking', 'terse-user', 'minimal-responses', 'aston'],

  persona: CHORD_TERSE_CALLER,

  goals: [
    CHORD_GOALS.collectPatientDOB(),
    {
      ...PRESET_GOALS.collectParentInfo(),
      id: 'collect-parent-info',
      requiredFields: ['parent_name', 'parent_phone'],
    },
    CHORD_GOALS.confirmANI(),
    {
      ...PRESET_GOALS.collectChildInfo(),
      id: 'collect-child-info',
      requiredFields: ['child_names', 'child_dob'],
    },
    {
      ...PRESET_GOALS.collectInsurance(),
      id: 'collect-insurance',
    },
    {
      ...PRESET_GOALS.bookingConfirmed(),
      id: 'booking-confirmed',
      required: true,
    },
  ],

  constraints: [
    PRESET_CONSTRAINTS.noErrors(),
    PRESET_CONSTRAINTS.noInternalExposure(),
    PRESET_CONSTRAINTS.maxTurns(50),
  ],

  responseConfig: {
    maxTurns: 50,
    useLlmResponses: false,
    handleUnknownIntents: 'clarify',
  },

  initialMessage: 'Hi',
};

// ============================================================================
// EXPORT ALL CHORD GOAL-BASED HAPPY PATH TESTS
// ============================================================================

export const chordGoalHappyPathScenarios: GoalOrientedTestCase[] = [
  CHORD_GOAL_HAPPY_001,
  CHORD_GOAL_HAPPY_002,
  CHORD_GOAL_HAPPY_003,
  CHORD_GOAL_HAPPY_004,
];

/**
 * Get a Chord goal test by ID
 */
export function getChordGoalTest(id: string): GoalOrientedTestCase | null {
  return chordGoalHappyPathScenarios.find(t => t.id === id) || null;
}

/**
 * List all Chord goal test IDs
 */
export function listChordGoalTestIds(): string[] {
  return chordGoalHappyPathScenarios.map(t => t.id);
}

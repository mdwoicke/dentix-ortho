/**
 * Goal-Oriented Happy Path Test Scenarios
 *
 * These tests define WHAT should be achieved, not the exact sequence.
 * The agent can ask questions in any order - the test adapts dynamically.
 *
 * Benefits over sequential tests:
 * - Tests pass regardless of question order
 * - Focus on outcomes (goals) rather than exact conversation flow
 * - Automatic response generation from persona data
 * - Better alignment with real-world conversation variability
 */

import type { GoalOrientedTestCase } from '../types/goal-test';
import { PRESET_GOALS } from '../types/goals';
import { PRESET_CONSTRAINTS } from '../types/goal-test';
import {
  SARAH_JOHNSON,
  MICHAEL_DAVIS,
  JANE_SMITH,
  DAVID_WILSON,
  TERSE_TOM,
} from '../personas/standard-personas';

// ============================================================================
// GOAL-ORIENTED HAPPY PATH TESTS
// ============================================================================

/**
 * GOAL-HAPPY-001: New Patient Single Child
 *
 * Goal-based version of HAPPY-001.
 * Instead of 15 fixed steps, this test:
 * - Sends initial message
 * - Responds to whatever the agent asks (in any order)
 * - Passes when all data collection goals are met + booking confirmed
 */
export const GOAL_HAPPY_001: GoalOrientedTestCase = {
  id: 'GOAL-HAPPY-001',
  name: 'New Patient Single Child (Goal-Based)',
  description: 'Complete new patient orthodontic consult booking for one child using goal-oriented approach',
  category: 'happy-path',
  tags: ['goal-based', 'booking', 'new-patient', 'single-child', 'priority-high'],

  // Sarah Johnson persona from standard personas
  persona: SARAH_JOHNSON,

  // Goals to achieve (order doesn't matter)
  goals: [
    {
      ...PRESET_GOALS.collectParentInfo(),
      id: 'collect-parent-info',
      requiredFields: ['parent_name', 'parent_phone'],
    },
    {
      ...PRESET_GOALS.collectChildInfo(),
      id: 'collect-child-info',
      requiredFields: ['child_names', 'child_dob'],
    },
    {
      ...PRESET_GOALS.bookingConfirmed(),
      id: 'booking-confirmed',
      required: true,
    },
    {
      ...PRESET_GOALS.conversationEnded(),
      id: 'conversation-ended',
      required: false, // Nice to have, not required
    },
  ],

  // Test constraints
  constraints: [
    PRESET_CONSTRAINTS.noErrors(),
    PRESET_CONSTRAINTS.noInternalExposure(),
    PRESET_CONSTRAINTS.maxTurns(25),
  ],

  // Response generation config
  responseConfig: {
    maxTurns: 25,
    useLlmResponses: false, // Use templates for faster tests
    handleUnknownIntents: 'clarify',
  },

  // Initial message to start conversation
  initialMessage: 'Hi I need to schedule an orthodontic appointment for my child',
};

/**
 * GOAL-HAPPY-002: New Patient Two Siblings
 *
 * Goal-based version of HAPPY-002.
 * Tests booking for multiple children.
 */
export const GOAL_HAPPY_002: GoalOrientedTestCase = {
  id: 'GOAL-HAPPY-002',
  name: 'New Patient Two Siblings (Goal-Based)',
  description: 'Book new patient orthodontic consult for two children using goal-oriented approach',
  category: 'happy-path',
  tags: ['goal-based', 'booking', 'new-patient', 'siblings', 'multiple-children'],

  persona: MICHAEL_DAVIS,

  goals: [
    {
      ...PRESET_GOALS.collectParentInfo(),
      id: 'collect-parent-info',
      requiredFields: ['parent_name', 'parent_phone'],
    },
    {
      ...PRESET_GOALS.collectChildInfo(),
      id: 'collect-children-info',
      description: 'Collect information for both children',
      requiredFields: ['child_count', 'child_names', 'child_dob'],
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
    PRESET_CONSTRAINTS.maxTurns(30), // More turns for 2 children
  ],

  responseConfig: {
    maxTurns: 30,
    useLlmResponses: false,
    handleUnknownIntents: 'clarify',
  },

  initialMessage: 'Hi I need to schedule appointments for my two kids',
};

/**
 * GOAL-HAPPY-003: Quick Info Provider
 *
 * Goal-based version of HAPPY-003.
 * Uses verbose persona that provides extra info upfront.
 */
export const GOAL_HAPPY_003: GoalOrientedTestCase = {
  id: 'GOAL-HAPPY-003',
  name: 'Quick Info Provider (Goal-Based)',
  description: 'Parent provides extensive information upfront using goal-oriented approach',
  category: 'happy-path',
  tags: ['goal-based', 'booking', 'quick-path', 'efficient', 'verbose'],

  persona: JANE_SMITH, // Verbose persona

  goals: [
    {
      ...PRESET_GOALS.collectParentInfo(),
      id: 'collect-parent-info',
      requiredFields: ['parent_name', 'parent_phone', 'parent_email'],
    },
    {
      ...PRESET_GOALS.collectChildInfo(),
      id: 'collect-child-info',
      requiredFields: ['child_names', 'child_dob'],
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
    PRESET_CONSTRAINTS.maxTurns(20), // Fewer turns expected with verbose user
  ],

  responseConfig: {
    maxTurns: 20,
    useLlmResponses: true, // Use LLM for verbose persona
    handleUnknownIntents: 'clarify',
  },

  initialMessage: 'Hi I need to schedule an appointment',
};

/**
 * GOAL-HAPPY-004: Special Needs Child
 *
 * Tests handling of special needs information.
 */
export const GOAL_HAPPY_004: GoalOrientedTestCase = {
  id: 'GOAL-HAPPY-004',
  name: 'Special Needs Child (Goal-Based)',
  description: 'Book appointment for child with special needs',
  category: 'happy-path',
  tags: ['goal-based', 'booking', 'special-needs', 'accessibility'],

  persona: DAVID_WILSON,

  goals: [
    {
      ...PRESET_GOALS.collectParentInfo(),
      id: 'collect-parent-info',
      requiredFields: ['parent_name', 'parent_phone'],
    },
    {
      ...PRESET_GOALS.collectChildInfo(),
      id: 'collect-child-info',
      requiredFields: ['child_names', 'child_dob', 'special_needs'],
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
    PRESET_CONSTRAINTS.maxTurns(25),
    // Custom constraint: Agent should acknowledge special needs
    {
      type: 'must_happen',
      description: 'Agent should acknowledge special needs',
      severity: 'high',
      condition: (ctx) => {
        // Check if any agent response acknowledged special needs
        const transcriptText = ctx.conversationHistory
          .filter(t => t.role === 'assistant')
          .map(t => t.content)
          .join(' ')
          .toLowerCase();
        return transcriptText.includes('note') ||
               transcriptText.includes('understand') ||
               transcriptText.includes('special') ||
               transcriptText.includes('aware');
      },
    },
  ],

  responseConfig: {
    maxTurns: 25,
    useLlmResponses: false,
    handleUnknownIntents: 'clarify',
  },

  initialMessage: 'Hi I need to schedule an orthodontic appointment for my son who has special needs',
};

/**
 * GOAL-HAPPY-005: Terse User
 *
 * Tests handling of minimal responses.
 */
export const GOAL_HAPPY_005: GoalOrientedTestCase = {
  id: 'GOAL-HAPPY-005',
  name: 'Terse User (Goal-Based)',
  description: 'Handle parent who gives very brief answers',
  category: 'happy-path',
  tags: ['goal-based', 'booking', 'terse-user', 'minimal-responses'],

  persona: TERSE_TOM,

  goals: [
    {
      ...PRESET_GOALS.collectParentInfo(),
      id: 'collect-parent-info',
      requiredFields: ['parent_name', 'parent_phone'],
    },
    {
      ...PRESET_GOALS.collectChildInfo(),
      id: 'collect-child-info',
      requiredFields: ['child_names', 'child_dob'],
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
    PRESET_CONSTRAINTS.maxTurns(30), // May need more turns with terse user
  ],

  responseConfig: {
    maxTurns: 30,
    useLlmResponses: false,
    handleUnknownIntents: 'clarify',
  },

  initialMessage: 'Need appointment',
};

// ============================================================================
// EXPORT ALL GOAL-BASED HAPPY PATH TESTS
// ============================================================================

export const goalHappyPathScenarios: GoalOrientedTestCase[] = [
  GOAL_HAPPY_001,
  GOAL_HAPPY_002,
  GOAL_HAPPY_003,
  GOAL_HAPPY_004,
  GOAL_HAPPY_005,
];

/**
 * Get a goal test by ID
 */
export function getGoalTest(id: string): GoalOrientedTestCase | null {
  return goalHappyPathScenarios.find(t => t.id === id) || null;
}

/**
 * List all goal test IDs
 */
export function listGoalTestIds(): string[] {
  return goalHappyPathScenarios.map(t => t.id);
}

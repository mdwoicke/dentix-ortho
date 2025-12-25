/**
 * Progress Tracker Service
 *
 * Tracks conversation progress toward goals.
 * Detects issues like repetition, stuck conversations, etc.
 */

import type { ConversationGoal, CollectableField, GoalContext, GoalResult } from '../tests/types/goals';
import type { AgentIntent, IntentDetectionResult } from '../tests/types/intent';
import { INTENT_TO_FIELD } from '../tests/types/intent';
import {
  ProgressState,
  CollectedValue,
  ProgressIssue,
  ProgressSummary,
  createInitialProgressState,
  calculateProgressSummary,
} from '../tests/types/progress';
import type { ConversationTurn } from '../tests/test-case';

/**
 * Configuration for progress tracking
 */
export interface ProgressTrackerConfig {
  /** Threshold for detecting stuck conversations */
  stuckThresholdTurns: number;

  /** Maximum consecutive same-intent detections before flagging repetition */
  maxRepetitionCount: number;

  /** Enable issue detection */
  detectIssues: boolean;
}

const DEFAULT_CONFIG: ProgressTrackerConfig = {
  stuckThresholdTurns: 5,
  maxRepetitionCount: 2,
  detectIssues: true,
};

/**
 * Progress Tracker Service
 *
 * Tracks what data has been collected and progress toward goals.
 */
export class ProgressTracker {
  private state: ProgressState;
  private goals: ConversationGoal[];
  private config: ProgressTrackerConfig;

  constructor(goals: ConversationGoal[], cfg?: Partial<ProgressTrackerConfig>) {
    this.goals = goals;
    this.config = { ...DEFAULT_CONFIG, ...cfg };

    // Calculate all required fields from goals
    const requiredFields = this.calculateRequiredFields();
    this.state = createInitialProgressState(requiredFields);

    // Set active goals
    this.state.activeGoals = goals.map(g => g.id);
  }

  /**
   * Calculate all required fields from goals
   */
  private calculateRequiredFields(): CollectableField[] {
    const fields = new Set<CollectableField>();
    for (const goal of this.goals) {
      if (goal.type === 'data_collection' && goal.requiredFields) {
        for (const field of goal.requiredFields) {
          fields.add(field);
        }
      }
    }
    return Array.from(fields);
  }

  /**
   * Update progress based on the latest turn
   */
  updateProgress(
    agentIntent: IntentDetectionResult,
    userResponse: string,
    turnNumber: number
  ): void {
    // Update turn info
    this.state.turnNumber = turnNumber;
    this.state.lastActivityAt = new Date();
    this.state.intentHistory.push(agentIntent.primaryIntent);
    this.state.lastAgentIntent = agentIntent.primaryIntent;

    // Map intent to field and record collection
    const field = this.intentToField(agentIntent.primaryIntent);
    if (field && !this.state.collectedFields.has(field)) {
      this.state.collectedFields.set(field, {
        field,
        value: userResponse,
        collectedAtTurn: turnNumber,
        confirmedByAgent: false,
        userResponse,
      });

      // Remove from pending
      this.state.pendingFields = this.state.pendingFields.filter(f => f !== field);
    }

    // Update flow state based on intent
    this.updateFlowState(agentIntent.primaryIntent);

    // Detect issues
    if (this.config.detectIssues) {
      this.detectIssues(agentIntent, turnNumber);
    }

    // Evaluate goals
    this.evaluateGoals();
  }

  /**
   * Map agent intent to collectable field
   */
  private intentToField(intent: AgentIntent): CollectableField | null {
    const field = INTENT_TO_FIELD[intent];
    return field as CollectableField | undefined ?? null;
  }

  /**
   * Update flow state based on intent
   */
  private updateFlowState(intent: AgentIntent): void {
    const stateMap: Partial<Record<AgentIntent, string>> = {
      'greeting': 'greeting',
      'asking_parent_name': 'collecting_parent_info',
      'asking_spell_name': 'collecting_parent_info',
      'asking_phone': 'collecting_parent_info',
      'asking_email': 'collecting_parent_info',
      'asking_child_count': 'collecting_child_info',
      'asking_child_name': 'collecting_child_info',
      'asking_child_dob': 'collecting_child_info',
      'asking_child_age': 'collecting_child_info',
      'asking_new_patient': 'collecting_history',
      'asking_previous_visit': 'collecting_history',
      'asking_previous_ortho': 'collecting_history',
      'asking_insurance': 'collecting_insurance',
      'asking_special_needs': 'collecting_special_info',
      'asking_time_preference': 'scheduling',
      'asking_location_preference': 'scheduling',
      'offering_time_slots': 'booking',
      'confirming_booking': 'confirmation',
      'initiating_transfer': 'transfer',
      'saying_goodbye': 'ended',
    };

    if (stateMap[intent]) {
      this.state.currentFlowState = stateMap[intent]!;
    }
  }

  /**
   * Detect conversation issues
   */
  private detectIssues(intent: IntentDetectionResult, turnNumber: number): void {
    // Check for repetition
    if (this.isRepeatingIntent(intent.primaryIntent)) {
      this.state.issues.push({
        type: 'repeating',
        description: `Agent asked for ${intent.primaryIntent} again`,
        turnNumber,
        severity: 'medium',
        context: { intent: intent.primaryIntent },
      });
    }

    // Check for stuck (no progress in X turns)
    if (this.state.turnNumber >= this.config.stuckThresholdTurns &&
        this.state.collectedFields.size === 0) {
      this.state.issues.push({
        type: 'stuck',
        description: `No data collected after ${turnNumber} turns`,
        turnNumber,
        severity: 'high',
      });
    }

    // Check for unknown intent
    if (intent.primaryIntent === 'unknown' && intent.confidence < 0.5) {
      this.state.issues.push({
        type: 'unknown_intent',
        description: 'Could not determine agent intent',
        turnNumber,
        severity: 'low',
        context: { confidence: intent.confidence },
      });
    }
  }

  /**
   * Check if the same intent has appeared too many times recently
   */
  private isRepeatingIntent(intent: AgentIntent): boolean {
    const history = this.state.intentHistory;
    if (history.length < this.config.maxRepetitionCount) return false;

    const recent = history.slice(-this.config.maxRepetitionCount);
    return recent.every(i => i === intent);
  }

  /**
   * Evaluate if goals have been completed
   */
  private evaluateGoals(): void {
    for (const goal of this.goals) {
      if (this.state.completedGoals.includes(goal.id)) continue;
      if (this.state.failedGoals.includes(goal.id)) continue;

      const result = this.evaluateGoal(goal);
      if (result.passed) {
        this.state.completedGoals.push(goal.id);
        this.state.activeGoals = this.state.activeGoals.filter(id => id !== goal.id);
      }
    }
  }

  /**
   * Evaluate a single goal
   */
  private evaluateGoal(goal: ConversationGoal): GoalResult {
    switch (goal.type) {
      case 'data_collection':
        return this.evaluateDataCollectionGoal(goal);

      case 'booking_confirmed':
        return this.evaluateBookingGoal();

      case 'transfer_initiated':
        return this.evaluateTransferGoal();

      case 'conversation_ended':
        return this.evaluateEndedGoal();

      case 'custom':
        if (goal.successCriteria) {
          const context = this.buildGoalContext();
          return {
            goalId: goal.id,
            passed: goal.successCriteria(context),
            message: 'Custom goal evaluation',
          };
        }
        return { goalId: goal.id, passed: false, message: 'No success criteria defined' };

      default:
        return { goalId: goal.id, passed: false, message: 'Unknown goal type' };
    }
  }

  /**
   * Evaluate data collection goal
   */
  private evaluateDataCollectionGoal(goal: ConversationGoal): GoalResult {
    const requiredFields = goal.requiredFields ?? [];
    const collected = Array.from(this.state.collectedFields.keys());
    const missing = requiredFields.filter(f => !collected.includes(f));

    return {
      goalId: goal.id,
      passed: missing.length === 0,
      message: missing.length === 0
        ? 'All required data collected'
        : `Missing: ${missing.join(', ')}`,
      details: {
        required: requiredFields,
        collected: collected.filter(f => requiredFields.includes(f)),
        missing,
      },
    };
  }

  /**
   * Evaluate booking confirmed goal
   */
  private evaluateBookingGoal(): GoalResult {
    const isBookingConfirmed =
      this.state.currentFlowState === 'confirmation' ||
      this.state.lastAgentIntent === 'confirming_booking';

    return {
      goalId: 'booking-confirmed',
      passed: isBookingConfirmed,
      message: isBookingConfirmed ? 'Booking confirmed' : 'Booking not yet confirmed',
    };
  }

  /**
   * Evaluate transfer initiated goal
   */
  private evaluateTransferGoal(): GoalResult {
    const isTransfer =
      this.state.currentFlowState === 'transfer' ||
      this.state.lastAgentIntent === 'initiating_transfer';

    return {
      goalId: 'transfer-initiated',
      passed: isTransfer,
      message: isTransfer ? 'Transfer initiated' : 'No transfer detected',
    };
  }

  /**
   * Evaluate conversation ended goal
   */
  private evaluateEndedGoal(): GoalResult {
    const isEnded =
      this.state.currentFlowState === 'ended' ||
      this.state.lastAgentIntent === 'saying_goodbye';

    return {
      goalId: 'conversation-ended',
      passed: isEnded,
      message: isEnded ? 'Conversation ended properly' : 'Conversation not ended',
    };
  }

  /**
   * Build goal context for custom evaluations
   */
  private buildGoalContext(): GoalContext {
    return {
      collectedData: this.state.collectedFields as Map<CollectableField, any>,
      conversationHistory: [], // Would be passed in from runner
      agentConfirmedBooking: this.state.lastAgentIntent === 'confirming_booking',
      agentInitiatedTransfer: this.state.lastAgentIntent === 'initiating_transfer',
      turnCount: this.state.turnNumber,
      elapsedTimeMs: Date.now() - this.state.startedAt.getTime(),
    };
  }

  // ============================================================================
  // PUBLIC ACCESSORS
  // ============================================================================

  /**
   * Check if all required goals are complete
   */
  areGoalsComplete(): boolean {
    const requiredGoals = this.goals.filter(g => g.required);
    return requiredGoals.every(g => this.state.completedGoals.includes(g.id));
  }

  /**
   * Check if any goals have failed
   */
  hasFailedGoals(): boolean {
    return this.state.failedGoals.length > 0;
  }

  /**
   * Get current progress state
   */
  getState(): ProgressState {
    return { ...this.state };
  }

  /**
   * Get pending fields (not yet collected)
   */
  getPendingFields(): CollectableField[] {
    return [...this.state.pendingFields];
  }

  /**
   * Get collected fields
   */
  getCollectedFields(): Map<CollectableField, CollectedValue> {
    return new Map(this.state.collectedFields);
  }

  /**
   * Get progress summary
   */
  getSummary(): ProgressSummary {
    return calculateProgressSummary(this.state, this.goals.length);
  }

  /**
   * Get all issues
   */
  getIssues(): ProgressIssue[] {
    return [...this.state.issues];
  }

  /**
   * Get critical issues
   */
  getCriticalIssues(): ProgressIssue[] {
    return this.state.issues.filter(i => i.severity === 'critical');
  }

  /**
   * Check if conversation should abort (critical issues)
   */
  shouldAbort(): boolean {
    return this.getCriticalIssues().length > 0;
  }

  /**
   * Mark the booking as confirmed externally
   */
  markBookingConfirmed(): void {
    this.state.currentFlowState = 'confirmation';
    this.evaluateGoals();
  }

  /**
   * Mark a transfer as initiated externally
   */
  markTransferInitiated(): void {
    this.state.currentFlowState = 'transfer';
    this.evaluateGoals();
  }

  /**
   * Reset tracker for a new conversation
   */
  reset(): void {
    const requiredFields = this.calculateRequiredFields();
    this.state = createInitialProgressState(requiredFields);
    this.state.activeGoals = this.goals.map(g => g.id);
  }
}

/**
 * Conversation Context Tracker
 *
 * Provides rich context tracking across conversation turns.
 * Enables multi-child tracking, repetition detection, and anomaly identification.
 *
 * Features:
 * - Per-child state tracking for multi-child scenarios
 * - Field request/response correlation
 * - Repetition detection with reasons
 * - Anomaly detection (loops, contradictions, unexpected transfers)
 * - Context history for debugging
 */

import type { DataFieldCategory } from '../schemas/response-category-schemas';
import type { CollectableField } from '../tests/types/goals';
import type { ConversationTurn } from '../tests/test-case';

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Tracking info for a requested field
 */
export interface FieldRequestInfo {
  field: DataFieldCategory;
  requestedAtTurns: number[];
  providedAtTurn?: number;
  providedValue?: string;
  wasRepeated: boolean;
  repeatReason?: RepeatReason;
}

/**
 * Reasons why a field request might be repeated
 */
export type RepeatReason =
  | 'clarification_needed' // User response was unclear
  | 'user_correction' // User corrected previous answer
  | 'validation_failed' // Agent couldn't validate response
  | 'agent_confirmation' // Agent confirming what was heard
  | 'context_switch' // Switched to different child/topic
  | 'unknown'; // Couldn't determine reason

/**
 * State tracking for a single child in multi-child scenarios
 */
export interface ChildContext {
  childIndex: number;
  name?: string;
  dateOfBirth?: string;
  age?: number;
  fieldsCollected: Map<CollectableField, { value: string; turn: number }>;
  appointmentBooked: boolean;
  appointmentDetails?: {
    dateTime?: string;
    location?: string;
    appointmentGUID?: string;
  };
  firstMentionedTurn: number;
  lastActivityTurn: number;
}

/**
 * Anomaly detected in conversation
 */
export interface ConversationAnomaly {
  turn: number;
  type: AnomalyType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  context?: Record<string, any>;
}

export type AnomalyType =
  | 'unexpected_transfer' // Transfer without clear reason
  | 'data_contradiction' // User provided conflicting info
  | 'loop_detected' // Same exchange repeating
  | 'premature_booking' // Booking before required info collected
  | 'missing_confirmation' // Booking without user confirmation
  | 'stuck_conversation' // No progress for many turns
  | 'child_index_mismatch' // Agent asking about wrong child
  | 'field_already_provided'; // Agent asking for data already given

/**
 * Flow state snapshot at a turn
 */
export interface FlowStateSnapshot {
  turn: number;
  state: string;
  fieldsCollectedCount: number;
  currentChildIndex: number;
  agentIntent?: string;
  timestamp: Date;
}

/**
 * Complete conversation context
 */
export interface ConversationContext {
  // Session info
  sessionId: string;
  testId?: string;
  startedAt: Date;
  lastActivityAt: Date;

  // Field tracking
  fieldsRequested: Map<DataFieldCategory, FieldRequestInfo>;
  fieldsProvided: Map<CollectableField, { turn: number; value: string }>;

  // Multi-child tracking
  childCount: number;
  currentChildIndex: number;
  children: Map<number, ChildContext>;

  // Flow state history
  flowStates: FlowStateSnapshot[];
  currentFlowState: string;

  // Repetition tracking
  repeatedQuestions: Array<{
    field: DataFieldCategory;
    turns: number[];
    reason: RepeatReason;
  }>;

  // Terminal state tracking
  terminalStateReached: boolean;
  terminalStateTurn?: number;
  terminalStateType?: 'booking_confirmed' | 'transfer' | 'goodbye' | 'error';

  // Anomaly tracking
  anomalies: ConversationAnomaly[];

  // Turn-by-turn context
  turnContexts: TurnContext[];
}

/**
 * Context snapshot for a single turn
 */
export interface TurnContext {
  turn: number;
  agentMessage: string;
  userMessage?: string;
  classification?: {
    category: string;
    dataFields?: DataFieldCategory[];
    terminalState?: string;
  };
  childIndex: number;
  fieldsRequestedThisTurn: DataFieldCategory[];
  fieldsProvidedThisTurn: CollectableField[];
  anomaliesDetectedThisTurn: AnomalyType[];
}

// =============================================================================
// Configuration
// =============================================================================

export interface ConversationContextTrackerConfig {
  /** Max turns without progress before flagging stuck */
  stuckThresholdTurns: number;
  /** Max same-field requests before flagging repetition */
  repetitionThreshold: number;
  /** Enable anomaly detection */
  detectAnomalies: boolean;
  /** Enable detailed turn logging */
  verboseLogging: boolean;
}

const DEFAULT_CONFIG: ConversationContextTrackerConfig = {
  stuckThresholdTurns: 5,
  repetitionThreshold: 2,
  detectAnomalies: true,
  verboseLogging: false,
};

// =============================================================================
// Conversation Context Tracker
// =============================================================================

export class ConversationContextTracker {
  private context: ConversationContext;
  private config: ConversationContextTrackerConfig;

  constructor(
    sessionId: string,
    config: Partial<ConversationContextTrackerConfig> = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.context = this.createInitialContext(sessionId);
  }

  /**
   * Create initial empty context
   */
  private createInitialContext(sessionId: string): ConversationContext {
    return {
      sessionId,
      startedAt: new Date(),
      lastActivityAt: new Date(),
      fieldsRequested: new Map(),
      fieldsProvided: new Map(),
      childCount: 0,
      currentChildIndex: 0,
      children: new Map(),
      flowStates: [],
      currentFlowState: 'initial',
      repeatedQuestions: [],
      terminalStateReached: false,
      anomalies: [],
      turnContexts: [],
    };
  }

  /**
   * Set the test ID for this conversation
   */
  setTestId(testId: string): void {
    this.context.testId = testId;
  }

  /**
   * Set the expected number of children
   */
  setChildCount(count: number): void {
    this.context.childCount = count;
    // Initialize child contexts
    for (let i = 0; i < count; i++) {
      if (!this.context.children.has(i)) {
        this.context.children.set(i, this.createChildContext(i, 0));
      }
    }
  }

  /**
   * Create initial child context
   */
  private createChildContext(index: number, turn: number): ChildContext {
    return {
      childIndex: index,
      fieldsCollected: new Map(),
      appointmentBooked: false,
      firstMentionedTurn: turn,
      lastActivityTurn: turn,
    };
  }

  /**
   * Record an agent message and its classification
   */
  recordAgentTurn(
    turn: number,
    agentMessage: string,
    classification?: {
      category: string;
      dataFields?: DataFieldCategory[];
      terminalState?: string;
      confidence?: number;
    }
  ): void {
    this.context.lastActivityAt = new Date();

    // Create turn context
    const turnContext: TurnContext = {
      turn,
      agentMessage,
      childIndex: this.context.currentChildIndex,
      fieldsRequestedThisTurn: [],
      fieldsProvidedThisTurn: [],
      anomaliesDetectedThisTurn: [],
    };

    if (classification) {
      turnContext.classification = {
        category: classification.category,
        dataFields: classification.dataFields,
        terminalState: classification.terminalState,
      };

      // Track requested fields
      if (classification.dataFields) {
        for (const field of classification.dataFields) {
          this.trackFieldRequest(field, turn);
          turnContext.fieldsRequestedThisTurn.push(field);
        }
      }

      // Check for terminal state
      if (classification.terminalState) {
        this.handleTerminalState(classification.terminalState, turn);
      }

      // Update flow state
      this.updateFlowState(turn, classification.category);
    }

    // Detect anomalies
    if (this.config.detectAnomalies) {
      const anomalies = this.detectAnomalies(turn, agentMessage, classification);
      turnContext.anomaliesDetectedThisTurn = anomalies.map(a => a.type);
    }

    this.context.turnContexts.push(turnContext);

    if (this.config.verboseLogging) {
      console.log(`[ContextTracker] Turn ${turn}: ${classification?.category || 'unknown'}`);
    }
  }

  /**
   * Record a user response
   */
  recordUserTurn(
    turn: number,
    userMessage: string,
    providedFields?: Array<{ field: CollectableField; value: string }>
  ): void {
    this.context.lastActivityAt = new Date();

    // Find the turn context
    const turnContext = this.context.turnContexts.find(tc => tc.turn === turn);
    if (turnContext) {
      turnContext.userMessage = userMessage;
    }

    // Track provided fields
    if (providedFields) {
      for (const { field, value } of providedFields) {
        this.trackFieldProvided(field, value, turn);

        // Also track in current child context if applicable
        const childFields: CollectableField[] = [
          'child_names', 'child_dob',
        ];
        if (childFields.includes(field)) {
          this.trackChildField(this.context.currentChildIndex, field, value, turn);
        }

        if (turnContext) {
          turnContext.fieldsProvidedThisTurn.push(field);
        }
      }
    }

    // Check for data contradictions
    if (this.config.detectAnomalies && providedFields) {
      this.checkForContradictions(turn, providedFields);
    }
  }

  /**
   * Track a field request
   */
  private trackFieldRequest(field: DataFieldCategory, turn: number): void {
    const existing = this.context.fieldsRequested.get(field);

    if (existing) {
      existing.requestedAtTurns.push(turn);

      // Check for repetition
      if (existing.requestedAtTurns.length >= this.config.repetitionThreshold) {
        if (!existing.wasRepeated) {
          existing.wasRepeated = true;
          existing.repeatReason = this.analyzeRepeatReason(field, turn);

          this.context.repeatedQuestions.push({
            field,
            turns: [...existing.requestedAtTurns],
            reason: existing.repeatReason,
          });

          if (this.config.verboseLogging) {
            console.log(`[ContextTracker] Repetition detected: ${field} (${existing.repeatReason})`);
          }
        }
      }
    } else {
      this.context.fieldsRequested.set(field, {
        field,
        requestedAtTurns: [turn],
        wasRepeated: false,
      });
    }
  }

  /**
   * Analyze why a field request was repeated
   */
  private analyzeRepeatReason(field: DataFieldCategory, turn: number): RepeatReason {
    const previousTurns = this.context.turnContexts.slice(-3);

    // Check if user provided unclear response
    for (const tc of previousTurns) {
      if (tc.userMessage) {
        const unclear = /\b(um|uh|not sure|maybe|i think|let me check)\b/i.test(tc.userMessage);
        if (unclear) return 'clarification_needed';

        const correction = /\b(actually|wait|no|sorry|i meant|correction)\b/i.test(tc.userMessage);
        if (correction) return 'user_correction';
      }
    }

    // Check for context switch (different child)
    const prevChild = previousTurns[0]?.childIndex;
    if (prevChild !== undefined && prevChild !== this.context.currentChildIndex) {
      return 'context_switch';
    }

    // Check if agent is confirming
    const lastAgent = this.context.turnContexts[this.context.turnContexts.length - 1];
    if (lastAgent?.classification?.category === 'confirm_or_deny') {
      return 'agent_confirmation';
    }

    return 'unknown';
  }

  /**
   * Track a field being provided
   */
  private trackFieldProvided(
    field: CollectableField,
    value: string,
    turn: number
  ): void {
    // Check if already provided (potential contradiction)
    const existing = this.context.fieldsProvided.get(field);
    if (existing && existing.value !== value) {
      // Value changed - might be a correction or contradiction
      if (this.config.verboseLogging) {
        console.log(`[ContextTracker] Field ${field} updated: ${existing.value} → ${value}`);
      }
    }

    this.context.fieldsProvided.set(field, { turn, value });

    // Update field request info
    // Map CollectableField to DataFieldCategory if needed
    const fieldMapping: Partial<Record<CollectableField, DataFieldCategory>> = {
      'parent_name': 'caller_name',
      'parent_phone': 'caller_phone',
      'parent_email': 'caller_email',
      'child_names': 'child_name',
      'child_dob': 'child_dob',
      'insurance': 'insurance_info',
      'special_needs': 'special_needs',
      'child_count': 'child_count',
      'previous_visit': 'previous_visit',
      'previous_ortho': 'previous_ortho_treatment',
      'time_preference': 'time_preference',
      'location_preference': 'location_preference',
    };

    const dataField = fieldMapping[field];
    if (dataField) {
      const requestInfo = this.context.fieldsRequested.get(dataField);
      if (requestInfo) {
        requestInfo.providedAtTurn = turn;
        requestInfo.providedValue = value;
      }
    }
  }

  /**
   * Track a field for a specific child
   */
  private trackChildField(
    childIndex: number,
    field: CollectableField,
    value: string,
    turn: number
  ): void {
    let childContext = this.context.children.get(childIndex);
    if (!childContext) {
      childContext = this.createChildContext(childIndex, turn);
      this.context.children.set(childIndex, childContext);
    }

    childContext.fieldsCollected.set(field, { value, turn });
    childContext.lastActivityTurn = turn;

    // Extract specific child info
    if (field === 'child_names') {
      childContext.name = value;
    } else if (field === 'child_dob') {
      childContext.dateOfBirth = value;
      // Try to calculate age from DOB
      try {
        const dob = new Date(value);
        if (!isNaN(dob.getTime())) {
          const today = new Date();
          let age = today.getFullYear() - dob.getFullYear();
          const monthDiff = today.getMonth() - dob.getMonth();
          if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
            age--;
          }
          childContext.age = age;
        }
      } catch {
        // Ignore date parsing errors
      }
    }
  }

  /**
   * Switch to a different child context
   */
  switchChild(childIndex: number, turn: number): void {
    if (childIndex !== this.context.currentChildIndex) {
      if (this.config.verboseLogging) {
        console.log(`[ContextTracker] Switching from child ${this.context.currentChildIndex} to ${childIndex}`);
      }
      this.context.currentChildIndex = childIndex;

      // Ensure child context exists
      if (!this.context.children.has(childIndex)) {
        this.context.children.set(childIndex, this.createChildContext(childIndex, turn));
      }
    }
  }

  /**
   * Mark booking confirmed for current child
   */
  markBookingConfirmed(
    turn: number,
    details?: { dateTime?: string; location?: string; appointmentGUID?: string }
  ): void {
    const childContext = this.context.children.get(this.context.currentChildIndex);
    if (childContext) {
      childContext.appointmentBooked = true;
      childContext.appointmentDetails = details;
      childContext.lastActivityTurn = turn;
    }
  }

  /**
   * Handle terminal state
   */
  private handleTerminalState(state: string, turn: number): void {
    if (!this.context.terminalStateReached) {
      this.context.terminalStateReached = true;
      this.context.terminalStateTurn = turn;

      if (state.includes('booking') || state.includes('confirmed')) {
        this.context.terminalStateType = 'booking_confirmed';
      } else if (state.includes('transfer')) {
        this.context.terminalStateType = 'transfer';
      } else if (state.includes('goodbye') || state.includes('ended')) {
        this.context.terminalStateType = 'goodbye';
      } else {
        this.context.terminalStateType = 'goodbye';
      }

      if (this.config.verboseLogging) {
        console.log(`[ContextTracker] Terminal state reached: ${this.context.terminalStateType}`);
      }
    }
  }

  /**
   * Update flow state
   */
  private updateFlowState(turn: number, category: string): void {
    const categoryToState: Record<string, string> = {
      'provide_data': 'collecting_data',
      'confirm_or_deny': 'confirming',
      'select_from_options': 'selecting',
      'acknowledge': 'acknowledging',
      'clarify_request': 'clarifying',
      'express_preference': 'expressing_preference',
    };

    const newState = categoryToState[category] || category;

    this.context.flowStates.push({
      turn,
      state: newState,
      fieldsCollectedCount: this.context.fieldsProvided.size,
      currentChildIndex: this.context.currentChildIndex,
      agentIntent: category,
      timestamp: new Date(),
    });

    this.context.currentFlowState = newState;
  }

  /**
   * Detect anomalies in the conversation
   */
  private detectAnomalies(
    turn: number,
    agentMessage: string,
    classification?: any
  ): ConversationAnomaly[] {
    const anomalies: ConversationAnomaly[] = [];

    // Check for unexpected transfer
    if (classification?.terminalState?.includes('transfer')) {
      const hasRequiredInfo = this.context.fieldsProvided.size >= 3;
      if (!hasRequiredInfo && turn < 5) {
        anomalies.push({
          turn,
          type: 'unexpected_transfer',
          severity: 'high',
          description: 'Transfer initiated before collecting basic information',
          context: { fieldsCollected: this.context.fieldsProvided.size },
        });
      }
    }

    // Check for premature booking
    if (classification?.terminalState?.includes('booking')) {
      const requiredFields = ['parent_name', 'parent_phone', 'child_names'];
      const missing = requiredFields.filter(f =>
        !this.context.fieldsProvided.has(f as CollectableField)
      );
      if (missing.length > 0) {
        anomalies.push({
          turn,
          type: 'premature_booking',
          severity: 'medium',
          description: `Booking before collecting: ${missing.join(', ')}`,
          context: { missingFields: missing },
        });
      }
    }

    // Check for stuck conversation
    if (turn >= this.config.stuckThresholdTurns) {
      const recentStates = this.context.flowStates.slice(-this.config.stuckThresholdTurns);
      const uniqueStates = new Set(recentStates.map(s => s.state));
      if (uniqueStates.size === 1 && this.context.fieldsProvided.size === 0) {
        anomalies.push({
          turn,
          type: 'stuck_conversation',
          severity: 'high',
          description: `No progress in ${this.config.stuckThresholdTurns} turns`,
        });
      }
    }

    // Check for loop (same exchanges repeating)
    if (this.context.turnContexts.length >= 4) {
      const recent = this.context.turnContexts.slice(-4);
      if (
        recent[0].classification?.category === recent[2].classification?.category &&
        recent[1].classification?.category === recent[3].classification?.category
      ) {
        anomalies.push({
          turn,
          type: 'loop_detected',
          severity: 'medium',
          description: 'Conversation appears to be looping',
        });
      }
    }

    // Check for asking already-provided field
    if (classification?.dataFields) {
      const fieldMapping: Record<string, CollectableField> = {
        'caller_name': 'parent_name',
        'caller_phone': 'parent_phone',
        'caller_email': 'parent_email',
        'child_name': 'child_names',
        'child_dob': 'child_dob',
        'insurance_info': 'insurance',
        'special_needs': 'special_needs',
        'child_count': 'child_count',
        'previous_visit': 'previous_visit',
        'previous_ortho_treatment': 'previous_ortho',
      };

      for (const field of classification.dataFields as DataFieldCategory[]) {
        const collectableField = fieldMapping[field];
        if (collectableField && this.context.fieldsProvided.has(collectableField)) {
          // Only flag if asked recently (within last 2 turns for same child)
          const providedTurn = this.context.fieldsProvided.get(collectableField)?.turn;
          if (providedTurn && turn - providedTurn <= 2) {
            anomalies.push({
              turn,
              type: 'field_already_provided',
              severity: 'low',
              description: `Agent asked for ${field} which was already provided`,
              context: { field, providedAtTurn: providedTurn },
            });
          }
        }
      }
    }

    // Add anomalies to context
    this.context.anomalies.push(...anomalies);

    return anomalies;
  }

  /**
   * Check for data contradictions
   */
  private checkForContradictions(
    turn: number,
    providedFields: Array<{ field: CollectableField; value: string }>
  ): void {
    for (const { field, value } of providedFields) {
      const existing = this.context.fieldsProvided.get(field);
      if (existing && existing.value !== value) {
        // Check if this is a meaningful contradiction (not just formatting)
        const normalized1 = existing.value.toLowerCase().replace(/\s+/g, '');
        const normalized2 = value.toLowerCase().replace(/\s+/g, '');

        if (normalized1 !== normalized2) {
          this.context.anomalies.push({
            turn,
            type: 'data_contradiction',
            severity: 'medium',
            description: `${field} changed from "${existing.value}" to "${value}"`,
            context: { field, oldValue: existing.value, newValue: value },
          });
        }
      }
    }
  }

  // =============================================================================
  // Public Accessors
  // =============================================================================

  /**
   * Get current context
   */
  getContext(): ConversationContext {
    return { ...this.context };
  }

  /**
   * Get current child context
   */
  getCurrentChildContext(): ChildContext | undefined {
    return this.context.children.get(this.context.currentChildIndex);
  }

  /**
   * Get all child contexts
   */
  getChildContexts(): Map<number, ChildContext> {
    return new Map(this.context.children);
  }

  /**
   * Get fields provided so far
   */
  getFieldsProvided(): Map<CollectableField, { turn: number; value: string }> {
    return new Map(this.context.fieldsProvided);
  }

  /**
   * Get repeated questions
   */
  getRepeatedQuestions(): Array<{
    field: DataFieldCategory;
    turns: number[];
    reason: RepeatReason;
  }> {
    return [...this.context.repeatedQuestions];
  }

  /**
   * Get detected anomalies
   */
  getAnomalies(): ConversationAnomaly[] {
    return [...this.context.anomalies];
  }

  /**
   * Get anomalies by severity
   */
  getAnomaliesBySeverity(severity: 'low' | 'medium' | 'high' | 'critical'): ConversationAnomaly[] {
    return this.context.anomalies.filter(a => a.severity === severity);
  }

  /**
   * Check if terminal state reached
   */
  isTerminalStateReached(): boolean {
    return this.context.terminalStateReached;
  }

  /**
   * Get terminal state info
   */
  getTerminalState(): {
    reached: boolean;
    turn?: number;
    type?: string;
  } {
    return {
      reached: this.context.terminalStateReached,
      turn: this.context.terminalStateTurn,
      type: this.context.terminalStateType,
    };
  }

  /**
   * Get turn context by turn number
   */
  getTurnContext(turn: number): TurnContext | undefined {
    return this.context.turnContexts.find(tc => tc.turn === turn);
  }

  /**
   * Get all turn contexts
   */
  getTurnContexts(): TurnContext[] {
    return [...this.context.turnContexts];
  }

  /**
   * Get context summary for debugging/logging
   */
  getSummary(): {
    turns: number;
    fieldsCollected: number;
    childrenTracked: number;
    currentChild: number;
    anomalyCount: number;
    repetitionCount: number;
    terminalState: string | null;
  } {
    return {
      turns: this.context.turnContexts.length,
      fieldsCollected: this.context.fieldsProvided.size,
      childrenTracked: this.context.children.size,
      currentChild: this.context.currentChildIndex,
      anomalyCount: this.context.anomalies.length,
      repetitionCount: this.context.repeatedQuestions.length,
      terminalState: this.context.terminalStateType || null,
    };
  }

  /**
   * Check if all children have booked appointments
   */
  areAllChildrenBooked(): boolean {
    if (this.context.childCount === 0) return false;

    for (let i = 0; i < this.context.childCount; i++) {
      const child = this.context.children.get(i);
      if (!child || !child.appointmentBooked) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get booking status for each child
   */
  getBookingStatus(): Array<{
    childIndex: number;
    name?: string;
    booked: boolean;
    appointmentDetails?: any;
  }> {
    const status = [];
    for (let i = 0; i < this.context.childCount; i++) {
      const child = this.context.children.get(i);
      status.push({
        childIndex: i,
        name: child?.name,
        booked: child?.appointmentBooked ?? false,
        appointmentDetails: child?.appointmentDetails,
      });
    }
    return status;
  }

  /**
   * Reset tracker for a new conversation
   */
  reset(): void {
    this.context = this.createInitialContext(this.context.sessionId);
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a new conversation context tracker
 */
export function createContextTracker(
  sessionId: string,
  config?: Partial<ConversationContextTrackerConfig>
): ConversationContextTracker {
  return new ConversationContextTracker(sessionId, config);
}

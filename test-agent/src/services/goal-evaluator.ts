/**
 * Goal Evaluator Service
 *
 * Evaluates final test results based on goal completion and constraint satisfaction.
 */

import type {
  ConversationGoal,
  GoalContext,
  GoalResult,
  CollectableField,
} from '../tests/types/goals';
import type {
  GoalOrientedTestCase,
  GoalTestResult,
  TestConstraint,
  ConstraintViolation,
} from '../tests/types/goal-test';
import type { ProgressState, ProgressIssue } from '../tests/types/progress';
import type { ConversationTurn } from '../tests/test-case';

/**
 * Goal Evaluator Service
 *
 * Evaluates whether a goal-oriented test passed or failed.
 */
export class GoalEvaluator {
  /**
   * Evaluate the final test result
   */
  evaluateTest(
    testCase: GoalOrientedTestCase,
    progress: ProgressState,
    conversationHistory: ConversationTurn[],
    durationMs: number
  ): GoalTestResult {
    // Evaluate each goal
    const goalResults = this.evaluateAllGoals(
      testCase.goals,
      progress,
      conversationHistory
    );

    // Check constraints
    const constraintViolations = this.checkAllConstraints(
      testCase.constraints,
      progress,
      conversationHistory,
      durationMs
    );

    // Determine overall pass/fail
    const passed = this.determinePassFail(
      testCase.goals,
      goalResults,
      constraintViolations
    );

    // Generate summary
    const summary = this.generateSummary(
      passed,
      goalResults,
      constraintViolations,
      progress
    );

    return {
      passed,
      goalResults,
      constraintViolations,
      summary,
      progress,
      transcript: conversationHistory,
      turnCount: progress.turnNumber,
      durationMs,
      issues: progress.issues,
    };
  }

  /**
   * Evaluate all goals
   */
  private evaluateAllGoals(
    goals: ConversationGoal[],
    progress: ProgressState,
    conversationHistory: ConversationTurn[]
  ): GoalResult[] {
    const context = this.buildGoalContext(progress, conversationHistory);
    return goals.map(goal => this.evaluateGoal(goal, context, progress));
  }

  /**
   * Evaluate a single goal
   */
  private evaluateGoal(
    goal: ConversationGoal,
    context: GoalContext,
    progress: ProgressState
  ): GoalResult {
    // FIRST: Check if this goal was already completed during the conversation
    // This is important because state may change after goal completion
    if (progress.completedGoals.includes(goal.id)) {
      return {
        goalId: goal.id,
        passed: true,
        message: `Goal completed during conversation`,
      };
    }

    switch (goal.type) {
      case 'data_collection':
        return this.evaluateDataCollectionGoal(goal, progress);

      case 'booking_confirmed':
        return this.evaluateBookingGoal(goal.id, context, progress);

      case 'transfer_initiated':
        return this.evaluateTransferGoal(goal.id, context, progress);

      case 'conversation_ended':
        return this.evaluateConversationEndedGoal(goal.id, progress);

      case 'error_handled':
        return this.evaluateErrorHandledGoal(goal.id, context, progress);

      case 'custom':
        if (goal.successCriteria) {
          const passed = goal.successCriteria(context);
          return {
            goalId: goal.id,
            passed,
            message: passed ? 'Custom criteria met' : 'Custom criteria not met',
          };
        }
        return {
          goalId: goal.id,
          passed: false,
          message: 'No success criteria defined for custom goal',
        };

      default:
        return {
          goalId: goal.id,
          passed: false,
          message: `Unknown goal type: ${goal.type}`,
        };
    }
  }

  /**
   * Evaluate data collection goal
   */
  private evaluateDataCollectionGoal(
    goal: ConversationGoal,
    progress: ProgressState
  ): GoalResult {
    const requiredFields = goal.requiredFields ?? [];
    const collectedKeys = Array.from(progress.collectedFields.keys());
    const missing = requiredFields.filter(f => !collectedKeys.includes(f));

    return {
      goalId: goal.id,
      passed: missing.length === 0,
      message: missing.length === 0
        ? `All ${requiredFields.length} required fields collected`
        : `Missing ${missing.length} of ${requiredFields.length} fields: ${missing.join(', ')}`,
      details: {
        required: requiredFields,
        collected: collectedKeys.filter(k => requiredFields.includes(k)),
        missing,
      },
    };
  }

  /**
   * Evaluate booking confirmed goal
   */
  private evaluateBookingGoal(
    goalId: string,
    context: GoalContext,
    progress: ProgressState
  ): GoalResult {
    // Check multiple sources - bookingConfirmed is a persistent flag that survives
    // subsequent intents like saying_goodbye after booking is complete
    const confirmed = progress.bookingConfirmed ||  // Persistent flag set when confirming_booking detected
      context.agentConfirmedBooking ||
      progress.currentFlowState === 'confirmation' ||
      progress.completedGoals.includes(goalId);

    return {
      goalId,
      passed: confirmed,
      message: confirmed
        ? 'Agent confirmed the booking'
        : 'Booking was not confirmed',
    };
  }

  /**
   * Evaluate transfer initiated goal
   */
  private evaluateTransferGoal(
    goalId: string,
    context: GoalContext,
    progress: ProgressState
  ): GoalResult {
    const transferred = context.agentInitiatedTransfer ||
      progress.currentFlowState === 'transfer' ||
      progress.completedGoals.includes(goalId);

    return {
      goalId,
      passed: transferred,
      message: transferred
        ? 'Agent transferred to live agent'
        : 'Transfer was not initiated',
    };
  }

  /**
   * Evaluate conversation ended goal
   */
  private evaluateConversationEndedGoal(goalId: string, progress: ProgressState): GoalResult {
    const ended = progress.currentFlowState === 'ended' ||
      progress.lastAgentIntent === 'saying_goodbye';

    return {
      goalId,
      passed: ended,
      message: ended
        ? 'Conversation ended properly with goodbye'
        : 'Conversation did not end properly',
    };
  }

  /**
   * Evaluate error handled goal
   */
  private evaluateErrorHandledGoal(
    goalId: string,
    context: GoalContext,
    progress: ProgressState
  ): GoalResult {
    // Check if there were error situations and they were handled
    const hadErrors = progress.issues.some(i => i.type === 'error');
    const handledGracefully = progress.lastAgentIntent !== 'handling_error' ||
      progress.completedGoals.length > 0;

    return {
      goalId,
      passed: !hadErrors || handledGracefully,
      message: hadErrors
        ? (handledGracefully ? 'Errors were handled gracefully' : 'Errors were not handled properly')
        : 'No errors occurred',
    };
  }

  /**
   * Check all constraints
   */
  private checkAllConstraints(
    constraints: TestConstraint[],
    progress: ProgressState,
    conversationHistory: ConversationTurn[],
    durationMs: number
  ): ConstraintViolation[] {
    const violations: ConstraintViolation[] = [];
    const context = this.buildGoalContext(progress, conversationHistory);

    for (const constraint of constraints) {
      const violation = this.checkConstraint(constraint, context, progress, durationMs);
      if (violation) {
        violations.push(violation);
      }
    }

    return violations;
  }

  /**
   * Convert backend turn number to transcript-based turn number.
   *
   * Backend turnNumber counts conversation exchanges (user-assistant pairs).
   * Frontend expects turns as individual messages (1-indexed).
   *
   * Formula: transcriptTurn = 2 * backendTurn
   * This points to the assistant message at that conversation turn.
   */
  private toTranscriptTurn(backendTurn: number): number {
    return 2 * backendTurn;
  }

  /**
   * Check a single constraint
   */
  private checkConstraint(
    constraint: TestConstraint,
    context: GoalContext,
    progress: ProgressState,
    durationMs: number
  ): ConstraintViolation | null {
    // Convert backend turn to transcript-based turn for frontend display
    const transcriptTurn = this.toTranscriptTurn(progress.turnNumber);

    switch (constraint.type) {
      case 'must_happen':
        if (constraint.condition && !constraint.condition(context)) {
          return {
            constraint,
            message: `Required condition not met: ${constraint.description}`,
          };
        }
        return null;

      case 'must_not_happen':
        if (constraint.condition && constraint.condition(context)) {
          return {
            constraint,
            message: `Forbidden condition occurred: ${constraint.description}`,
            turnNumber: transcriptTurn,
          };
        }
        return null;

      case 'max_turns':
        if (constraint.maxTurns && progress.turnNumber > constraint.maxTurns) {
          return {
            constraint,
            message: `Exceeded max turns: ${progress.turnNumber} > ${constraint.maxTurns}`,
            turnNumber: transcriptTurn,
          };
        }
        return null;

      case 'max_time':
        if (constraint.maxTimeMs && durationMs > constraint.maxTimeMs) {
          return {
            constraint,
            message: `Exceeded max time: ${durationMs}ms > ${constraint.maxTimeMs}ms`,
          };
        }
        return null;

      default:
        return null;
    }
  }

  /**
   * Determine overall pass/fail
   */
  private determinePassFail(
    goals: ConversationGoal[],
    goalResults: GoalResult[],
    violations: ConstraintViolation[]
  ): boolean {
    // Check for critical constraint violations
    const criticalViolations = violations.filter(v => v.constraint.severity === 'critical');
    if (criticalViolations.length > 0) {
      return false;
    }

    // Check required goals
    for (const goal of goals) {
      if (!goal.required) continue;
      const result = goalResults.find(r => r.goalId === goal.id);
      if (!result || !result.passed) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate human-readable summary
   */
  private generateSummary(
    passed: boolean,
    goalResults: GoalResult[],
    violations: ConstraintViolation[],
    progress: ProgressState
  ): string {
    const parts: string[] = [];

    // Overall status
    parts.push(passed ? 'TEST PASSED' : 'TEST FAILED');

    // Goal summary
    const passedGoals = goalResults.filter(r => r.passed).length;
    const totalGoals = goalResults.length;
    parts.push(`Goals: ${passedGoals}/${totalGoals} achieved`);

    // Failed goals
    const failedGoals = goalResults.filter(r => !r.passed);
    if (failedGoals.length > 0) {
      parts.push(`Failed goals: ${failedGoals.map(g => g.goalId).join(', ')}`);
    }

    // Constraint violations
    if (violations.length > 0) {
      parts.push(`Violations: ${violations.length}`);
      const critical = violations.filter(v => v.constraint.severity === 'critical');
      if (critical.length > 0) {
        parts.push(`Critical: ${critical.map(v => v.constraint.description).join('; ')}`);
      }
    }

    // Progress info
    parts.push(`Turns: ${progress.turnNumber}`);
    parts.push(`Fields collected: ${progress.collectedFields.size}`);

    // Issues
    if (progress.issues.length > 0) {
      parts.push(`Issues detected: ${progress.issues.length}`);
    }

    return parts.join(' | ');
  }

  /**
   * Build goal context for evaluations
   */
  private buildGoalContext(
    progress: ProgressState,
    conversationHistory: ConversationTurn[]
  ): GoalContext {
    return {
      collectedData: progress.collectedFields as Map<CollectableField, any>,
      conversationHistory,
      // Include persistent flags that survive subsequent intents
      agentConfirmedBooking:
        progress.bookingConfirmed ||  // Persistent flag
        progress.lastAgentIntent === 'confirming_booking' ||
        progress.currentFlowState === 'confirmation',
      agentInitiatedTransfer:
        progress.transferInitiated ||  // Persistent flag
        progress.lastAgentIntent === 'initiating_transfer' ||
        progress.currentFlowState === 'transfer',
      turnCount: progress.turnNumber,
      elapsedTimeMs: Date.now() - progress.startedAt.getTime(),
    };
  }

  /**
   * Generate detailed failure report
   */
  generateFailureReport(result: GoalTestResult): string {
    if (result.passed) {
      return 'Test passed - no failures to report';
    }

    const lines: string[] = ['=== FAILURE REPORT ===', ''];

    // Failed goals
    const failedGoals = result.goalResults.filter(r => !r.passed);
    if (failedGoals.length > 0) {
      lines.push('FAILED GOALS:');
      for (const goal of failedGoals) {
        lines.push(`  - ${goal.goalId}: ${goal.message}`);
        if (goal.details?.missing) {
          lines.push(`    Missing fields: ${goal.details.missing.join(', ')}`);
        }
      }
      lines.push('');
    }

    // Constraint violations
    if (result.constraintViolations.length > 0) {
      lines.push('CONSTRAINT VIOLATIONS:');
      for (const violation of result.constraintViolations) {
        lines.push(`  - [${violation.constraint.severity}] ${violation.message}`);
        if (violation.turnNumber) {
          lines.push(`    At turn: ${violation.turnNumber}`);
        }
      }
      lines.push('');
    }

    // Issues
    if (result.issues.length > 0) {
      lines.push('DETECTED ISSUES:');
      for (const issue of result.issues) {
        lines.push(`  - [${issue.severity}] ${issue.type}: ${issue.description}`);
        lines.push(`    At turn: ${issue.turnNumber}`);
      }
      lines.push('');
    }

    // Progress summary
    lines.push('FINAL STATE:');
    lines.push(`  Turns: ${result.turnCount}`);
    lines.push(`  Duration: ${result.durationMs}ms`);
    lines.push(`  Flow state: ${result.progress.currentFlowState}`);
    lines.push(`  Fields collected: ${result.progress.collectedFields.size}`);
    lines.push(`  Fields pending: ${result.progress.pendingFields.length}`);

    return lines.join('\n');
  }
}

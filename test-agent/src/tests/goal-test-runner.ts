/**
 * Goal-Oriented Test Runner
 *
 * Executes goal-oriented tests using dynamic conversation flow.
 * Instead of fixed step sequences, it adapts to what the agent asks
 * and generates appropriate responses from persona inventory.
 *
 * Supports A/B experiment context for variant testing.
 */

import { FlowiseClient, FlowiseResponse } from '../core/flowise-client';
import { Database, TestResult, ApiCall } from '../storage/database';
import { IntentDetector } from '../services/intent-detector';
import { ResponseGenerator } from '../services/response-generator';
import { ProgressTracker } from '../services/progress-tracker';
import { GoalEvaluator } from '../services/goal-evaluator';
import { DataGeneratorService, personaHasDynamicFields } from '../services/data-generator';
import {
  ExperimentService,
  VariantService,
  type VariantSelection,
} from '../services/ab-testing';
// New category-based system
import { CategoryClassifier, getCategoryClassifier } from '../services/category-classifier';
import { ResponseStrategyEngine, createResponseStrategyEngine } from '../services/response-strategy-engine';
import type { CategoryClassificationResult, DataFieldCategory } from '../schemas/response-category-schemas';
import type { GoalOrientedTestCase, GoalTestResult } from './types/goal-test';
import type { ConversationTurn, Finding } from './test-case';
import type { IntentDetectionResult } from './types/intent';
import type { UserPersona, DynamicUserPersona, ResolvedPersona } from './types/persona';
import type { CollectableField } from './types/goals';
import { config } from '../config/config';

/**
 * Pattern definitions for extracting volunteered data from user messages.
 * This helps track data that users provide without being explicitly asked.
 */
interface VolunteeredData {
  field: CollectableField;
  value: string;
}

/**
 * Extract volunteered data from a user message.
 * Detects phone numbers, emails, names, and other data that users
 * commonly provide upfront without being asked.
 */
function extractVolunteeredData(message: string): VolunteeredData[] {
  const extracted: VolunteeredData[] = [];

  // Phone number patterns (US format)
  const phonePatterns = [
    /\b(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b/,
    /\b(\(\d{3}\)\s?\d{3}[-.\s]?\d{4})\b/,
    /\b(1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4})\b/,
  ];
  for (const pattern of phonePatterns) {
    const match = message.match(pattern);
    if (match) {
      extracted.push({ field: 'parent_phone', value: match[1] });
      break;
    }
  }

  // Email pattern
  const emailPattern = /\b([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/i;
  const emailMatch = message.match(emailPattern);
  if (emailMatch) {
    extracted.push({ field: 'parent_email', value: emailMatch[1] });
  }

  // Insurance provider names (common ones)
  const insurancePatterns = [
    /\b(aetna|cigna|united\s*health|blue\s*cross|anthem|humana|kaiser|keystone\s*first|medicaid|medicare)\b/i,
    /\binsurance\s+is\s+([a-zA-Z\s]+?)(?:\.|,|$)/i,
    /\bthrough\s+([a-zA-Z\s]+?)(?:\s+insurance|\.|,|$)/i,
  ];
  for (const pattern of insurancePatterns) {
    const match = message.match(pattern);
    if (match) {
      extracted.push({ field: 'insurance', value: match[1].trim() });
      break;
    }
  }

  // Name extraction - look for "I'm [Name]" or "my name is [Name]" or "this is [Name]"
  const namePatterns = [
    /\b(?:i'?m|my name is|this is)\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\b/i,
    /\bhi,?\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)?)\s+(?:here|calling)\b/i,
  ];
  for (const pattern of namePatterns) {
    const match = message.match(pattern);
    if (match) {
      // Only add if it looks like a real name (not a common word)
      const name = match[1];
      const commonWords = ['calling', 'looking', 'trying', 'wanting', 'needing', 'interested'];
      if (!commonWords.includes(name.toLowerCase())) {
        extracted.push({ field: 'parent_name', value: name });
        break;
      }
    }
  }

  return extracted;
}

/**
 * Configuration for the goal test runner
 */
export interface GoalTestRunnerConfig {
  /** Max turns before aborting (safety limit) */
  maxTurns: number;

  /** Delay between turns in ms */
  delayBetweenTurns: number;

  /** Timeout for a single turn in ms */
  turnTimeout: number;

  /** Whether to save progress snapshots */
  saveProgressSnapshots: boolean;

  /** Whether to continue on non-critical errors */
  continueOnError: boolean;

  /**
   * Use the new category-based classification and response system.
   * When true, uses CategoryClassifier + ResponseStrategyEngine.
   * When false, uses legacy IntentDetector + ResponseGenerator.
   */
  useCategoryBasedSystem: boolean;
}

const DEFAULT_CONFIG: GoalTestRunnerConfig = {
  maxTurns: 50,
  delayBetweenTurns: 500,
  turnTimeout: 30000,
  saveProgressSnapshots: true,
  continueOnError: true,
  useCategoryBasedSystem: true, // Default to new system
};

/**
 * Options for running a test with A/B experiment context
 */
export interface ExperimentRunOptions {
  /** Experiment ID to run the test under */
  experimentId: string;
  /** Run ID for this test execution */
  runId: string;
}

/**
 * Goal-Oriented Test Runner
 *
 * Executes tests by:
 * 1. Sending initial message to agent
 * 2. Detecting what agent asks for (IntentDetector)
 * 3. Generating appropriate response from persona (ResponseGenerator)
 * 4. Tracking progress toward goals (ProgressTracker)
 * 5. Continuing until goals complete or max turns reached
 * 6. Evaluating final result (GoalEvaluator)
 *
 * Supports A/B experiment context:
 * - When experimentId is provided, selects a variant
 * - Applies the variant temporarily during test execution
 * - Records experiment run metrics
 * - Rolls back variant after test completion
 */
export class GoalTestRunner {
  private flowiseClient: FlowiseClient;
  private database: Database;
  private intentDetector: IntentDetector;
  private config: GoalTestRunnerConfig;
  private experimentService: ExperimentService | null = null;
  private variantService: VariantService | null = null;

  // New category-based system
  private categoryClassifier: CategoryClassifier;
  private responseStrategyEngine: ResponseStrategyEngine;

  constructor(
    flowiseClient: FlowiseClient,
    database: Database,
    intentDetector: IntentDetector,
    cfg?: Partial<GoalTestRunnerConfig>
  ) {
    this.flowiseClient = flowiseClient;
    this.database = database;
    this.intentDetector = intentDetector;
    this.config = { ...DEFAULT_CONFIG, ...cfg };

    // Initialize new category-based services
    this.categoryClassifier = getCategoryClassifier();
    this.responseStrategyEngine = createResponseStrategyEngine({
      useLlmForComplex: false, // Templates by default
    });

    if (this.config.useCategoryBasedSystem) {
      console.log('[GoalTestRunner] Using category-based classification system');
    } else {
      console.log('[GoalTestRunner] Using legacy intent-based system');
    }
  }

  /**
   * Set A/B testing services for experiment support
   */
  setABTestingServices(
    experimentService: ExperimentService,
    variantService: VariantService
  ): void {
    this.experimentService = experimentService;
    this.variantService = variantService;
  }

  /**
   * Run a goal-oriented test
   * @param testCase The test case to run
   * @param runId The run ID for this test execution
   * @param testIdOverride Optional override for testId (e.g., "GOAL-HAPPY-001#2" for second run)
   * @param experimentOptions Optional A/B experiment context
   */
  async runTest(
    testCase: GoalOrientedTestCase,
    runId: string,
    testIdOverride?: string,
    experimentOptions?: ExperimentRunOptions
  ): Promise<GoalTestResult> {
    // If experiment context provided, delegate to experiment-aware execution
    if (experimentOptions && this.experimentService && this.variantService) {
      return this.runTestWithExperiment(testCase, runId, testIdOverride, experimentOptions);
    }

    // Use testIdOverride for storage if provided (supports multiple runs of same test)
    const effectiveTestId = testIdOverride || testCase.id;
    const startTime = Date.now();
    const transcript: ConversationTurn[] = [];

    // Resolve dynamic fields if present
    let resolvedPersona: ResolvedPersona | undefined;
    let personaToUse: UserPersona;

    if (personaHasDynamicFields(testCase.persona as DynamicUserPersona)) {
      const dataGenerator = new DataGeneratorService();
      resolvedPersona = dataGenerator.resolvePersona(testCase.persona as DynamicUserPersona);
      personaToUse = resolvedPersona.resolved;

      console.log(`[GoalTestRunner] Resolved ${resolvedPersona.metadata.dynamicFields.length} dynamic fields (seed: ${resolvedPersona.metadata.seed})`);
    } else {
      personaToUse = testCase.persona;
    }

    // Initialize services for this test using resolved persona
    const responseGenerator = new ResponseGenerator(personaToUse, {
      useLlm: testCase.responseConfig.useLlmResponses,
    });
    const progressTracker = new ProgressTracker(testCase.goals);
    const goalEvaluator = new GoalEvaluator();

    // Start new Flowise session
    this.flowiseClient.newSession();

    let turnNumber = 0;
    let lastError: string | undefined;

    try {
      // Resolve initial message (can be string or function)
      const initialMessage = typeof testCase.initialMessage === 'function'
        ? testCase.initialMessage(testCase.persona)
        : testCase.initialMessage;

      // Send initial message
      const initialResponse = await this.sendMessage(
        initialMessage,
        transcript,
        'initial',
        runId,
        testCase.id
      );

      if (!initialResponse) {
        throw new Error('Failed to get initial response from agent');
      }

      turnNumber = 1;

      // Track child index for multi-child scenarios
      let currentChildIndex = 0;
      const providedFields = new Set<DataFieldCategory>();

      // Extract volunteered data from initial message
      const initialVolunteeredData = extractVolunteeredData(initialMessage);
      for (const { field, value } of initialVolunteeredData) {
        progressTracker.markFieldCollected(field, value, 1);
        console.log(`[GoalTestRunner] Extracted volunteered ${field}: ${value}`);
      }

      // Main conversation loop
      while (!this.shouldStop(progressTracker, turnNumber, testCase)) {
        // Get the last agent response
        const lastAgentTurn = transcript.filter(t => t.role === 'assistant').pop();
        if (!lastAgentTurn) break;

        let intentResult: IntentDetectionResult;
        let userResponse: string;

        if (this.config.useCategoryBasedSystem) {
          // New category-based system
          const classification = await this.categoryClassifier.classify(
            lastAgentTurn.content,
            transcript,
            personaToUse
          );

          // Check if conversation should end
          if (this.categoryClassifier.isTerminal(classification)) {
            console.log(`[GoalTestRunner] Terminal state: ${classification.terminalState}`);
            intentResult = this.categoryClassifier.toLegacyIntent(classification);
            progressTracker.updateProgress(intentResult, '', turnNumber);
            break;
          }

          // Detect child advancement
          if (/\b(next|other|second|third)\s+(child|kid|patient)\b/i.test(lastAgentTurn.content)) {
            if (currentChildIndex < personaToUse.inventory.children.length - 1) {
              currentChildIndex++;
              console.log(`[GoalTestRunner] Advanced to child ${currentChildIndex + 1}`);
            }
          }

          // Generate response using strategy engine
          userResponse = await this.responseStrategyEngine.generateResponse(
            classification,
            personaToUse,
            {
              currentChildIndex,
              providedFields,
              conversationHistory: transcript,
              turnNumber,
            }
          );

          // Mark provided fields
          if (classification.dataFields) {
            for (const field of classification.dataFields) {
              providedFields.add(field);
            }
          }

          // Convert to legacy intent for progress tracker
          intentResult = this.categoryClassifier.toLegacyIntent(classification);
        } else {
          // Legacy intent-based system
          intentResult = await this.intentDetector.detectIntent(
            lastAgentTurn.content,
            transcript,
            progressTracker.getPendingFields()
          );

          // Check if conversation should end
          if (this.isTerminalIntent(intentResult)) {
            console.log(`[GoalTestRunner] Terminal intent detected: ${intentResult.primaryIntent}`);
            progressTracker.updateProgress(intentResult, '', turnNumber);
            break;
          }

          // Generate user response based on intent
          userResponse = await responseGenerator.generateResponse(intentResult, transcript);
        }

        // Update progress tracker
        progressTracker.updateProgress(intentResult, userResponse, turnNumber);

        // Extract any volunteered data from user response
        const volunteeredData = extractVolunteeredData(userResponse);
        for (const { field, value } of volunteeredData) {
          progressTracker.markFieldCollected(field, value, turnNumber);
        }

        // Check for abort conditions
        if (progressTracker.shouldAbort()) {
          console.log('[GoalTestRunner] Critical issue detected, aborting');
          break;
        }

        // Send user response to agent
        turnNumber++;
        const agentResponse = await this.sendMessage(
          userResponse,
          transcript,
          `turn-${turnNumber}`,
          runId,
          testCase.id
        );

        if (!agentResponse && !this.config.continueOnError) {
          throw new Error(`Failed to get response at turn ${turnNumber}`);
        }

        // Save progress snapshot if enabled
        if (this.config.saveProgressSnapshots) {
          this.saveProgressSnapshot(runId, testCase.id, turnNumber, progressTracker);
        }

        // Delay between turns
        if (this.config.delayBetweenTurns > 0) {
          await this.delay(this.config.delayBetweenTurns);
        }
      }
    } catch (error: any) {
      lastError = error.message;
      console.error('[GoalTestRunner] Test execution error:', error);
    }

    // Calculate duration
    const durationMs = Date.now() - startTime;

    // Evaluate final result
    const result = goalEvaluator.evaluateTest(
      testCase,
      progressTracker.getState(),
      transcript,
      durationMs
    );

    // Save to database (include resolved persona if dynamic fields were used)
    // Use effectiveTestId to ensure multiple runs of same test are stored separately
    this.saveGoalTestResult(runId, effectiveTestId, testCase, result, transcript, lastError, resolvedPersona);

    return result;
  }

  /**
   * Run multiple goal tests
   */
  async runTests(
    testCases: GoalOrientedTestCase[],
    runId: string
  ): Promise<Map<string, GoalTestResult>> {
    const results = new Map<string, GoalTestResult>();

    for (const testCase of testCases) {
      console.log(`\n[GoalTestRunner] Running: ${testCase.id} - ${testCase.name}`);

      const result = await this.runTest(testCase, runId);
      results.set(testCase.id, result);

      console.log(`[GoalTestRunner] ${testCase.id}: ${result.passed ? 'PASSED' : 'FAILED'}`);
      console.log(`  Summary: ${result.summary}`);
    }

    return results;
  }

  /**
   * Run a test with A/B experiment context
   * This method:
   * 1. Selects a variant from the experiment
   * 2. Applies the variant temporarily
   * 3. Runs the test
   * 4. Records experiment run metrics
   * 5. Rolls back the variant
   */
  private async runTestWithExperiment(
    testCase: GoalOrientedTestCase,
    runId: string,
    testIdOverride: string | undefined,
    experimentOptions: ExperimentRunOptions
  ): Promise<GoalTestResult> {
    const { experimentId } = experimentOptions;
    const effectiveTestId = testIdOverride || testCase.id;

    // These are guaranteed to be set by the caller
    const experimentService = this.experimentService!;
    const variantService = this.variantService!;

    // Select variant for this test run
    let variantSelection: VariantSelection;
    try {
      variantSelection = experimentService.selectVariant(experimentId, effectiveTestId);
      console.log(`[GoalTestRunner] Selected variant: ${variantSelection.variantId} (${variantSelection.role})`);
    } catch (error: any) {
      console.error(`[GoalTestRunner] Failed to select variant: ${error.message}`);
      throw error;
    }

    // Apply the variant temporarily
    try {
      await variantService.applyVariant(variantSelection.variantId);
      console.log(`[GoalTestRunner] Applied variant to ${variantSelection.targetFile}`);
    } catch (error: any) {
      console.error(`[GoalTestRunner] Failed to apply variant: ${error.message}`);
      throw error;
    }

    const startTime = Date.now();
    let result: GoalTestResult;
    let constraintViolationCount = 0;
    let errorOccurred = false;

    try {
      // Run the test normally (without experiment options to avoid recursion)
      result = await this.runTest(testCase, runId, testIdOverride);

      // Count constraint violations
      constraintViolationCount = result.constraintViolations.length;
    } catch (error: any) {
      // Test execution failed
      errorOccurred = true;
      console.error(`[GoalTestRunner] Test execution failed: ${error.message}`);

      // Create a failed result with minimal progress state
      const now = new Date();
      result = {
        passed: false,
        turnCount: 0,
        durationMs: Date.now() - startTime,
        goalResults: testCase.goals.map(g => ({
          goalId: g.id,
          description: g.description,
          passed: false,
          message: `Test execution error: ${error.message}`,
        })),
        constraintViolations: [],
        issues: [{
          type: 'error' as const,
          severity: 'critical' as const,
          description: `Test execution error: ${error.message}`,
          turnNumber: 0,
        }],
        summary: `Test failed due to error: ${error.message}`,
        progress: {
          collectedFields: new Map(),
          pendingFields: [],
          completedGoals: [],
          activeGoals: [],
          failedGoals: testCase.goals.map(g => g.id),
          currentFlowState: 'error',
          turnNumber: 0,
          lastAgentIntent: 'unknown',
          intentHistory: [],
          bookingConfirmed: false,
          transferInitiated: false,
          startedAt: now,
          lastActivityAt: now,
          issues: [{
            type: 'error' as const,
            severity: 'critical' as const,
            description: `Test execution error: ${error.message}`,
            turnNumber: 0,
          }],
        },
        transcript: [],
      };
    } finally {
      // Always rollback the variant
      try {
        await variantService.rollback(variantSelection.targetFile);
        console.log(`[GoalTestRunner] Rolled back variant from ${variantSelection.targetFile}`);
      } catch (rollbackError: any) {
        console.error(`[GoalTestRunner] Failed to rollback variant: ${rollbackError.message}`);
      }
    }

    // Record experiment run
    try {
      // Calculate goals completed
      const goalsCompleted = result.goalResults.filter(g => g.passed).length;
      const goalsTotal = result.goalResults.length;

      experimentService.recordTestResult(
        experimentId,
        runId,
        effectiveTestId,
        variantSelection,
        {
          passed: result.passed,
          turnCount: result.turnCount,
          durationMs: result.durationMs,
          goalCompletionRate: goalsTotal > 0 ? goalsCompleted / goalsTotal : 0,
          constraintViolations: constraintViolationCount,
          errorOccurred,
          goalsCompleted,
          goalsTotal,
          issuesDetected: result.issues.length,
        }
      );
      console.log(`[GoalTestRunner] Recorded experiment run for ${experimentId}`);
    } catch (recordError: any) {
      console.error(`[GoalTestRunner] Failed to record experiment run: ${recordError.message}`);
    }

    return result;
  }

  /**
   * Run multiple tests as part of an A/B experiment
   */
  async runTestsWithExperiment(
    testCases: GoalOrientedTestCase[],
    runId: string,
    experimentId: string
  ): Promise<Map<string, GoalTestResult>> {
    const results = new Map<string, GoalTestResult>();

    for (const testCase of testCases) {
      console.log(`\n[GoalTestRunner] Running experiment: ${testCase.id} - ${testCase.name}`);

      const result = await this.runTest(testCase, runId, undefined, {
        experimentId,
        runId,
      });
      results.set(testCase.id, result);

      console.log(`[GoalTestRunner] ${testCase.id}: ${result.passed ? 'PASSED' : 'FAILED'}`);
      console.log(`  Summary: ${result.summary}`);
    }

    return results;
  }

  /**
   * Send a message to the agent and record transcript
   */
  private async sendMessage(
    message: string,
    transcript: ConversationTurn[],
    stepId: string,
    runId: string,
    testId: string
  ): Promise<FlowiseResponse | null> {
    // Record user turn
    const userTurn: ConversationTurn = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      stepId,
    };
    transcript.push(userTurn);

    try {
      // Send to Flowise
      const response = await this.flowiseClient.sendMessage(message);

      // Record assistant turn
      const assistantTurn: ConversationTurn = {
        role: 'assistant',
        content: response.text,
        timestamp: new Date().toISOString(),
        responseTimeMs: response.responseTime,
        stepId,
      };
      transcript.push(assistantTurn);

      // Save API calls (tool calls)
      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          const apiCall: ApiCall = {
            runId,
            testId,
            stepId,
            toolName: toolCall.toolName,
            requestPayload: toolCall.input ? JSON.stringify(toolCall.input) : undefined,
            responsePayload: toolCall.output ? JSON.stringify(toolCall.output) : undefined,
            status: toolCall.status,
            durationMs: toolCall.durationMs,
            timestamp: new Date().toISOString(),
          };
          this.database.saveApiCall(apiCall);
        }
      }

      return response;
    } catch (error: any) {
      // Record error turn
      const errorTurn: ConversationTurn = {
        role: 'assistant',
        content: `[ERROR: ${error.message}]`,
        timestamp: new Date().toISOString(),
        stepId,
        validationPassed: false,
        validationMessage: error.message,
      };
      transcript.push(errorTurn);

      console.error(`[GoalTestRunner] Message send failed:`, error.message);
      return null;
    }
  }

  /**
   * Determine if the test should stop
   */
  private shouldStop(
    tracker: ProgressTracker,
    turnNumber: number,
    testCase: GoalOrientedTestCase
  ): boolean {
    // Check if all required goals are complete
    if (tracker.areGoalsComplete()) {
      console.log('[GoalTestRunner] All required goals complete');
      return true;
    }

    // Check if any goals have failed
    if (tracker.hasFailedGoals()) {
      console.log('[GoalTestRunner] Goals failed, stopping');
      return true;
    }

    // Check max turns
    const maxTurns = testCase.responseConfig.maxTurns || this.config.maxTurns;
    if (turnNumber >= maxTurns) {
      console.log(`[GoalTestRunner] Max turns (${maxTurns}) reached`);
      return true;
    }

    return false;
  }

  /**
   * Check if intent indicates conversation should end
   *
   * IMPORTANT: Stop for terminal intents where there's nothing more to do.
   * - saying_goodbye: Conversation ending
   * - confirming_booking: Booking confirmed (success)
   * - initiating_transfer: Bot is transferring to human agent (failure - booking incomplete)
   *
   * Do NOT stop for:
   * - offering_time_slots: User needs to select a time
   * - confirming_information: User needs to confirm
   * - searching_availability: Bot is looking up times
   */
  private isTerminalIntent(intent: IntentDetectionResult): boolean {
    // These intents end the conversation
    const terminalIntents = [
      'saying_goodbye',       // Agent said goodbye - conversation over
      'confirming_booking',   // Booking was confirmed - success
      'initiating_transfer',  // Agent transferring to human - stop to avoid loop
    ];

    // For terminal intents, we need to be sure the conversation is actually ending
    if (terminalIntents.includes(intent.primaryIntent)) {
      // confirming_booking should only be terminal if confidence is high
      if (intent.primaryIntent === 'confirming_booking' && intent.confidence < 0.8) {
        return false; // Not confident enough, continue conversation
      }
      return true;
    }

    // Don't stop for other intents - let the conversation continue
    // The goal evaluator will determine success/failure based on goals achieved
    return false;
  }

  /**
   * Save a progress snapshot
   */
  private saveProgressSnapshot(
    runId: string,
    testId: string,
    turnNumber: number,
    tracker: ProgressTracker
  ): void {
    try {
      const state = tracker.getState();
      this.database.saveGoalProgressSnapshot({
        runId,
        testId,
        turnNumber,
        collectedFieldsJson: JSON.stringify(Array.from(state.collectedFields.entries())),
        pendingFieldsJson: JSON.stringify(state.pendingFields),
        issuesJson: JSON.stringify(state.issues),
      });
    } catch (error) {
      console.warn('[GoalTestRunner] Failed to save progress snapshot:', error);
    }
  }

  /**
   * Save goal test result to database
   * @param runId The run ID
   * @param testId The effective test ID (may include #N suffix for multiple runs)
   * @param testCase The original test case definition
   * @param result The test result
   * @param transcript The conversation transcript
   * @param errorMessage Optional error message
   * @param resolvedPersona Optional resolved persona for dynamic tests
   */
  private saveGoalTestResult(
    runId: string,
    testId: string,
    testCase: GoalOrientedTestCase,
    result: GoalTestResult,
    transcript: ConversationTurn[],
    errorMessage?: string,
    resolvedPersona?: ResolvedPersona
  ): void {
    try {
      // Convert to TestResult format for compatibility
      const findings: Finding[] = [];

      // Add findings from failed goals
      for (const goalResult of result.goalResults) {
        if (!goalResult.passed) {
          findings.push({
            type: 'prompt-issue',
            severity: 'high',
            title: `Goal failed: ${goalResult.goalId}`,
            description: goalResult.message,
            recommendation: goalResult.details?.missing
              ? `Missing fields: ${goalResult.details.missing.join(', ')}`
              : 'Review conversation flow',
          });
        }
      }

      // Add findings from constraint violations
      for (const violation of result.constraintViolations) {
        findings.push({
          type: violation.constraint.severity === 'critical' ? 'bug' : 'enhancement',
          severity: violation.constraint.severity === 'critical' ? 'critical' : 'medium',
          title: `Constraint violated: ${violation.constraint.description}`,
          description: violation.message,
          recommendation: 'Review constraint and fix behavior',
        });
      }

      // Add findings from issues
      for (const issue of result.issues) {
        findings.push({
          type: issue.type === 'error' ? 'bug' : 'prompt-issue',
          severity: issue.severity,
          title: `Issue: ${issue.type}`,
          description: issue.description,
          affectedStep: `turn-${issue.turnNumber}`,
        });
      }

      const testResult: TestResult = {
        runId,
        testId,  // Use the effective testId (may include #N suffix for multiple runs)
        testName: testCase.name,
        category: testCase.category,
        status: result.passed ? 'passed' : 'failed',
        startedAt: new Date(Date.now() - result.durationMs).toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: result.durationMs,
        errorMessage,
        transcript,
        findings,
      };

      const resultId = this.database.saveTestResult(testResult);

      // Save transcript
      if (transcript.length > 0) {
        this.database.saveTranscript(resultId, transcript);
      }

      // Save goal-specific results (include resolved persona if dynamic fields were used)
      this.database.saveGoalTestResult({
        runId,
        testId,  // Use the effective testId (may include #N suffix for multiple runs)
        passed: result.passed ? 1 : 0,
        turnCount: result.turnCount,
        durationMs: result.durationMs,
        startedAt: new Date(Date.now() - result.durationMs).toISOString(),
        completedAt: new Date().toISOString(),
        goalResultsJson: JSON.stringify(result.goalResults),
        constraintViolationsJson: JSON.stringify(result.constraintViolations),
        summaryText: result.summary,
        // Include resolved persona data for debugging/reproducibility
        resolvedPersonaJson: resolvedPersona ? JSON.stringify(resolvedPersona.resolved) : undefined,
        generationSeed: resolvedPersona?.metadata.seed,
      });
    } catch (error) {
      console.error('[GoalTestRunner] Failed to save test result:', error);
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Factory function to create a GoalTestRunner with default dependencies
 */
export function createGoalTestRunner(
  flowiseClient: FlowiseClient,
  database: Database,
  cfg?: Partial<GoalTestRunnerConfig>
): GoalTestRunner {
  const intentDetector = new IntentDetector();
  return new GoalTestRunner(flowiseClient, database, intentDetector, cfg);
}

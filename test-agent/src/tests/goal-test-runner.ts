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
import { SemanticClassifier, getSemanticClassifier } from '../services/semantic-classifier';
import { SemanticEntityExtractor, getSemanticEntityExtractor } from '../services/semantic-entity-extractor';
import { ResponseStrategyEngine, createResponseStrategyEngine } from '../services/response-strategy-engine';
import {
  ConversationContextTracker,
  createContextTracker,
  type ConversationAnomaly,
} from '../services/conversation-context-tracker';
import type { CategoryClassificationResult, DataFieldCategory } from '../schemas/response-category-schemas';
import type { GoalOrientedTestCase, GoalTestResult } from './types/goal-test';
import type { ConversationTurn, Finding } from './test-case';
import type { IntentDetectionResult } from './types/intent';
import type { UserPersona, DynamicUserPersona, ResolvedPersona } from './types/persona';
import type { CollectableField } from './types/goals';
import { config } from '../config/config';
import { getCurrentTraceContext } from '../../../shared/services';
import { resolveTemplate } from '../services/template-resolver';

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

  // Special needs extraction - detect when user mentions special needs upfront
  const specialNeedsPatterns = [
    /\b(?:has|have|with)\s+special\s+needs\b/i,
    /\bspecial\s+needs\s+(?:child|kid|son|daughter)\b/i,
    /\b(?:autism|adhd|anxiety|sensory)\b/i,
  ];
  for (const pattern of specialNeedsPatterns) {
    if (pattern.test(message)) {
      extracted.push({ field: 'special_needs', value: 'mentioned in initial message' });
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

  // Child count extraction - detect when user mentions number of children upfront
  const childCountPatterns = [
    /\bmy\s+(one|two|three|four|five|\d+)\s+(child|children|kids?)\b/i,
    /\b(one|two|three|four|five|\d+)\s+(child|children|kids?)\b/i,
    /\bfor\s+my\s+(one|two|three|four|five|\d+)\s+(child|children|kids?)\b/i,
    /\bschedule\b.{0,30}\b(one|two|three|four|five|\d+)\s+(child|children|kids?)\b/i,
  ];
  for (const pattern of childCountPatterns) {
    const match = message.match(pattern);
    if (match) {
      const countWord = match[1].toLowerCase();
      const countMap: Record<string, string> = {
        'one': '1', 'two': '2', 'three': '3', 'four': '4', 'five': '5'
      };
      const count = countMap[countWord] || countWord;
      extracted.push({ field: 'child_count', value: count });
      break;
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

  /**
   * Use the AI-first SemanticClassifier instead of pattern-based CategoryClassifier.
   * Only applies when useCategoryBasedSystem is true.
   * SemanticClassifier uses LLM for all classifications with intelligent caching.
   */
  useSemanticClassifier: boolean;

  /**
   * Use the AI-first SemanticEntityExtractor instead of regex-based extraction.
   * Extracts phone, email, names, etc. using LLM with format normalization.
   */
  useSemanticEntityExtractor: boolean;

  /**
   * Use ConversationContextTracker for rich context tracking.
   * Enables multi-child tracking, repetition analysis, and anomaly detection.
   */
  useContextTracker: boolean;
}

const DEFAULT_CONFIG: GoalTestRunnerConfig = {
  maxTurns: 50,
  delayBetweenTurns: 500,
  turnTimeout: 30000,
  // Disable snapshots during parallel runs to reduce SQLite contention
  saveProgressSnapshots: process.env.PARALLEL_MODE !== 'true',
  continueOnError: true,
  useCategoryBasedSystem: true, // Default to new system
  useSemanticClassifier: process.env.USE_SEMANTIC_CLASSIFIER === 'true', // Enable via env var
  useSemanticEntityExtractor: process.env.USE_SEMANTIC_ENTITY_EXTRACTOR === 'true', // Enable via env var
  useContextTracker: process.env.USE_CONTEXT_TRACKER !== 'false', // Enabled by default
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
  private semanticClassifier: SemanticClassifier;
  private semanticEntityExtractor: SemanticEntityExtractor;
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

    // Initialize category-based services
    this.categoryClassifier = getCategoryClassifier();
    this.semanticClassifier = getSemanticClassifier();
    this.semanticEntityExtractor = getSemanticEntityExtractor();
    this.responseStrategyEngine = createResponseStrategyEngine({
      useLlmForComplex: false, // Templates by default
    });

    if (this.config.useCategoryBasedSystem) {
      if (this.config.useSemanticClassifier) {
        console.log('[GoalTestRunner] Using AI-first SemanticClassifier (LLM-based)');
      } else {
        console.log('[GoalTestRunner] Using pattern-based CategoryClassifier');
      }
    } else {
      console.log('[GoalTestRunner] Using legacy intent-based system');
    }

    if (this.config.useSemanticEntityExtractor) {
      console.log('[GoalTestRunner] Using AI-first SemanticEntityExtractor (LLM-based)');
    } else {
      console.log('[GoalTestRunner] Using regex-based entity extraction');
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

    // Emit test-started event for real-time streaming
    console.log(JSON.stringify({
      type: 'test-started',
      testId: effectiveTestId,
      testName: testCase.name,
      runId,
    }));

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

    // Initialize context tracker for rich conversation context
    let contextTracker: ConversationContextTracker | null = null;
    if (this.config.useContextTracker) {
      contextTracker = createContextTracker(runId, { verboseLogging: false });
      contextTracker.setTestId(effectiveTestId);

      // Set expected child count from persona
      const childCount = personaToUse.inventory.children?.length || 1;
      contextTracker.setChildCount(childCount);

      console.log(`[GoalTestRunner] Context tracker enabled (tracking ${childCount} children)`);
    }

    // Start new Flowise session and capture session ID for Langfuse
    this.flowiseClient.newSession();
    const flowiseSessionId = this.flowiseClient.getSessionId();
    console.log(`[GoalTestRunner] Flowise session: ${flowiseSessionId}`);

    let turnNumber = 0;
    let lastError: string | undefined;

    try {
      // Resolve initial message (can be string or function)
      // Use personaToUse (resolved persona) for template resolution
      let initialMessage = typeof testCase.initialMessage === 'function'
        ? testCase.initialMessage(personaToUse)
        : testCase.initialMessage;

      // Resolve any {{placeholder}} templates in the initial message
      initialMessage = resolveTemplate(initialMessage, personaToUse);

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
      let lastDetectedChildOrdinal = 0; // Track to avoid double-advancing on repeat questions
      const providedFields = new Set<DataFieldCategory>();
      let bookingCompleted = false; // Track if booking has been successfully completed (appointmentGUID received)

      // Extract volunteered data from initial message
      const initialVolunteeredData = await this.extractVolunteeredDataFromMessage(initialMessage);
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
          // Select classifier based on config
          const classifier = this.config.useSemanticClassifier
            ? this.semanticClassifier
            : this.categoryClassifier;

          // Classify using selected classifier
          const classification = await classifier.classify(
            lastAgentTurn.content,
            transcript,
            personaToUse
          );

          // Record agent turn in context tracker
          if (contextTracker) {
            contextTracker.recordAgentTurn(turnNumber, lastAgentTurn.content, {
              category: classification.category,
              dataFields: classification.dataFields,
              terminalState: classification.terminalState,
              confidence: classification.confidence,
            });
          }

          // Check if conversation should end
          if (classifier.isTerminal(classification)) {
            console.log(`[GoalTestRunner] Terminal state: ${classification.terminalState}`);
            intentResult = classifier.toLegacyIntent(classification);
            progressTracker.updateProgress(intentResult, '', turnNumber);
            break;
          }

          // Detect child advancement - only advance when a NEW ordinal is detected
          // This prevents double-advancing when agent repeats a question (e.g., after clarification)
          const agentContent = lastAgentTurn.content.toLowerCase();
          let detectedOrdinal = 0;
          if (/\bfirst\s+(child|kid|patient)\b/i.test(agentContent)) detectedOrdinal = 1;
          else if (/\bsecond\s+(child|kid|patient)\b/i.test(agentContent)) detectedOrdinal = 2;
          else if (/\bthird\s+(child|kid|patient)\b/i.test(agentContent)) detectedOrdinal = 3;
          else if (/\bfourth\s+(child|kid|patient)\b/i.test(agentContent)) detectedOrdinal = 4;
          else if (/\b(next|other)\s+(child|kid|patient)\b/i.test(agentContent)) detectedOrdinal = lastDetectedChildOrdinal + 1;

          if (detectedOrdinal > lastDetectedChildOrdinal) {
            // Set index directly based on ordinal (ordinal 1 = index 0, ordinal 2 = index 1, etc.)
            const targetIndex = detectedOrdinal - 1;
            if (targetIndex < personaToUse.inventory.children.length) {
              currentChildIndex = targetIndex;
              lastDetectedChildOrdinal = detectedOrdinal;
              console.log(`[GoalTestRunner] Advanced to child ${detectedOrdinal} (index ${currentChildIndex})`);

              // Update context tracker with child switch
              if (contextTracker) {
                contextTracker.switchChild(currentChildIndex, turnNumber);
              }
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
              testId: testCase.id, // Pass test ID for special behavior triggers
              bookingCompleted, // Pass booking status to determine "anything else?" response
            }
          );

          // Mark provided fields
          if (classification.dataFields) {
            for (const field of classification.dataFields) {
              providedFields.add(field);
            }
            // Card reminder is agent-provided, not user-provided - mark it immediately
            if (classification.dataFields.includes('card_reminder')) {
              progressTracker.markFieldCollected('card_reminder', 'Agent reminded to bring insurance card', turnNumber);
              console.log(`[GoalTestRunner] ✓ card_reminder collected (agent mentioned it)`);
            }
          }

          // Convert to legacy intent for progress tracker
          intentResult = classifier.toLegacyIntent(classification);
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
        const volunteeredData = await this.extractVolunteeredDataFromMessage(userResponse);
        for (const { field, value } of volunteeredData) {
          progressTracker.markFieldCollected(field, value, turnNumber);
        }

        // Record user turn in context tracker
        if (contextTracker && volunteeredData.length > 0) {
          contextTracker.recordUserTurn(turnNumber, userResponse, volunteeredData);
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

        // Check for successful booking in tool call responses
        if (agentResponse?.toolCalls && !bookingCompleted) {
          for (const toolCall of agentResponse.toolCalls) {
            if (toolCall.output) {
              try {
                const output = typeof toolCall.output === 'string' ? JSON.parse(toolCall.output) : toolCall.output;
                // Check for appointmentGUID indicating successful booking
                if (output.success === true && output.appointmentGUID) {
                  bookingCompleted = true;
                  console.log(`[GoalTestRunner] ✓ Booking completed - appointmentGUID: ${output.appointmentGUID.substring(0, 8)}...`);
                  break;
                }
              } catch (e) {
                // Ignore JSON parse errors
              }
            }
          }
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

    // Add context tracker insights to result
    if (contextTracker) {
      const contextSummary = contextTracker.getSummary();
      const anomalies = contextTracker.getAnomalies();

      // Log context insights
      if (anomalies.length > 0) {
        console.log(`[GoalTestRunner] Context anomalies detected: ${anomalies.length}`);
        for (const anomaly of anomalies) {
          console.log(`  - Turn ${anomaly.turn}: ${anomaly.type} (${anomaly.severity}): ${anomaly.description}`);

          // Add high/critical anomalies as issues in the result
          // Map anomaly types to valid ProgressIssue types
          if (anomaly.severity === 'high' || anomaly.severity === 'critical') {
            const issueType = anomaly.type === 'stuck_conversation' ? 'stuck'
              : anomaly.type === 'loop_detected' ? 'repeating'
              : 'error'; // Default to error for other anomaly types

            result.issues.push({
              type: issueType,
              severity: anomaly.severity,
              description: `[Context] ${anomaly.type}: ${anomaly.description}`,
              turnNumber: anomaly.turn,
            });
          }
        }
      }

      const repetitions = contextTracker.getRepeatedQuestions();
      if (repetitions.length > 0) {
        console.log(`[GoalTestRunner] Repeated questions detected: ${repetitions.length}`);
        for (const rep of repetitions) {
          console.log(`  - ${rep.field} repeated at turns: ${rep.turns.join(', ')} (reason: ${rep.reason})`);
        }
      }

      // Log booking status for multi-child scenarios
      if (contextSummary.childrenTracked > 1) {
        const bookingStatus = contextTracker.getBookingStatus();
        console.log(`[GoalTestRunner] Multi-child booking status:`);
        for (const status of bookingStatus) {
          console.log(`  - Child ${status.childIndex + 1} (${status.name || 'unnamed'}): ${status.booked ? 'BOOKED' : 'not booked'}`);
        }
      }
    }

    // Save to database (include resolved persona if dynamic fields were used)
    // Use effectiveTestId to ensure multiple runs of same test are stored separately
    this.saveGoalTestResult(runId, effectiveTestId, testCase, result, transcript, lastError, resolvedPersona, flowiseSessionId);

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

    // Emit for real-time streaming
    console.log(JSON.stringify({
      type: 'conversation-turn',
      testId,
      runId,
      turn: userTurn,
    }));

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

      // Emit for real-time streaming
      console.log(JSON.stringify({
        type: 'conversation-turn',
        testId,
        runId,
        turn: assistantTurn,
      }));

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

          // Emit for real-time streaming
          console.log(JSON.stringify({
            type: 'api-call',
            testId,
            runId,
            apiCall: {
              toolName: toolCall.toolName,
              requestPayload: toolCall.input,
              responsePayload: toolCall.output,
              status: toolCall.status,
              durationMs: toolCall.durationMs,
              timestamp: apiCall.timestamp,
            },
          }));
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

      // Emit for real-time streaming
      console.log(JSON.stringify({
        type: 'conversation-turn',
        testId,
        runId,
        turn: errorTurn,
      }));

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
   * @param flowiseSessionId Optional Flowise session ID for Langfuse session URL
   */
  private saveGoalTestResult(
    runId: string,
    testId: string,
    testCase: GoalOrientedTestCase,
    result: GoalTestResult,
    transcript: ConversationTurn[],
    errorMessage?: string,
    resolvedPersona?: ResolvedPersona,
    flowiseSessionId?: string
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

      // Get Langfuse trace ID from context
      const traceContext = getCurrentTraceContext();
      const langfuseTraceId = traceContext?.traceId;

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
        langfuseTraceId,
        flowiseSessionId,
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
        langfuseTraceId,
        // Flowise session ID for Langfuse session URL
        flowiseSessionId,
      });
    } catch (error) {
      console.error('[GoalTestRunner] Failed to save test result:', error);
    }
  }

  /**
   * Extract volunteered data using either semantic or regex-based extraction
   */
  private async extractVolunteeredDataFromMessage(message: string): Promise<VolunteeredData[]> {
    if (this.config.useSemanticEntityExtractor) {
      try {
        // Use LLM-based semantic extraction
        const extracted = await this.semanticEntityExtractor.extractVolunteered(message);
        if (extracted.length > 0) {
          console.log(`[GoalTestRunner] Semantic extraction found ${extracted.length} entities`);
        }
        return extracted;
      } catch (error: any) {
        console.warn(`[GoalTestRunner] Semantic extraction failed, falling back to regex: ${error.message}`);
        // Fall back to regex extraction on error
        return extractVolunteeredData(message);
      }
    }

    // Use regex-based extraction
    return extractVolunteeredData(message);
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

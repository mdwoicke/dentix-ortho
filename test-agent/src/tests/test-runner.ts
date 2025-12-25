/**
 * Test Execution Engine
 * Runs test cases and collects results
 *
 * Enhanced with AI-powered semantic evaluation for better accuracy
 */

import { FlowiseClient, FlowiseResponse, ToolCall } from '../core/flowise-client';
import { Cloud9Client } from '../core/cloud9-client';
import { ResponseAnalyzer } from '../analysis/response-analyzer';
import { Database, TestResult, ApiCall } from '../storage/database';
import {
  TestCase,
  TestContext,
  ConversationStep,
  ConversationTurn,
  ValidationResult,
  Finding,
} from './test-case';
import { config } from '../config/config';
import { semanticEvaluator } from '../services/semantic-evaluator';
import { SemanticEvaluation, EvaluationContext } from '../schemas/evaluation-schemas';

export class TestRunner {
  private flowiseClient: FlowiseClient;
  private cloud9Client: Cloud9Client;
  private analyzer: ResponseAnalyzer;
  private database: Database;

  constructor(
    flowiseClient: FlowiseClient,
    cloud9Client: Cloud9Client,
    analyzer: ResponseAnalyzer,
    database: Database
  ) {
    this.flowiseClient = flowiseClient;
    this.cloud9Client = cloud9Client;
    this.analyzer = analyzer;
    this.database = database;
  }

  async runTest(testCase: TestCase, runId: string): Promise<TestResult> {
    const startTime = Date.now();
    const context = await this.initializeContext(testCase);
    const findings: Finding[] = [];
    const transcript: ConversationTurn[] = [];

    this.flowiseClient.newSession();

    if (testCase.setup) {
      await testCase.setup(context);
    }

    let status: 'passed' | 'failed' | 'error' | 'skipped' = 'passed';
    let errorMessage: string | undefined;

    try {
      for (const step of testCase.steps) {
        const userMessage =
          typeof step.userMessage === 'function' ? step.userMessage(context) : step.userMessage;

        const stepResult = await this.executeStep(step, context, transcript, runId, testCase.id);

        if (!stepResult.passed && !step.optional) {
          status = 'failed';
          errorMessage = stepResult.message;
          findings.push({
            type: 'prompt-issue',
            severity: stepResult.severity || 'high',
            title: `Step "${step.id}" failed`,
            description: stepResult.message,
            affectedStep: step.id,
            agentQuestion: userMessage,
            expectedBehavior: this.getExpectedBehaviorDescription(step),
            actualBehavior: transcript[transcript.length - 1]?.content || 'No response',
            recommendation: stepResult.recommendation,
          });

          if (stepResult.severity === 'critical') {
            break;
          }
        }

        if (step.delay || config.tests.defaultDelayBetweenSteps) {
          await this.delay(step.delay || config.tests.defaultDelayBetweenSteps);
        }
      }

      if (status === 'passed') {
        for (const expectation of testCase.expectations) {
          if (expectation.validator) {
            const result = expectation.validator(context);
            if (!result.passed) {
              status = 'failed';
              errorMessage = `Expectation "${expectation.description}" failed: ${result.message}`;
              findings.push({
                type: 'bug',
                severity: 'high',
                title: `Expectation failed: ${expectation.description}`,
                description: result.message,
                recommendation: result.recommendation,
              });
            }
          }
        }
      }
    } catch (error: any) {
      status = 'error';
      errorMessage = error.message;
      findings.push({
        type: 'bug',
        severity: 'critical',
        title: 'Test execution error',
        description: error.message,
      });
    }

    if (testCase.teardown) {
      try {
        await testCase.teardown(context);
      } catch (error) {
        // Ignore teardown errors
      }
    }

    const result: TestResult = {
      runId,
      testId: testCase.id,
      testName: testCase.name,
      category: testCase.category,
      status,
      startedAt: new Date(startTime).toISOString(),
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startTime,
      errorMessage,
      transcript,
      findings,
    };

    const resultId = this.database.saveTestResult(result);

    if (transcript.length > 0) {
      this.database.saveTranscript(resultId, transcript);
    }

    return result;
  }

  private async executeStep(
    step: ConversationStep,
    context: TestContext,
    transcript: ConversationTurn[],
    runId?: string,
    testId?: string
  ): Promise<ValidationResult> {
    const userMessage =
      typeof step.userMessage === 'function' ? step.userMessage(context) : step.userMessage;

    const userTurn: ConversationTurn = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString(),
      stepId: step.id,
    };
    transcript.push(userTurn);
    context.conversationHistory.push(userTurn);

    let response: FlowiseResponse;
    try {
      response = await this.flowiseClient.sendMessage(userMessage);
    } catch (error: any) {
      const errorTurn: ConversationTurn = {
        role: 'assistant',
        content: `[ERROR: ${error.message}]`,
        timestamp: new Date().toISOString(),
        stepId: step.id,
        validationPassed: false,
        validationMessage: error.message,
      };
      transcript.push(errorTurn);
      context.conversationHistory.push(errorTurn);

      return {
        passed: false,
        message: `API error: ${error.message}`,
        severity: 'critical',
        recommendation: 'Check Flowise API connectivity and configuration',
      };
    }

    const assistantTurn: ConversationTurn = {
      role: 'assistant',
      content: response.text,
      timestamp: new Date().toISOString(),
      responseTimeMs: response.responseTime,
      stepId: step.id,
    };
    transcript.push(assistantTurn);
    context.conversationHistory.push(assistantTurn);

    if (runId && testId && response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        const apiCall: ApiCall = {
          runId,
          testId,
          stepId: step.id,
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

    // Validate response (hybrid: semantic + regex)
    const validation = await this.validateResponse(response.text, step, context, userMessage);
    assistantTurn.validationPassed = validation.passed;
    assistantTurn.validationMessage = validation.message;

    if (step.extractData && validation.passed) {
      const extractedData = step.extractData(response.text, context);
      context.extractedData = { ...context.extractedData, ...extractedData };
    }

    if (step.updateContext && validation.passed) {
      const updates = step.updateContext(response.text, context);
      Object.assign(context, updates);
    }

    return validation;
  }

  /**
   * Extract just the conversational text from a response, excluding JSON payload
   */
  private extractAnswerText(response: string): string {
    // Try to match ANSWER: ... PAYLOAD: format
    const answerMatch = response.match(/^ANSWER:\s*([\s\S]*?)(?:\n\s*PAYLOAD:|$)/i);
    if (answerMatch) {
      return answerMatch[1].trim();
    }

    // Handle responses without ANSWER: prefix but with PAYLOAD:
    const payloadIndex = response.indexOf('\nPAYLOAD:');
    if (payloadIndex !== -1) {
      return response.substring(0, payloadIndex).trim();
    }

    // Also check for PAYLOAD: without newline (edge case)
    const payloadIndexAlt = response.indexOf('PAYLOAD:');
    if (payloadIndexAlt !== -1 && payloadIndexAlt > 20) {
      return response.substring(0, payloadIndexAlt).trim();
    }

    // No payload found, return full response
    return response;
  }

  /**
   * Validate a response using hybrid approach (semantic + regex)
   */
  private async validateResponse(
    response: string,
    step: ConversationStep,
    context: TestContext,
    userMessage: string
  ): Promise<ValidationResult> {
    // Extract answer text (exclude JSON payload)
    const textToCheck = this.extractAnswerText(response);

    // FAST PATH: Critical error detection (only check answer text, not JSON payload)
    const criticalPatterns = [
      /\bnull\b|undefined|NaN/i,
      /error|exception|stack trace/i,
      /\[object Object\]/i,
    ];

    for (const pattern of criticalPatterns) {
      if (pattern.test(textToCheck)) {
        return {
          passed: false,
          message: `Critical error detected: ${pattern.source}`,
          severity: 'critical',
          recommendation: 'Check for programming errors leaking into responses',
        };
      }
    }

    // SEMANTIC PATH: AI-powered evaluation
    if (config.semanticEvaluation.enabled &&
        config.semanticEvaluation.mode === 'realtime' &&
        semanticEvaluator.isAvailable()) {
      try {
        const evalContext: EvaluationContext = {
          stepId: step.id,
          stepDescription: step.description,
          userMessage,
          assistantResponse: response,
          conversationHistory: context.conversationHistory.map(t => ({
            role: t.role as 'user' | 'assistant' | 'system',
            content: t.content,
          })),
          expectedBehaviors: step.expectedPatterns.map(p => String(p)),
          unexpectedBehaviors: step.unexpectedPatterns.map(p => String(p)),
        };

        const evaluation = await semanticEvaluator.evaluateStep(evalContext);

        return {
          passed: evaluation.validation.passed,
          message: evaluation.validation.reasoning,
          severity: evaluation.validation.severity === 'none'
            ? undefined
            : evaluation.validation.severity as 'low' | 'medium' | 'high' | 'critical',
          recommendation: evaluation.validation.suggestedAction,
          confidence: evaluation.validation.confidence,
          semanticEvaluation: evaluation,
        };
      } catch (error) {
        console.warn('[TestRunner] Semantic evaluation failed, falling back to regex:', error);
      }
    }

    // FALLBACK: Regex-based validation
    return this.validateWithRegex(response, step, context);
  }

  private validateWithRegex(
    response: string,
    step: ConversationStep,
    context: TestContext
  ): ValidationResult {
    // Extract answer text only (exclude JSON payload)
    const textToCheck = this.extractAnswerText(response);

    for (const pattern of step.unexpectedPatterns) {
      const resolvedPattern =
        typeof pattern === 'function' ? pattern(context) : pattern;
      const regex = typeof resolvedPattern === 'string'
        ? new RegExp(resolvedPattern, 'i')
        : resolvedPattern;

      if (regex.test(textToCheck)) {
        return {
          passed: false,
          message: `Unexpected pattern found: "${resolvedPattern}"`,
          severity: 'high',
          recommendation: 'Review chatbot response for unexpected content',
        };
      }
    }

    const missingPatterns: string[] = [];
    for (const pattern of step.expectedPatterns) {
      const resolvedPattern =
        typeof pattern === 'function' ? pattern(context) : pattern;
      const regex = typeof resolvedPattern === 'string'
        ? new RegExp(resolvedPattern, 'i')
        : resolvedPattern;

      if (!regex.test(response)) {
        missingPatterns.push(String(resolvedPattern));
      }
    }

    if (missingPatterns.length > 0) {
      return {
        passed: false,
        message: `Missing expected patterns: ${missingPatterns.join(', ')}`,
        severity: 'medium',
        recommendation: 'Update prompt to ensure expected information is included in responses',
      };
    }

    if (step.validator) {
      return step.validator(response, context);
    }

    return { passed: true, message: 'All validations passed' };
  }

  private async initializeContext(testCase: TestCase): Promise<TestContext> {
    const context: TestContext = {
      patients: [],
      locations: [],
      providers: [],
      appointmentTypes: [],
      availableSlots: [],
      conversationHistory: [],
      extractedData: {},
    };

    for (const req of testCase.dataRequirements) {
      switch (req.type) {
        case 'patient':
          context.patients = await this.cloud9Client.getTestPatients();
          break;
        case 'location':
          context.locations = await this.cloud9Client.getLocations();
          break;
        case 'provider':
          context.providers = await this.cloud9Client.getProviders();
          break;
        case 'appointmentType':
          context.appointmentTypes = await this.cloud9Client.getAppointmentTypes();
          break;
      }
    }

    return context;
  }

  private getExpectedBehaviorDescription(step: ConversationStep): string {
    const patterns = step.expectedPatterns.map(p => String(p)).join(', ');
    return step.description || `Response should match: ${patterns}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

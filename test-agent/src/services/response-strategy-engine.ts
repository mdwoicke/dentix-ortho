/**
 * Response Strategy Engine
 *
 * Generates user responses based on category classification.
 * Combines persona data mapping with natural formatting.
 */

import { getLLMProvider, LLMProvider } from '../../../shared/services/llm-provider';
import type {
  ResponseCategory,
  DataFieldCategory,
  CategoryClassificationResult,
  ConfirmationSubject,
} from '../schemas/response-category-schemas';
import type { UserPersona } from '../tests/types/persona';
import type { ConversationTurn } from '../tests/test-case';
import { PersonaDataMapper, createDataMapper, DataMapperContext } from './persona-data-mapper';
import { ResponseFormatter, createFormatter } from './response-formatter';

// =============================================================================
// Configuration
// =============================================================================

export interface ResponseStrategyConfig {
  /** Use LLM for complex/ambiguous cases */
  useLlmForComplex: boolean;

  /** Model for LLM response generation */
  model: string;

  /** Temperature for LLM responses */
  temperature: number;

  /** Max tokens */
  maxTokens: number;

  /** Timeout in ms */
  timeout: number;
}

const DEFAULT_CONFIG: ResponseStrategyConfig = {
  useLlmForComplex: false, // Default to template-based
  model: 'claude-3-5-haiku-20241022',
  temperature: 0.7,
  maxTokens: 256,
  timeout: 15000,
};

// =============================================================================
// Response Context
// =============================================================================

export interface ResponseStrategyContext {
  /** Current child index */
  currentChildIndex: number;

  /** Fields already provided */
  providedFields: Set<DataFieldCategory>;

  /** Conversation history */
  conversationHistory: ConversationTurn[];

  /** Turn number */
  turnNumber: number;
}

// =============================================================================
// Response Strategy Engine
// =============================================================================

export class ResponseStrategyEngine {
  private engineConfig: ResponseStrategyConfig;
  private llmProvider: LLMProvider;

  constructor(cfg?: Partial<ResponseStrategyConfig>) {
    this.engineConfig = { ...DEFAULT_CONFIG, ...cfg };
    this.llmProvider = getLLMProvider();
    console.log('[ResponseStrategyEngine] Initialized');
  }

  /**
   * Generate a response based on classification
   */
  async generateResponse(
    classification: CategoryClassificationResult,
    persona: UserPersona,
    context: Partial<ResponseStrategyContext> = {}
  ): Promise<string> {
    // Create helper instances
    const dataMapper = createDataMapper(persona, {
      currentChildIndex: context.currentChildIndex || 0,
      providedFields: context.providedFields || new Set(),
    });
    const formatter = createFormatter(persona.traits);

    // Dispatch to appropriate strategy
    switch (classification.category) {
      case 'provide_data':
        return this.handleProvideData(classification, dataMapper, formatter);

      case 'confirm_or_deny':
        return this.handleConfirmOrDeny(classification, dataMapper, formatter, persona);

      case 'select_from_options':
        return this.handleSelectFromOptions(classification, dataMapper, formatter, persona);

      case 'acknowledge':
        return this.handleAcknowledge(classification, formatter);

      case 'clarify_request':
        return this.handleClarifyRequest(formatter);

      case 'express_preference':
        return this.handleExpressPreference(classification, dataMapper, formatter);

      default:
        console.warn(`[ResponseStrategyEngine] Unknown category: ${classification.category}`);
        return 'Yes';
    }
  }

  // ==========================================================================
  // Strategy: Provide Data
  // ==========================================================================

  private handleProvideData(
    classification: CategoryClassificationResult,
    dataMapper: PersonaDataMapper,
    formatter: ResponseFormatter
  ): string {
    const fields = classification.dataFields || ['unknown'];
    const dataValues: string[] = [];

    for (const field of fields) {
      const value = dataMapper.getData(field);
      if (value) {
        dataValues.push(value);
        dataMapper.markProvided(field);
      }
    }

    if (dataValues.length === 0) {
      // When data can't be mapped, be cooperative and affirm (this is a test user)
      // "I'm not sure about that" causes loops - prefer affirmative fallback
      return 'Yes';
    }

    return formatter.formatDataResponse(dataValues);
  }

  // ==========================================================================
  // Strategy: Confirm or Deny
  // ==========================================================================

  private handleConfirmOrDeny(
    classification: CategoryClassificationResult,
    dataMapper: PersonaDataMapper,
    formatter: ResponseFormatter,
    persona: UserPersona
  ): string {
    const subject = classification.confirmationSubject || 'general';
    const expectedAnswer = classification.expectedAnswer || 'either';
    const dataFields = classification.dataFields || [];

    // Determine answer based on context and persona
    let answer: 'yes' | 'no' = 'yes'; // Default to yes

    // Check if this is a question about previous visit or existing patient status
    // These are commonly asked as yes/no questions but should use persona data
    if (dataFields.includes('previous_visit') || dataFields.includes('new_patient_status')) {
      // Use persona's previousVisitToOffice to determine answer
      answer = persona.inventory.previousVisitToOffice ? 'yes' : 'no';
      console.log(`[ResponseStrategyEngine] Previous visit question: previousVisitToOffice=${persona.inventory.previousVisitToOffice}, answering: ${answer}`);
      return formatter.formatConfirmation(subject, answer);
    }

    // Check if this is a question about previous orthodontic treatment
    if (dataFields.includes('previous_ortho_treatment')) {
      // Use child's hadBracesBefore to determine answer
      const currentChildIndex = 0; // Default to first child
      const child = persona.inventory.children[currentChildIndex];
      const hadBraces = child?.hadBracesBefore ?? false;
      answer = hadBraces ? 'yes' : 'no';
      console.log(`[ResponseStrategyEngine] Previous ortho question: hadBracesBefore=${hadBraces}, answering: ${answer}`);
      return formatter.formatConfirmation(subject, answer);
    }

    // For most confirmations, persona should agree
    switch (subject) {
      case 'information_correct':
        // Always confirm information as correct (we're the simulated user)
        answer = 'yes';
        break;

      case 'proceed_anyway':
        // Usually proceed even with out-of-network insurance, etc.
        answer = 'yes';
        break;

      case 'wants_address':
        // Typically want the address
        answer = 'yes';
        break;

      case 'wants_parking_info':
        // Typically want parking info
        answer = 'yes';
        break;

      case 'spelling_correct':
        // Always confirm spelling (agent should have it right)
        answer = 'yes';
        break;

      case 'insurance_card_reminder':
        // Acknowledge the reminder
        answer = 'yes';
        break;

      case 'booking_details':
        // Confirm booking details
        answer = 'yes';
        break;

      case 'general':
      default:
        // Default to yes for cooperative testing
        answer = 'yes';
        break;
    }

    return formatter.formatConfirmation(subject, answer);
  }

  // ==========================================================================
  // Strategy: Select from Options
  // ==========================================================================

  private handleSelectFromOptions(
    classification: CategoryClassificationResult,
    dataMapper: PersonaDataMapper,
    formatter: ResponseFormatter,
    persona: UserPersona
  ): string {
    const options = classification.options || [];

    if (options.length === 0) {
      return formatter.formatConfirmation('general', 'yes');
    }

    // Select best matching option based on persona preferences
    const selectedOption = this.selectBestOption(options, persona);

    return formatter.formatSelection(selectedOption);
  }

  /**
   * Select the best option based on persona preferences
   */
  private selectBestOption(options: string[], persona: UserPersona): string {
    const preferences = persona.inventory;

    // Check for time-of-day preference
    if (preferences.preferredTimeOfDay && preferences.preferredTimeOfDay !== 'any') {
      const timePreference = preferences.preferredTimeOfDay;
      const morningPattern = /\b(9|10|11)\s*:?\s*\d*\s*(am)?/i;
      const afternoonPattern = /\b(1|2|3|4|5)\s*:?\s*\d*\s*(pm)?/i;

      for (const option of options) {
        if (timePreference === 'morning' && morningPattern.test(option)) {
          return option;
        }
        if (timePreference === 'afternoon' && afternoonPattern.test(option)) {
          return option;
        }
      }
    }

    // Check for location preference
    if (preferences.preferredLocation) {
      const location = preferences.preferredLocation.toLowerCase();
      for (const option of options) {
        if (option.toLowerCase().includes(location)) {
          return option;
        }
      }
    }

    // Check for day preferences
    if (preferences.preferredDays && preferences.preferredDays.length > 0) {
      for (const preferredDay of preferences.preferredDays) {
        for (const option of options) {
          if (option.toLowerCase().includes(preferredDay.toLowerCase())) {
            return option;
          }
        }
      }
    }

    // Default: pick the first option
    return options[0];
  }

  // ==========================================================================
  // Strategy: Acknowledge
  // ==========================================================================

  private handleAcknowledge(
    classification: CategoryClassificationResult,
    formatter: ResponseFormatter
  ): string {
    // Determine what type of info was provided
    let infoType = 'general';

    if (classification.terminalState === 'booking_confirmed') {
      infoType = 'booking_confirmation';
    } else if (classification.infoProvided) {
      if (/address/i.test(classification.infoProvided)) {
        infoType = 'address';
      } else if (/parking/i.test(classification.infoProvided)) {
        infoType = 'parking_info';
      }
    } else if (/checking|searching|looking/i.test(classification.reasoning || '')) {
      infoType = 'searching';
    }

    return formatter.formatAcknowledgment(infoType);
  }

  // ==========================================================================
  // Strategy: Clarify Request
  // ==========================================================================

  private handleClarifyRequest(formatter: ResponseFormatter): string {
    return formatter.formatClarificationRequest();
  }

  // ==========================================================================
  // Strategy: Express Preference
  // ==========================================================================

  private handleExpressPreference(
    classification: CategoryClassificationResult,
    dataMapper: PersonaDataMapper,
    formatter: ResponseFormatter
  ): string {
    const fields = classification.dataFields || ['time_preference'];
    const preference = dataMapper.getData(fields[0]) || 'Any time works';
    return formatter.formatPreference(preference);
  }

  // ==========================================================================
  // Optional LLM-based generation for complex cases
  // ==========================================================================

  /**
   * Generate response using LLM for complex/ambiguous cases
   */
  async generateWithLlm(
    classification: CategoryClassificationResult,
    persona: UserPersona,
    agentMessage: string,
    conversationHistory: ConversationTurn[]
  ): Promise<string> {
    if (!this.engineConfig.useLlmForComplex) {
      // Fall back to template-based
      return this.generateResponse(classification, persona, {
        conversationHistory,
      });
    }

    const prompt = this.buildLlmPrompt(classification, persona, agentMessage, conversationHistory);

    try {
      const response = await this.llmProvider.execute({
        prompt,
        model: this.engineConfig.model,
        maxTokens: this.engineConfig.maxTokens,
        temperature: this.engineConfig.temperature,
        timeout: this.engineConfig.timeout,
      });

      if (response.success && response.content) {
        return response.content.trim();
      }
    } catch (error) {
      console.warn('[ResponseStrategyEngine] LLM generation failed:', error);
    }

    // Fall back to template-based
    return this.generateResponse(classification, persona, {
      conversationHistory,
    });
  }

  /**
   * Build LLM prompt for response generation
   */
  private buildLlmPrompt(
    classification: CategoryClassificationResult,
    persona: UserPersona,
    agentMessage: string,
    conversationHistory: ConversationTurn[]
  ): string {
    const recentHistory = conversationHistory.slice(-4);
    const historyText = recentHistory.length > 0
      ? recentHistory.map(t => `[${t.role}]: ${t.content}`).join('\n')
      : 'No prior conversation';

    const verbosityInstructions = {
      terse: 'Keep responses very brief, just the essential information.',
      normal: 'Use natural, polite responses with brief acknowledgments.',
      verbose: 'Be friendly and conversational, add warmth to responses.',
    };

    return `You are simulating a parent calling to schedule an orthodontic appointment for their child.

## Your Persona
Name: ${persona.inventory.parentFirstName} ${persona.inventory.parentLastName}
Children: ${persona.inventory.children.map(c => c.firstName).join(', ')}
Insurance: ${persona.inventory.insuranceProvider || 'Unknown'}

## Agent's Message
"${agentMessage}"

## Conversation History
${historyText}

## What the Agent is Asking
Category: ${classification.category}
${classification.dataFields ? `Data Requested: ${classification.dataFields.join(', ')}` : ''}
${classification.confirmationSubject ? `Confirming: ${classification.confirmationSubject}` : ''}
${classification.options ? `Options: ${classification.options.join(', ')}` : ''}

## Your Data (use if relevant)
- Your name: ${persona.inventory.parentFirstName} ${persona.inventory.parentLastName}
- Phone: ${persona.inventory.parentPhone}
- Child name: ${persona.inventory.children[0]?.firstName || 'Unknown'} ${persona.inventory.children[0]?.lastName || ''}
- Child DOB: ${persona.inventory.children[0]?.dateOfBirth || 'Unknown'}
- Preferred time: ${persona.inventory.preferredTimeOfDay || 'any'}

## Response Style
${verbosityInstructions[persona.traits.verbosity]}

## Critical Rules
1. The appointment is ALWAYS for your CHILD, not for yourself
2. Answer the agent's question directly
3. Do NOT mention specific days of the week (only morning/afternoon preferences)
4. Be cooperative - you want to book an appointment

Respond ONLY with your message as the caller (no JSON, no explanation):`;
  }
}

// =============================================================================
// Singleton
// =============================================================================

let defaultInstance: ResponseStrategyEngine | null = null;

export function getResponseStrategyEngine(): ResponseStrategyEngine {
  if (!defaultInstance) {
    defaultInstance = new ResponseStrategyEngine();
  }
  return defaultInstance;
}

export function createResponseStrategyEngine(
  cfg?: Partial<ResponseStrategyConfig>
): ResponseStrategyEngine {
  return new ResponseStrategyEngine(cfg);
}

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
import type { DataInventory } from '../tests/types/persona';

// =============================================================================
// Smart Fallback Patterns (for when classification fails)
// =============================================================================

interface SmartFallbackPattern {
  pattern: RegExp;
  getResponse: (inv: DataInventory, childIndex: number) => string;
}

const SMART_FALLBACK_PATTERNS: SmartFallbackPattern[] = [
  // Child name patterns
  {
    pattern: /\b(child|kid|patient|son|daughter)('s)?\s+(first\s+)?(name|called)\b/i,
    getResponse: (inv, idx) => {
      const child = inv.children[idx] || inv.children[0];
      return child ? `${child.firstName} ${child.lastName}` : 'I\'m not sure';
    },
  },
  {
    pattern: /\bwhat.*name.*child\b/i,
    getResponse: (inv, idx) => {
      const child = inv.children[idx] || inv.children[0];
      return child ? `${child.firstName} ${child.lastName}` : 'I\'m not sure';
    },
  },
  {
    // Only match when preceded by child/kid/son/daughter context — NOT generic "first name"
    pattern: /\b(child'?s?|kid'?s?|son'?s?|daughter'?s?)\b[^.?!]{0,40}\bname\b/i,
    getResponse: (inv, idx) => {
      const child = inv.children[idx] || inv.children[0];
      return child ? `${child.firstName} ${child.lastName}` : inv.parentFirstName;
    },
  },
  // Date of birth patterns - CRITICAL for avoiding "Yes" loops
  {
    pattern: /\b(date\s+of\s+birth|dob|birth\s*date|birthday|born|birthdate)\b/i,
    getResponse: (inv, idx) => {
      const child = inv.children[idx] || inv.children[0];
      if (!child) return 'I\'m not sure';
      const dob = new Date(child.dateOfBirth);
      return dob.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    },
  },
  // Age patterns
  {
    pattern: /\b(how\s+old|age|years\s+old)\b/i,
    getResponse: (inv, idx) => {
      const child = inv.children[idx] || inv.children[0];
      if (!child) return 'I\'m not sure';
      const dob = new Date(child.dateOfBirth);
      const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      return `${age} years old`;
    },
  },
  // Phone patterns
  {
    pattern: /\b(phone|number|call.*back|reach\s+you|contact)\b/i,
    getResponse: (inv) => inv.parentPhone,
  },
  // Email patterns
  {
    pattern: /\b(email|e-mail)\b/i,
    getResponse: (inv) => inv.parentEmail || 'I don\'t have an email',
  },
  // Caller/parent name patterns
  {
    pattern: /\b(your|caller|parent)\s*(full\s*)?(name|called)\b/i,
    getResponse: (inv) => `${inv.parentFirstName} ${inv.parentLastName}`,
  },
  {
    pattern: /\bwho\s+(am\s+i|are\s+you)\s+(speaking|talking)\b/i,
    getResponse: (inv) => `${inv.parentFirstName} ${inv.parentLastName}`,
  },
  // Insurance patterns
  {
    pattern: /\b(insurance|coverage|plan|provider)\b/i,
    getResponse: (inv) => {
      if (!inv.insuranceProvider && inv.hasInsurance === false) return 'No insurance';
      return inv.insuranceProvider || 'I\'m not sure about insurance';
    },
  },
  // Location/time preferences
  {
    pattern: /\b(which\s+location|prefer.*location|office)\b/i,
    getResponse: (inv) => inv.preferredLocation || 'Either location is fine',
  },
  {
    pattern: /\b(what\s+time|prefer.*time|morning|afternoon|best\s+time)\b/i,
    getResponse: (inv) => {
      if (inv.preferredTimeOfDay && inv.preferredTimeOfDay !== 'any') {
        return `${inv.preferredTimeOfDay} works best`;
      }
      return 'Any time works for us';
    },
  },
  // Previous visit / existing patient patterns - CRITICAL for avoiding "Yes" when it should be "No"
  {
    pattern: /\b(been\s+(seen|to)|visited|been\s+here|seen\s+(at|here|before)|(existing|returning)\s+patient)\b/i,
    getResponse: (inv) => {
      return inv.previousVisitToOffice ? 'Yes, she has been seen before' : 'No, this is our first visit';
    },
  },
  // Previous orthodontic treatment patterns
  {
    pattern: /\b(orthodontic\s+treatment|braces|ortho\s+treatment|had\s+(ortho|braces|treatment))\b.*before\b/i,
    getResponse: (inv, idx) => {
      const child = inv.children[idx] || inv.children[0];
      const hadBraces = child?.hadBracesBefore ?? false;
      return hadBraces ? 'Yes, she has had orthodontic treatment before' : 'No previous orthodontic treatment';
    },
  },
  // New patient status patterns
  {
    pattern: /\b(are\s+you|is\s+(this|it))\s+(a\s+)?new\s+patient\b/i,
    getResponse: (inv) => {
      return inv.previousVisitToOffice ? 'No, we have been seen before' : 'Yes, we are new patients';
    },
  },
];

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

  /** Test ID for special behavior triggers */
  testId?: string;

  /** Test goals for determining special behaviors */
  testGoals?: string[];

  /** Whether a booking has been successfully completed (appointmentGUID received) */
  bookingCompleted?: boolean;
}

// Special behavior constants
const CANCEL_TEST_IDS = ['GOAL-ERR-004'];
const SILENCE_TEST_IDS = ['GOAL-ERR-007'];
const CANCEL_TRIGGER_TURN = 4;  // Cancel after 4 turns of providing data
const SILENCE_TRIGGER_TURN = 3; // Go silent after 3 turns

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
   * Check for special test behaviors like cancel or silence
   * Returns the special response, or null if normal processing should continue
   */
  private checkSpecialBehaviors(
    testId: string,
    turnNumber: number,
    persona: UserPersona
  ): string | null {
    // Check for CANCEL test - user should cancel mid-conversation
    if (CANCEL_TEST_IDS.includes(testId) && turnNumber >= CANCEL_TRIGGER_TURN) {
      console.log(`[ResponseStrategyEngine] Special behavior: CANCEL triggered at turn ${turnNumber}`);
      return "Actually, never mind. I need to cancel. I'll call back another time.";
    }

    // Check for SILENCE test - user goes silent after a few turns
    if (SILENCE_TEST_IDS.includes(testId) && turnNumber >= SILENCE_TRIGGER_TURN) {
      console.log(`[ResponseStrategyEngine] Special behavior: SILENCE triggered at turn ${turnNumber}`);
      // Return empty string to simulate user not responding
      // The test runner will need to handle this appropriately
      return '';
    }

    // Also check by persona name as fallback
    if (persona.name?.toLowerCase().includes('silent') && turnNumber >= SILENCE_TRIGGER_TURN) {
      console.log(`[ResponseStrategyEngine] Special behavior: SILENCE (by persona) triggered at turn ${turnNumber}`);
      return '';
    }

    // No special behavior
    return null;
  }

  /**
   * Generate a response based on classification
   */
  async generateResponse(
    classification: CategoryClassificationResult,
    persona: UserPersona,
    context: Partial<ResponseStrategyContext> = {}
  ): Promise<string> {
    const turnNumber = context.turnNumber || 0;
    const testId = context.testId || '';

    // Check for special test behaviors FIRST
    const specialResponse = this.checkSpecialBehaviors(testId, turnNumber, persona);
    if (specialResponse !== null) {
      return specialResponse;
    }

    // Create helper instances
    const dataMapper = createDataMapper(persona, {
      currentChildIndex: context.currentChildIndex || 0,
      providedFields: context.providedFields || new Set(),
    });
    const formatter = createFormatter(persona.traits);

    // Get last agent message for smart fallback
    const history = context.conversationHistory || [];
    const lastAgentMessage = [...history].reverse().find(t => t.role === 'assistant')?.content || '';

    // GLOBAL CHECK: When booking is complete and agent asks "anything else?", always say NO
    // This check runs BEFORE category dispatch to catch all cases regardless of classification
    if (context.bookingCompleted) {
      const isAnythingElseQuestion = /\b(anything else|is there anything|can i help|help.*today)\b/i.test(lastAgentMessage);
      if (isAnythingElseQuestion) {
        console.log(`[ResponseStrategyEngine] GLOBAL: Booking complete + "anything else?" detected (category: ${classification.category}) → responding NO`);
        return "No, that's all. Thank you!";
      }
    }

    // Dispatch to appropriate strategy
    switch (classification.category) {
      case 'provide_data':
        return this.handleProvideData(classification, dataMapper, formatter, persona, lastAgentMessage);

      case 'confirm_or_deny':
        return this.handleConfirmOrDeny(classification, dataMapper, formatter, persona, context);

      case 'select_from_options':
        return this.handleSelectFromOptions(classification, dataMapper, formatter, persona);

      case 'acknowledge':
        return this.handleAcknowledge(classification, formatter, lastAgentMessage, context);

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
    formatter: ResponseFormatter,
    persona: UserPersona,
    agentMessage: string
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
      // Try smart fallback before returning "Yes"
      const smartResponse = this.trySmartFallback(agentMessage, persona, dataMapper.getCurrentChildIndex());
      if (smartResponse) {
        console.log(`[ResponseStrategyEngine] Smart fallback matched for: "${agentMessage.substring(0, 50)}..."`);
        return smartResponse;
      }

      // When data can't be mapped and smart fallback fails, be cooperative
      console.log(`[ResponseStrategyEngine] No data mapping or smart fallback for: "${agentMessage.substring(0, 50)}..."`);
      return 'Yes';
    }

    return formatter.formatDataResponse(dataValues);
  }

  /**
   * Try smart fallback pattern matching when classification fails
   */
  private trySmartFallback(agentMessage: string, persona: UserPersona, childIndex: number): string | null {
    for (const { pattern, getResponse } of SMART_FALLBACK_PATTERNS) {
      if (pattern.test(agentMessage)) {
        try {
          return getResponse(persona.inventory, childIndex);
        } catch (error) {
          console.warn('[ResponseStrategyEngine] Smart fallback error:', error);
        }
      }
    }
    return null;
  }

  // ==========================================================================
  // Strategy: Confirm or Deny
  // ==========================================================================

  private handleConfirmOrDeny(
    classification: CategoryClassificationResult,
    dataMapper: PersonaDataMapper,
    formatter: ResponseFormatter,
    persona: UserPersona,
    context: Partial<ResponseStrategyContext> = {}
  ): string {
    const subject = classification.confirmationSubject || 'general';
    const expectedAnswer = classification.expectedAnswer || 'either';
    const dataFields = classification.dataFields || [];
    const history = context.conversationHistory || [];

    // Determine answer based on context and persona
    let answer: 'yes' | 'no' = 'yes'; // Default to yes

    // Get last agent message for scope clarification detection
    const lastAgentMessage = [...history].reverse().find(t => t.role === 'assistant')?.content || '';

    // Check for "anything else?" question after booking is complete
    // When booking is done, user should say "No, that's all" to end conversation
    if (subject === 'general' && context.bookingCompleted) {
      const isAnythingElseQuestion = /\b(anything else|is there anything|can i help|help.*today)\b/i.test(lastAgentMessage);
      if (isAnythingElseQuestion) {
        console.log('[ResponseStrategyEngine] Booking complete + "anything else?" question → responding NO to end conversation');
        return formatter.formatConfirmation('general', 'no');
      }
    }

    // Check for scope clarification (agent asking "Are you looking for orthodontics?")
    // If caller's original request was non-ortho (cleaning, checkup, etc.), answer "no"
    const isAskingAboutOrtho = /\b(looking for|calling about|need|want)\s*(orthodontic|ortho|braces|invisalign)/i.test(lastAgentMessage) ||
                               /\bare you.*(orthodontic|ortho)/i.test(lastAgentMessage);
    if (isAskingAboutOrtho) {
      // Check original user message for non-ortho intent
      const firstUserMsg = history.find(t => t.role === 'user')?.content || '';
      const nonOrthoPatterns = /\b(cleaning|dental cleaning|checkup|check-up|check up|cavity|filling|hygienist|general dentist|general dentistry|regular dentist)\b/i;
      if (nonOrthoPatterns.test(firstUserMsg)) {
        console.log('[ResponseStrategyEngine] Scope clarification detected: original request was non-ortho, answering NO');
        return formatter.formatDataResponse(['No, I need a dental cleaning']);
      }
    }

    // Check if this is asking about SCHEDULING INTENT (not patient history)
    // "Are you looking to schedule a new patient consultation?" → Answer YES (they're calling to schedule)
    // This is different from "Are you a new patient?" which asks about patient history
    const isSchedulingIntent = /\b(looking to|want to|like to|need to)\s*(schedule|book|make|set up)/i.test(lastAgentMessage) ||
                               /\bschedule\s*(a|an)?\s*(new patient|appointment|consultation)/i.test(lastAgentMessage);
    if (isSchedulingIntent) {
      console.log('[ResponseStrategyEngine] Scheduling intent confirmation detected, answering YES');
      return formatter.formatConfirmation(subject, 'yes');
    }

    // Check if this is a question about previous visit or existing patient status
    // These are commonly asked as yes/no questions but should use persona data
    // Only triggers when asking "Are you a new patient?" or "Have you been here before?"
    if (dataFields.includes('previous_visit') || dataFields.includes('new_patient_status')) {
      // Extra check: make sure this is actually asking about patient history, not scheduling
      const isPatientHistoryQuestion = /\b(new patient|been (here|seen|to)|visited before|first (time|visit))/i.test(lastAgentMessage) &&
                                       !/\b(schedule|book|appointment|consultation|looking to)/i.test(lastAgentMessage);
      if (isPatientHistoryQuestion) {
        // Use persona's previousVisitToOffice to determine answer
        answer = persona.inventory.previousVisitToOffice ? 'yes' : 'no';
        console.log(`[ResponseStrategyEngine] Previous visit question: previousVisitToOffice=${persona.inventory.previousVisitToOffice}, answering: ${answer}`);
        return formatter.formatConfirmation(subject, answer);
      }
      // If not clearly a patient history question, default to yes for scheduling confirmation
      console.log('[ResponseStrategyEngine] Ambiguous new_patient_status question, defaulting to YES');
      return formatter.formatConfirmation(subject, 'yes');
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

    // Check if this is a question about special needs
    // "Any special needs or accommodations?" should provide the special needs data, not just "yes"
    if (dataFields.includes('special_needs')) {
      const currentChildIndex = 0; // Default to first child
      const child = persona.inventory.children[currentChildIndex];
      const specialNeeds = child?.specialNeeds;
      if (specialNeeds && specialNeeds.toLowerCase() !== 'none') {
        console.log(`[ResponseStrategyEngine] Special needs question: specialNeeds="${specialNeeds}"`);
        return formatter.formatDataResponse([specialNeeds]);
      } else {
        console.log(`[ResponseStrategyEngine] Special needs question: no special needs`);
        return formatter.formatDataResponse(['No special needs']);
      }
    }

    // For most confirmations, persona should agree
    switch (subject) {
      case 'phone_number_correct':
      case 'information_correct': {
        // Check if the agent read back an unresolved variable instead of a real phone number
        const phoneVarPattern = /c1mg_variable|caller_id_number|\$vars/i;
        if (phoneVarPattern.test(lastAgentMessage)) {
          // Agent read a variable name, not a real phone — provide the actual number
          const actualPhone = persona.inventory.parentPhone || '5551234567';
          console.log(`[ResponseStrategyEngine] Agent read unresolved phone variable, correcting with actual phone: ${actualPhone}`);
          return `Actually, my number is ${actualPhone}`;
        }
        // Always confirm information as correct (we're the simulated user)
        answer = 'yes';
        break;
      }

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
    formatter: ResponseFormatter,
    lastAgentMessage: string,
    context: Partial<ResponseStrategyContext>
  ): string {
    // Check for "anything else?" question after booking is complete
    // When booking is done, user should say "No, that's all" to end conversation
    if (context.bookingCompleted) {
      const isAnythingElseQuestion = /\b(anything else|is there anything|can i help|help.*today)\b/i.test(lastAgentMessage);
      if (isAnythingElseQuestion) {
        console.log('[ResponseStrategyEngine] Booking complete + "anything else?" in acknowledge → responding NO to end conversation');
        return "No, that's all. Thank you!";
      }
    }

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

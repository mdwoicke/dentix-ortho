/**
 * Response Generator Service
 *
 * Generates user responses based on agent intent and persona inventory.
 * Uses hybrid approach: templates by default when useLlm=false, LLM when useLlm=true.
 * LLM usage is controlled independently of persona verbosity level.
 * Enhanced with Langfuse tracing for comprehensive observability.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { UserPersona, DataInventory, ChildData } from '../tests/types/persona';
import type { AgentIntent, IntentDetectionResult } from '../tests/types/intent';
import type { CollectableField } from '../tests/types/goals';
import type { ConversationTurn } from '../tests/test-case';
import {
  getLangfuseService,
  getCurrentTraceContext,
} from '../../../shared/services';

/**
 * Configuration for the response generator
 */
export interface ResponseGeneratorConfig {
  /** Use LLM for response generation */
  useLlm: boolean;

  /** Model for LLM generation */
  model: string;

  /** Temperature for LLM (higher = more creative) */
  temperature: number;

  /** Max tokens for response */
  maxTokens: number;
}

const DEFAULT_CONFIG: ResponseGeneratorConfig = {
  useLlm: false, // Templates by default (hybrid approach)
  model: 'claude-opus-4-5-20251101', // Opus 4.5 for highest quality response generation
  temperature: 0.7,
  maxTokens: 256,
};

/**
 * Template-based response generators
 */
type ResponseTemplate = (inventory: DataInventory, context: ResponseContext) => string;

interface ResponseContext {
  currentChildIndex: number;
  providedData: Set<CollectableField>;
  conversationHistory: ConversationTurn[];
}

/**
 * Response templates for each intent
 */
const RESPONSE_TEMPLATES: Partial<Record<AgentIntent, ResponseTemplate>> = {
  // Parent info
  'asking_parent_name': (inv) =>
    `${inv.parentFirstName} ${inv.parentLastName}`,

  'asking_spell_name': (inv) => {
    const fullName = `${inv.parentFirstName} ${inv.parentLastName}`;
    return fullName.split('').join('-').toUpperCase();
  },

  'asking_phone': (inv) =>
    inv.parentPhone,

  'asking_email': (inv) =>
    inv.parentEmail || 'I don\'t have an email',

  'asking_parent_dob': (inv) => {
    if (!inv.parentDateOfBirth) {
      // Fallback: generate a reasonable adult DOB (30-50 years old)
      const currentYear = new Date().getFullYear();
      const parentYear = currentYear - 40; // Default to ~40 years old
      return `January 15, ${parentYear}`;
    }
    const dob = new Date(inv.parentDateOfBirth);
    return dob.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  },

  // Child info
  'asking_child_count': (inv) => {
    const count = inv.children.length;
    if (count === 1) return 'One child';
    if (count === 2) return 'Two children';
    return `${count} children`;
  },

  'asking_child_name': (inv, ctx) => {
    const child = inv.children[ctx.currentChildIndex] || inv.children[0];
    if (!child) return 'Sorry, I don\'t have that information';
    return `${child.firstName} ${child.lastName}`;
  },

  'asking_child_dob': (inv, ctx) => {
    const child = inv.children[ctx.currentChildIndex] || inv.children[0];
    if (!child) return 'I\'m not sure';
    // Format DOB nicely
    const dob = new Date(child.dateOfBirth);
    return dob.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  },

  'asking_child_age': (inv, ctx) => {
    const child = inv.children[ctx.currentChildIndex] || inv.children[0];
    if (!child) return 'I\'m not sure';
    const dob = new Date(child.dateOfBirth);
    const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
    return `${age} years old`;
  },

  // Patient status
  'asking_new_patient': (inv) => {
    const firstChild = inv.children[0];
    if (!firstChild) return 'Yes, new patient';
    return firstChild.isNewPatient ? 'Yes, this would be our first visit' : 'No, we\'ve been here before';
  },

  'asking_previous_visit': (inv) =>
    inv.previousVisitToOffice ? 'Yes, we\'ve visited before' : 'No, this is our first time',

  'asking_previous_ortho': (inv) => {
    if (inv.previousOrthoTreatment) return 'Yes, had braces before';
    const child = inv.children[0];
    if (child?.hadBracesBefore) return 'Yes, they had braces before at a different orthodontist';
    return 'No, no previous orthodontic treatment';
  },

  // Preferences
  'asking_insurance': (inv) => {
    if (!inv.insuranceProvider && inv.hasInsurance === false) return 'No insurance';
    if (!inv.insuranceProvider) return 'I\'m not sure about insurance';
    return inv.insuranceProvider;
  },

  'asking_special_needs': (inv) => {
    const child = inv.children[0];
    if (child?.specialNeeds) return child.specialNeeds;
    return 'No special needs or conditions';
  },

  'asking_time_preference': (inv) => {
    if (inv.preferredDateRange) {
      const start = new Date(inv.preferredDateRange.start);
      const end = new Date(inv.preferredDateRange.end);
      const startStr = start.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      const endStr = end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      return `Any time between ${startStr} and ${endStr}`;
    }
    if (inv.preferredTimeOfDay && inv.preferredTimeOfDay !== 'any') {
      return `${inv.preferredTimeOfDay} works best`;
    }
    return 'Any time works for us';
  },

  'asking_location_preference': (inv) =>
    inv.preferredLocation || 'Either location is fine',

  // Confirmations
  'confirming_information': () => 'Yes, that\'s correct',
  'confirming_spelling': () => 'Yes, that\'s right',
  'asking_proceed_confirmation': () => 'Yes, please proceed anyway',
  'reminding_bring_card': () => 'Okay, I\'ll bring the insurance card',  // Acknowledge card reminder

  // Booking flow
  'searching_availability': () => 'Okay, thank you',  // Wait while bot searches
  'offering_time_slots': () => 'Yes, that time works',
  'confirming_booking': () => 'Great, thank you!',  // After booking is confirmed - DON'T say goodbye yet

  // Post-booking info
  'offering_address': () => 'Yes, could you give me the address?',  // User requests address
  'providing_address': () => 'Thank you, I got the address',         // Acknowledge address received
  'providing_parking_info': () => 'Perfect, thanks for the parking info!',  // Acknowledge parking info

  // Terminal
  'saying_goodbye': () => 'Thank you, goodbye!',

  // Transfers
  'initiating_transfer': () => 'Okay, I\'ll hold',

  // Error handling
  'handling_error': () => 'Can you please try again?',
  'asking_clarification': () => 'Sorry, could you repeat that?',

  // Greeting (usually we initiate, but in case agent greets)
  'greeting': () => 'Hi, I need to schedule an orthodontic appointment for my child',

  // Unknown - handled by smartFallback instead
  'unknown': () => 'Yes',  // Fallback only if smartFallback also fails
};

/**
 * Keyword patterns for smart fallback when intent classification fails.
 * Maps keywords in agent's message to the data field to provide.
 */
const SMART_FALLBACK_PATTERNS: Array<{
  pattern: RegExp;
  getResponse: (inv: DataInventory, ctx: ResponseContext) => string;
}> = [
  // Child name patterns
  {
    pattern: /\b(child|kid|patient|son|daughter)('s)?\s+(first\s+)?(name|called)\b/i,
    getResponse: (inv, ctx) => {
      const child = inv.children[ctx.currentChildIndex] || inv.children[0];
      return child ? `${child.firstName} ${child.lastName}` : 'Sorry, I don\'t have that information';
    },
  },
  {
    pattern: /\bwhat.*name.*child\b/i,
    getResponse: (inv, ctx) => {
      const child = inv.children[ctx.currentChildIndex] || inv.children[0];
      return child ? `${child.firstName} ${child.lastName}` : 'Sorry, I don\'t have that information';
    },
  },
  {
    pattern: /\bfirst\s+name\b/i,
    getResponse: (inv, ctx) => {
      const child = inv.children[ctx.currentChildIndex] || inv.children[0];
      return child?.firstName || inv.parentFirstName;
    },
  },
  {
    pattern: /\blast\s+name\b/i,
    getResponse: (inv, ctx) => {
      const child = inv.children[ctx.currentChildIndex] || inv.children[0];
      return child?.lastName || inv.parentLastName;
    },
  },
  // Date of birth patterns
  {
    pattern: /\b(date\s+of\s+birth|dob|birth\s*date|birthday|born)\b/i,
    getResponse: (inv, ctx) => {
      const child = inv.children[ctx.currentChildIndex] || inv.children[0];
      if (!child) return 'I\'m not sure';
      const dob = new Date(child.dateOfBirth);
      return dob.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    },
  },
  // Age patterns
  {
    pattern: /\b(how\s+old|age|years\s+old)\b/i,
    getResponse: (inv, ctx) => {
      const child = inv.children[ctx.currentChildIndex] || inv.children[0];
      if (!child) return 'I\'m not sure';
      const dob = new Date(child.dateOfBirth);
      const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
      return `${age} years old`;
    },
  },
  // Phone patterns
  {
    pattern: /\b(phone|number|call.*back|reach\s+you)\b/i,
    getResponse: (inv) => inv.parentPhone,
  },
  // Email patterns
  {
    pattern: /\b(email|e-mail)\b/i,
    getResponse: (inv) => inv.parentEmail || 'I don\'t have an email',
  },
  // Your/caller name patterns
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
  // New patient patterns
  {
    pattern: /\b(new\s+patient|first\s+time|been\s+here|visited\s+(before|us))\b/i,
    getResponse: (inv, ctx) => {
      const child = inv.children[ctx.currentChildIndex] || inv.children[0];
      if (child?.isNewPatient) return 'Yes, this would be our first visit';
      return inv.previousVisitToOffice ? 'No, we\'ve been here before' : 'Yes, this is our first time';
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
];

/**
 * Response Generator Service
 */
export class ResponseGenerator {
  private client: Anthropic | null = null;
  private config: ResponseGeneratorConfig;
  private persona: UserPersona;
  private context: ResponseContext;

  constructor(persona: UserPersona, cfg?: Partial<ResponseGeneratorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...cfg };
    this.persona = persona;
    this.context = {
      currentChildIndex: 0,
      providedData: new Set(),
      conversationHistory: [],
    };
    this.initializeClient();
  }

  private initializeClient(): void {
    // Only initialize LLM client when explicitly enabled via config
    // Verbosity level no longer forces LLM - templates work for all verbosity levels
    if (this.config.useLlm) {
      const token = process.env.CLAUDE_CODE_OAUTH_TOKEN ||
                    process.env.ANTHROPIC_API_KEY;
      if (token) {
        this.client = new Anthropic({ apiKey: token });
      }
    }
  }

  /**
   * Generate a response to the agent's question
   */
  async generateResponse(
    intent: IntentDetectionResult,
    conversationHistory: ConversationTurn[]
  ): Promise<string> {
    this.context.conversationHistory = conversationHistory;

    // Check if bot is asking about next/second/third child and advance index
    this.checkAndAdvanceChildIndex(intent, conversationHistory);

    // Get data for this intent
    const data = this.getDataForIntent(intent.primaryIntent);

    // Decide: template or LLM?
    const useTemplate = !this.shouldUseLlm(intent);

    if (useTemplate) {
      return this.generateTemplateResponse(intent.primaryIntent, data);
    }

    // Use LLM when enabled via config
    return this.generateLlmResponse(intent, data, conversationHistory);
  }

  /**
   * Check if the agent is asking about a different child and advance the index
   * This handles multi-child scenarios where the bot asks for "next child", "second child", etc.
   */
  private checkAndAdvanceChildIndex(
    intent: IntentDetectionResult,
    conversationHistory: ConversationTurn[]
  ): void {
    // Only check when asking about child-related info
    const childIntents: AgentIntent[] = [
      'asking_child_name',
      'asking_child_dob',
      'asking_child_age',
    ];

    if (!childIntents.includes(intent.primaryIntent)) {
      return;
    }

    // Get the last agent message
    const lastAgentTurn = [...conversationHistory].reverse().find(t => t.role === 'assistant');
    if (!lastAgentTurn) return;

    const agentMessage = lastAgentTurn.content.toLowerCase();

    // Patterns indicating we should advance to next child
    const nextChildPatterns = [
      /next child/i,
      /second child/i,
      /third child/i,
      /fourth child/i,
      /your other child/i,
      /another child/i,
      /what is the name of your (?:next|second|third|fourth|other)/i,
      /now.*(?:next|second|third|fourth|other) child/i,
    ];

    // Check for patterns suggesting next child
    const shouldAdvance = nextChildPatterns.some(pattern => pattern.test(agentMessage));

    // Also check if we've already provided info for current child and bot is asking again
    const hasProvidedCurrentChildName = this.context.providedData.has('child_names');
    const isAskingName = intent.primaryIntent === 'asking_child_name';

    // If we've provided a name and bot confirms and asks for next name, advance
    if (shouldAdvance && hasProvidedCurrentChildName && isAskingName) {
      this.nextChild();
      // Reset the child_names tracking so we can provide the new child's name
      this.context.providedData.delete('child_names');
    } else if (shouldAdvance && isAskingName) {
      // Even if we haven't tracked providing a name, if bot explicitly asks for next child, advance
      this.nextChild();
    }
  }

  /**
   * Determine if we should use LLM instead of template
   */
  private shouldUseLlm(intent: IntentDetectionResult): boolean {
    // No LLM client available - use templates
    if (!this.client) return false;

    // LLM is enabled - use it for unknown intents or low confidence
    if (intent.primaryIntent === 'unknown') return true;
    if (intent.confidence < 0.5) return true;

    // LLM is enabled - use it for all responses (respects verbosity in prompt)
    // The LLM prompt already handles different verbosity levels appropriately
    return true;
  }

  /**
   * Get relevant data from persona inventory for an intent
   */
  private getDataForIntent(intent: AgentIntent): Record<string, any> {
    const inv = this.persona.inventory;
    const child = inv.children[this.context.currentChildIndex] || inv.children[0];

    switch (intent) {
      case 'asking_parent_name':
        this.markProvided('parent_name');
        return { firstName: inv.parentFirstName, lastName: inv.parentLastName };

      case 'asking_spell_name':
        this.markProvided('parent_name_spelling');
        return { firstName: inv.parentFirstName, lastName: inv.parentLastName };

      case 'asking_phone':
        this.markProvided('parent_phone');
        return { phone: inv.parentPhone };

      case 'asking_email':
        this.markProvided('parent_email');
        return { email: inv.parentEmail };

      case 'asking_parent_dob':
        this.markProvided('parent_dob');
        return { dob: inv.parentDateOfBirth };

      case 'asking_child_count':
        this.markProvided('child_count');
        return { count: inv.children.length };

      case 'asking_child_name':
        this.markProvided('child_names');
        return { firstName: child?.firstName, lastName: child?.lastName };

      case 'asking_child_dob':
      case 'asking_child_age':
        this.markProvided('child_dob');
        return { dob: child?.dateOfBirth };

      case 'asking_new_patient':
        this.markProvided('is_new_patient');
        return { isNewPatient: child?.isNewPatient ?? true };

      case 'asking_previous_visit':
        this.markProvided('previous_visit');
        return { previousVisit: inv.previousVisitToOffice ?? false };

      case 'asking_previous_ortho':
        this.markProvided('previous_ortho');
        return { previousOrtho: inv.previousOrthoTreatment ?? child?.hadBracesBefore ?? false };

      case 'asking_insurance':
        this.markProvided('insurance');
        return { provider: inv.insuranceProvider, hasInsurance: inv.hasInsurance };

      case 'asking_special_needs':
        this.markProvided('special_needs');
        return { specialNeeds: child?.specialNeeds };

      case 'asking_time_preference':
        this.markProvided('time_preference');
        return {
          timeOfDay: inv.preferredTimeOfDay,
          dateRange: inv.preferredDateRange,
          days: inv.preferredDays,
        };

      case 'asking_location_preference':
        this.markProvided('location_preference');
        return { location: inv.preferredLocation };

      default:
        return {};
    }
  }

  /**
   * Mark a field as provided
   */
  private markProvided(field: CollectableField): void {
    this.context.providedData.add(field);
  }

  /**
   * Get fields that have been provided
   */
  getProvidedFields(): CollectableField[] {
    return Array.from(this.context.providedData);
  }

  /**
   * Generate response using template
   */
  private generateTemplateResponse(intent: AgentIntent, data: Record<string, any>): string {
    const template = RESPONSE_TEMPLATES[intent];

    // For unknown intents, try smart fallback first
    if (!template || intent === 'unknown') {
      const smartResponse = this.smartFallback();
      if (smartResponse) {
        return smartResponse;
      }
      // No template and smart fallback failed
      return 'Yes';
    }

    try {
      return template(this.persona.inventory, this.context);
    } catch (error) {
      console.warn('[ResponseGenerator] Template error for', intent, error);
      // Try smart fallback before giving up
      const smartResponse = this.smartFallback();
      return smartResponse || 'Yes';
    }
  }

  /**
   * Smart fallback for when intent classification fails.
   * Analyzes the agent's last message for keywords and provides appropriate data.
   */
  private smartFallback(): string | null {
    // Get the last agent message from conversation history
    const lastAgentTurn = [...this.context.conversationHistory]
      .reverse()
      .find(t => t.role === 'assistant');

    if (!lastAgentTurn) {
      return null;
    }

    const agentMessage = lastAgentTurn.content;

    // Check each smart fallback pattern
    for (const { pattern, getResponse } of SMART_FALLBACK_PATTERNS) {
      if (pattern.test(agentMessage)) {
        try {
          const response = getResponse(this.persona.inventory, this.context);
          console.log(`[ResponseGenerator] Smart fallback matched: ${pattern.source} -> "${response}"`);
          return response;
        } catch (error) {
          console.warn('[ResponseGenerator] Smart fallback error for pattern', pattern.source, error);
        }
      }
    }

    // No pattern matched
    console.log(`[ResponseGenerator] Smart fallback: no pattern matched for "${agentMessage.substring(0, 100)}..."`);
    return null;
  }

  /**
   * Generate response using LLM
   * Includes Langfuse generation tracking for observability
   */
  private async generateLlmResponse(
    intent: IntentDetectionResult,
    data: Record<string, any>,
    history: ConversationTurn[]
  ): Promise<string> {
    if (!this.client) {
      // Fall back to template
      return this.generateTemplateResponse(intent.primaryIntent, data);
    }

    const traits = this.persona.traits;
    const recentHistory = history.slice(-4);

    const childInfo = this.persona.inventory.children.map(c =>
      `${c.firstName} ${c.lastName} (DOB: ${c.dateOfBirth})`
    ).join(', ');

    const prompt = `You are simulating a PARENT calling an orthodontic office to schedule an appointment FOR THEIR CHILD.

## CRITICAL RULE
The appointment is ALWAYS for your CHILD, never for yourself. You are the parent calling on behalf of your child.
Your children: ${childInfo}

## Your Persona
- Name: ${this.persona.name} (you are the PARENT)
- Verbosity: ${traits.verbosity}
- Provides extra unrequested info: ${traits.providesExtraInfo}

## Agent's Question Intent
${intent.primaryIntent} (confidence: ${intent.confidence})
${intent.reasoning || ''}

## Your Data to Provide
${JSON.stringify(data, null, 2)}

## Recent Conversation
${recentHistory.map(t => `[${t.role}]: ${t.content}`).join('\n')}

## Instructions
Generate a natural response as this persona would give.
${traits.verbosity === 'terse' ? 'Keep it very brief - just the requested info.' : ''}
${traits.verbosity === 'verbose' ? 'Be conversational and add some natural filler.' : ''}
${traits.providesExtraInfo ? 'You can volunteer related information if natural.' : 'Only answer what was asked.'}
IMPORTANT: If asked who the appointment is for, ALWAYS say it's for your CHILD, not yourself.
IMPORTANT: When discussing scheduling preferences, NEVER request specific days of the week (Monday, Tuesday, Wednesday, etc.). Only express general preferences like "morning", "afternoon", or "anytime". Be flexible about which day - just express time-of-day preference.

Return ONLY the response text, nothing else.`;

    // Get Langfuse context and start generation tracking
    const langfuse = getLangfuseService();
    const traceContext = getCurrentTraceContext();
    let generation: any = null;
    const startTime = Date.now();

    if (traceContext && await langfuse.ensureInitialized()) {
      try {
        generation = await langfuse.startGeneration({
          name: 'response-generator',
          traceId: traceContext.traceId,
          parentObservationId: traceContext.parentObservationId,
          model: this.config.model,
          modelParameters: {
            temperature: this.config.temperature,
            maxTokens: this.config.maxTokens,
          },
          input: {
            intent: intent.primaryIntent,
            confidence: intent.confidence,
            persona: this.persona.name,
            verbosity: traits.verbosity,
          },
          metadata: {
            provider: 'anthropic',
            purpose: 'response-generation',
            personaName: this.persona.name,
            intentType: intent.primaryIntent,
            verbosityLevel: traits.verbosity,
            childIndex: this.context.currentChildIndex,
          },
        });
      } catch (e: any) {
        console.warn(`[ResponseGenerator] Langfuse generation start failed: ${e.message}`);
      }
    }

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        messages: [{ role: 'user', content: prompt }],
      });

      const textContent = response.content.find(c => c.type === 'text');
      if (textContent && textContent.type === 'text') {
        const result = textContent.text.trim();

        // End Langfuse generation with success
        if (generation) {
          try {
            langfuse.endGeneration(generation.id, {
              output: { response: result.substring(0, 500) },
              usage: {
                input: response.usage?.input_tokens || 0,
                output: response.usage?.output_tokens || 0,
                total: (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0),
              },
              level: 'DEFAULT',
            });
          } catch (e: any) {
            console.warn(`[ResponseGenerator] Langfuse generation end failed: ${e.message}`);
          }
        }

        return result;
      }
    } catch (error: any) {
      console.warn('[ResponseGenerator] LLM generation failed:', error);

      // End Langfuse generation with error
      if (generation) {
        try {
          langfuse.endGeneration(generation.id, {
            output: { error: error.message },
            level: 'ERROR',
            statusMessage: error.message,
          });
        } catch (e: any) {
          console.warn(`[ResponseGenerator] Langfuse generation error end failed: ${e.message}`);
        }
      }
    }

    // Fall back to template (also end generation if still open)
    if (generation) {
      try {
        langfuse.endGeneration(generation.id, {
          output: { fallback: 'template' },
          level: 'WARNING',
          statusMessage: 'Fell back to template response',
        });
      } catch (e: any) {
        // Ignore
      }
    }

    return this.generateTemplateResponse(intent.primaryIntent, data);
  }

  /**
   * Move to next child (for multi-child scenarios)
   */
  nextChild(): void {
    if (this.context.currentChildIndex < this.persona.inventory.children.length - 1) {
      this.context.currentChildIndex++;
    }
  }

  /**
   * Get current child index
   */
  getCurrentChildIndex(): number {
    return this.context.currentChildIndex;
  }

  /**
   * Reset for a new conversation
   */
  reset(): void {
    this.context = {
      currentChildIndex: 0,
      providedData: new Set(),
      conversationHistory: [],
    };
  }
}

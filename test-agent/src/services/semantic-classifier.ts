/**
 * Semantic Classifier Service
 *
 * AI-first classification system that replaces 100+ brittle regex patterns
 * with semantic understanding via LLM. Uses intelligent caching to maintain
 * performance while providing superior accuracy.
 *
 * Key features:
 * - LLM-first classification (no pattern matching)
 * - Conversation context awareness
 * - Multi-field detection (e.g., "phone and email" → both fields)
 * - Terminal state detection with reasoning
 * - LRU cache with 5-minute TTL
 * - Backward compatible with CategoryClassificationResult
 */

import { z } from 'zod';
import { getLLMProvider, LLMProvider } from '../../../shared/services/llm-provider';
import {
  ResponseCategory,
  DataFieldCategory,
  ConfirmationSubject,
  TerminalState,
  CategoryClassificationResult,
  CategoryClassificationResultSchema,
  FIELD_TO_LEGACY_INTENT,
  CATEGORY_TO_LEGACY_INTENT,
} from '../schemas/response-category-schemas';
import type { IntentDetectionResult, AgentIntent } from '../tests/types/intent';
import type { ConversationTurn } from '../tests/test-case';
import type { UserPersona } from '../tests/types/persona';

// =============================================================================
// Configuration
// =============================================================================

export interface SemanticClassifierConfig {
  /** Model for LLM classification */
  model: string;

  /** Temperature for LLM (lower = more deterministic) */
  temperature: number;

  /** Max tokens for response */
  maxTokens: number;

  /** Timeout in ms */
  timeout: number;

  /** Whether to cache results */
  cacheEnabled: boolean;

  /** Cache TTL in ms */
  cacheTtlMs: number;

  /** Max cache entries (LRU eviction) */
  maxCacheEntries: number;

  /** Minimum confidence threshold */
  minConfidence: number;
}

const DEFAULT_CONFIG: SemanticClassifierConfig = {
  model: 'claude-3-5-haiku-20241022',
  temperature: 0.0, // Deterministic for classification
  maxTokens: 1024,
  timeout: 30000, // 30s for CLI mode reliability
  cacheEnabled: true,
  cacheTtlMs: 300000, // 5 minutes
  maxCacheEntries: 1000,
  minConfidence: 0.7,
};

// =============================================================================
// Semantic Classification Result Schema (Extended)
// =============================================================================

/**
 * Extended classification result with semantic details
 */
export const SemanticClassificationResultSchema = z.object({
  // Primary classification (matches CategoryClassificationResult)
  category: z.enum(['provide_data', 'confirm_or_deny', 'select_from_options', 'acknowledge', 'clarify_request', 'express_preference']),
  confidence: z.number().min(0).max(1),

  // Data fields being requested (can be MULTIPLE)
  dataFields: z.array(z.enum([
    'caller_name', 'caller_name_spelling', 'caller_phone', 'caller_email', 'parent_dob',
    'child_count', 'child_name', 'child_name_spelling', 'child_dob', 'child_age',
    'new_patient_status', 'previous_visit', 'previous_ortho_treatment',
    'insurance_info', 'insurance_member_id', 'special_needs', 'medical_conditions', 'card_reminder',
    'time_preference', 'location_preference', 'day_preference',
    'other', 'unknown'
  ])).optional(),

  // Confirmation context
  confirmationSubject: z.enum([
    'information_correct', 'phone_number_correct', 'proceed_anyway', 'booking_details',
    'wants_address', 'wants_parking_info', 'spelling_correct', 'insurance_card_reminder',
    'previous_visit', 'previous_treatment', 'has_insurance', 'wants_time_slot', 'ready_to_book',
    'medical_conditions', 'special_needs', 'general'
  ]).optional(),
  expectedAnswer: z.enum(['yes', 'no', 'either']).optional(),

  // Options for select_from_options
  options: z.array(z.object({
    label: z.string(),
    day: z.string().optional(),
    time: z.string().optional(),
    location: z.string().optional(),
  })).optional(),

  // Information provided (for acknowledge)
  infoProvided: z.string().optional(),

  // Terminal state
  terminalState: z.enum(['booking_confirmed', 'transfer_initiated', 'conversation_ended', 'error_terminal', 'none']),
  terminalStateContext: z.string().optional(), // e.g., "Appointment confirmed for Monday 9am"

  // Flow indicators
  bookingMentioned: z.boolean(),
  transferMentioned: z.boolean(),
  bookingConfirmedThisTurn: z.boolean(),

  // Context awareness
  isFollowUp: z.boolean(), // Is this a follow-up to a previous question?
  isMultiPart: z.boolean(), // Are multiple questions being asked?
  childIndex: z.number().optional(), // Which child is this about? (0-indexed)

  // Reasoning for transparency
  reasoning: z.string(),
});

export type SemanticClassificationResult = z.infer<typeof SemanticClassificationResultSchema>;

// =============================================================================
// LRU Cache Implementation
// =============================================================================

interface CacheEntry {
  result: CategoryClassificationResult;
  timestamp: number;
  accessCount: number;
}

class LRUCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttlMs: number;

  constructor(maxSize: number, ttlMs: number) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): CategoryClassificationResult | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    // Update access for LRU
    entry.accessCount++;
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.result;
  }

  set(key: string, result: CategoryClassificationResult): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
      accessCount: 1,
    });
  }

  private evictLRU(): void {
    // Remove oldest entry (first in Map iteration order)
    const firstKey = this.cache.keys().next().value;
    if (firstKey) {
      this.cache.delete(firstKey);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }

  stats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      ttlMs: this.ttlMs,
    };
  }
}

// =============================================================================
// Semantic Classifier Service
// =============================================================================

export class SemanticClassifier {
  private llmProvider: LLMProvider;
  private config: SemanticClassifierConfig;
  private cache: LRUCache;

  constructor(cfg?: Partial<SemanticClassifierConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...cfg };
    this.llmProvider = getLLMProvider();
    this.cache = new LRUCache(this.config.maxCacheEntries, this.config.cacheTtlMs);
    console.log('[SemanticClassifier] Initialized with LLM-first classification');
  }

  /**
   * Classify an agent response semantically
   */
  async classify(
    agentResponse: string,
    conversationHistory: ConversationTurn[],
    persona: UserPersona
  ): Promise<CategoryClassificationResult> {
    // Check cache first
    const cacheKey = this.getCacheKey(agentResponse, conversationHistory);
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        console.log('[SemanticClassifier] Cache hit');
        return cached;
      }
    }

    // LLM classification
    try {
      const result = await this.classifyWithLLM(agentResponse, conversationHistory, persona);

      // Convert to backward-compatible format and cache
      const compatibleResult = this.toCompatibleResult(result);

      if (this.config.cacheEnabled) {
        this.cache.set(cacheKey, compatibleResult);
      }

      console.log(`[SemanticClassifier] Classified: ${result.category} (${result.confidence.toFixed(2)}) - ${result.reasoning.substring(0, 50)}...`);
      return compatibleResult;
    } catch (error: any) {
      console.error('[SemanticClassifier] LLM classification failed:', error.message);
      return this.getFallbackResult(agentResponse);
    }
  }

  /**
   * Generate cache key based on message and recent context
   */
  private getCacheKey(agentResponse: string, conversationHistory: ConversationTurn[]): string {
    // Include last intent in cache key for context-awareness
    const lastIntent = conversationHistory.length > 0
      ? conversationHistory[conversationHistory.length - 1].content.substring(0, 50)
      : '';

    const normalized = agentResponse.toLowerCase().trim().replace(/\s+/g, ' ');
    return `${normalized.substring(0, 150)}|${lastIntent}`;
  }

  /**
   * Perform LLM-based classification
   */
  private async classifyWithLLM(
    agentResponse: string,
    conversationHistory: ConversationTurn[],
    persona: UserPersona
  ): Promise<SemanticClassificationResult> {
    const prompt = this.buildClassificationPrompt(agentResponse, conversationHistory, persona);

    const response = await this.llmProvider.execute({
      prompt,
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      timeout: this.config.timeout,
      purpose: 'semantic-evaluation',
      metadata: {
        service: 'semantic-classifier',
        agentMessageLength: agentResponse.length,
        historyLength: conversationHistory.length,
      },
    });

    if (!response.success || !response.content) {
      throw new Error(response.error || 'No response from LLM');
    }

    return this.parseLLMResponse(response.content, agentResponse);
  }

  /**
   * Build the classification prompt
   */
  private buildClassificationPrompt(
    agentResponse: string,
    conversationHistory: ConversationTurn[],
    persona: UserPersona
  ): string {
    const recentHistory = conversationHistory.slice(-4);
    const historyText = recentHistory.length > 0
      ? recentHistory.map((t, i) => `[Turn ${i + 1} - ${t.role}]: ${t.content}`).join('\n')
      : '(No prior conversation)';

    const childInfo = persona.inventory.children.map((c, i) =>
      `  Child ${i + 1}: ${c.firstName} ${c.lastName}, DOB: ${c.dateOfBirth}`
    ).join('\n');

    return `You are a semantic classifier for an orthodontic scheduling assistant test system.

## Task
Analyze the agent's message and determine what type of response the caller (parent) should provide.

## Agent's Message
"${agentResponse}"

## Conversation Context
${historyText}

## Caller Information
- Parent: ${persona.inventory.parentFirstName} ${persona.inventory.parentLastName}
- Phone: ${persona.inventory.parentPhone}
- Number of children: ${persona.inventory.children.length}
${childInfo}
- Has insurance: ${persona.inventory.hasInsurance ?? 'unknown'}
- Insurance provider: ${persona.inventory.insuranceProvider ?? 'unknown'}

## Classification Instructions

### Response Categories
- **provide_data**: Agent is asking for specific information (name, phone, DOB, insurance, etc.)
- **confirm_or_deny**: Agent is asking a yes/no question or seeking confirmation
- **select_from_options**: Agent is offering specific choices (time slots, locations)
- **acknowledge**: Agent provided information that just needs acknowledgment (no question)
- **clarify_request**: Agent's request is unclear - caller should ask for clarification
- **express_preference**: Agent asking open-ended preference (morning vs afternoon)

### Data Fields (use ALL that apply - agent may ask for multiple things)
caller_name, caller_name_spelling, caller_phone, caller_email, parent_dob,
child_count, child_name, child_name_spelling, child_dob, child_age,
new_patient_status, previous_visit, previous_ortho_treatment,
insurance_info, insurance_member_id, special_needs, medical_conditions, card_reminder,
time_preference, location_preference, day_preference

### Terminal State Detection (CRITICAL)
**Only mark as terminal if the ACTION IS COMPLETE (past tense):**

booking_confirmed:
- "Your appointment has been scheduled" ✓
- "I've booked you for Monday" ✓
- "You're all set for 9am" ✓
- "Your appointment is confirmed" ✓
- "Let me schedule that" ✗ (future tense = NOT terminal)
- "I'm booking that now" ✗ (in progress = NOT terminal)

transfer_initiated:
- "I'm transferring you now" ✓
- "Connecting you to a specialist" ✓
- "Would you like me to transfer you?" ✗ (question = NOT terminal)

conversation_ended:
- "Goodbye, have a great day" ✓
- "Thank you for calling" ✓

### Multi-Part Questions
If the agent asks multiple things (e.g., "What's your phone number and email?"), include ALL fields in dataFields array.

### Follow-up Detection
If the agent is following up on something already discussed, set isFollowUp: true.

### Child Index
For multi-child scenarios, determine which child is being discussed:
- "first child" or first child's name → childIndex: 0
- "second child" or second child's name → childIndex: 1
- Generic "your child" when multiple children → use current context

## Response Format
Return ONLY a JSON object (no markdown, no explanation):

{
  "category": "provide_data" | "confirm_or_deny" | "select_from_options" | "acknowledge" | "clarify_request" | "express_preference",
  "confidence": 0.0-1.0,
  "dataFields": ["field1", "field2", ...],
  "confirmationSubject": "information_correct" | "phone_number_correct" | "proceed_anyway" | "booking_details" | "wants_address" | "wants_parking_info" | "spelling_correct" | "insurance_card_reminder" | "previous_visit" | "previous_treatment" | "has_insurance" | "wants_time_slot" | "ready_to_book" | "medical_conditions" | "special_needs" | "general",
  "expectedAnswer": "yes" | "no" | "either",
  "options": [{"label": "Monday at 9am", "day": "Monday", "time": "9:00 AM"}],
  "infoProvided": "address" | "parking" | "hours" | "card_reminder" | null,
  "terminalState": "booking_confirmed" | "transfer_initiated" | "conversation_ended" | "error_terminal" | "none",
  "terminalStateContext": "Appointment confirmed for Monday at 9am",
  "bookingMentioned": true/false,
  "transferMentioned": true/false,
  "bookingConfirmedThisTurn": true/false,
  "isFollowUp": true/false,
  "isMultiPart": true/false,
  "childIndex": 0,
  "reasoning": "Brief explanation of classification"
}

Include only relevant optional fields. Always include: category, confidence, terminalState, bookingMentioned, transferMentioned, bookingConfirmedThisTurn, isFollowUp, isMultiPart, reasoning.`;
  }

  /**
   * Parse and validate LLM response
   */
  private parseLLMResponse(text: string, originalMessage: string): SemanticClassificationResult {
    try {
      // Extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Apply defaults and sanitize
      const sanitized = this.sanitizeResult(parsed, originalMessage);

      // Validate with Zod
      return SemanticClassificationResultSchema.parse(sanitized);
    } catch (error: any) {
      console.warn('[SemanticClassifier] Failed to parse LLM response:', error.message);
      console.warn('[SemanticClassifier] Raw response:', text.substring(0, 200));
      throw error;
    }
  }

  /**
   * Sanitize and apply defaults to parsed result
   */
  private sanitizeResult(parsed: any, originalMessage: string): any {
    // Normalize category - LLM sometimes confuses category with terminalState
    let category = parsed.category || 'provide_data';
    const terminalStates = ['booking_confirmed', 'transfer_initiated', 'conversation_ended', 'error_terminal'];
    if (terminalStates.includes(category)) {
      // If category is actually a terminal state, set it as terminalState and default category to acknowledge
      if (!parsed.terminalState || parsed.terminalState === 'none') {
        parsed.terminalState = category;
      }
      category = 'acknowledge';
    }

    // Ensure required fields have valid values
    const result: any = {
      category,
      confidence: typeof parsed.confidence === 'number' ? Math.max(0, Math.min(1, parsed.confidence)) : 0.5,
      terminalState: parsed.terminalState || 'none',
      bookingMentioned: parsed.bookingMentioned ?? /\b(book|appointment|schedule)\b/i.test(originalMessage),
      transferMentioned: parsed.transferMentioned ?? /\b(transfer|connect|hold)\b/i.test(originalMessage),
      bookingConfirmedThisTurn: parsed.bookingConfirmedThisTurn ?? false,
      isFollowUp: parsed.isFollowUp ?? false,
      isMultiPart: parsed.isMultiPart ?? false,
      reasoning: parsed.reasoning || 'No reasoning provided',
    };

    // Copy optional fields if present and valid
    if (parsed.dataFields && Array.isArray(parsed.dataFields)) {
      result.dataFields = parsed.dataFields;
    }
    if (parsed.confirmationSubject) {
      result.confirmationSubject = parsed.confirmationSubject;
    }
    if (parsed.expectedAnswer) {
      // Normalize expectedAnswer - LLM sometimes returns "yes/no" instead of "either"
      const normalizedAnswer = String(parsed.expectedAnswer).toLowerCase();
      if (normalizedAnswer === 'yes/no' || normalizedAnswer === 'yes or no') {
        result.expectedAnswer = 'either';
      } else if (['yes', 'no', 'either'].includes(normalizedAnswer)) {
        result.expectedAnswer = normalizedAnswer as 'yes' | 'no' | 'either';
      } else {
        result.expectedAnswer = 'either'; // Default to either for unknown values
      }
    }
    if (parsed.options && Array.isArray(parsed.options)) {
      result.options = parsed.options;
    }
    if (parsed.infoProvided) {
      result.infoProvided = parsed.infoProvided;
    }
    if (parsed.terminalStateContext) {
      result.terminalStateContext = parsed.terminalStateContext;
    }
    if (typeof parsed.childIndex === 'number') {
      result.childIndex = parsed.childIndex;
    }

    return result;
  }

  /**
   * Convert SemanticClassificationResult to backward-compatible CategoryClassificationResult
   */
  private toCompatibleResult(result: SemanticClassificationResult): CategoryClassificationResult {
    const compatible: CategoryClassificationResult = {
      category: result.category as ResponseCategory,
      confidence: result.confidence,
      terminalState: result.terminalState as TerminalState,
      bookingMentioned: result.bookingMentioned,
      transferMentioned: result.transferMentioned,
      bookingConfirmedThisTurn: result.bookingConfirmedThisTurn,
      reasoning: result.reasoning,
    };

    if (result.dataFields && result.dataFields.length > 0) {
      compatible.dataFields = result.dataFields as DataFieldCategory[];
    }
    if (result.confirmationSubject) {
      compatible.confirmationSubject = result.confirmationSubject as ConfirmationSubject;
    }
    if (result.expectedAnswer) {
      compatible.expectedAnswer = result.expectedAnswer;
    }
    if (result.options && result.options.length > 0) {
      compatible.options = result.options.map(o => o.label);
    }
    if (result.infoProvided) {
      compatible.infoProvided = result.infoProvided;
    }

    return compatible;
  }

  /**
   * Fallback result when LLM fails
   */
  private getFallbackResult(agentResponse: string): CategoryClassificationResult {
    // Basic heuristics as absolute fallback
    const isQuestion = agentResponse.includes('?');
    const hasBookingWords = /\b(book|schedule|appointment)\b/i.test(agentResponse);
    const hasConfirmationWords = /\b(confirmed|scheduled|booked|set)\b/i.test(agentResponse);
    const isPastTense = /\b(has been|have been|is confirmed|are confirmed|'ve |'s been)\b/i.test(agentResponse);

    return {
      category: isQuestion ? 'provide_data' : 'acknowledge',
      confidence: 0.3,
      dataFields: ['unknown'],
      terminalState: (hasConfirmationWords && isPastTense) ? 'booking_confirmed' : 'none',
      bookingMentioned: hasBookingWords,
      transferMentioned: /\b(transfer|connect)\b/i.test(agentResponse),
      bookingConfirmedThisTurn: hasConfirmationWords && isPastTense,
      reasoning: 'Fallback classification - LLM unavailable',
    };
  }

  /**
   * Convert to legacy IntentDetectionResult for backward compatibility
   */
  toLegacyIntent(result: CategoryClassificationResult): IntentDetectionResult {
    let primaryIntent: AgentIntent = 'unknown';

    // Map based on category and dataFields
    if (result.dataFields && result.dataFields.length > 0) {
      const field = result.dataFields[0];
      primaryIntent = (FIELD_TO_LEGACY_INTENT[field] as AgentIntent) || 'unknown';
    } else {
      primaryIntent = (CATEGORY_TO_LEGACY_INTENT[result.category] as AgentIntent) || 'unknown';
    }

    // Override for terminal states
    if (result.terminalState === 'booking_confirmed' || result.bookingConfirmedThisTurn) {
      primaryIntent = 'confirming_booking';
    } else if (result.terminalState === 'transfer_initiated') {
      primaryIntent = 'initiating_transfer';
    } else if (result.terminalState === 'conversation_ended') {
      primaryIntent = 'saying_goodbye';
    }

    // Override for specific confirmation subjects
    const isTerminalIntent = result.terminalState && result.terminalState !== 'none';
    const shouldPreserveBookingIntent = result.bookingConfirmedThisTurn === true;

    if (result.category === 'confirm_or_deny' && !isTerminalIntent && !shouldPreserveBookingIntent) {
      switch (result.confirmationSubject) {
        case 'phone_number_correct':
          primaryIntent = 'asking_phone';
          break;
        case 'spelling_correct':
          primaryIntent = 'confirming_spelling';
          break;
        case 'proceed_anyway':
          primaryIntent = 'asking_proceed_confirmation';
          break;
        case 'wants_address':
          primaryIntent = 'offering_address';
          break;
        case 'wants_parking_info':
          primaryIntent = 'providing_parking_info';
          break;
        case 'insurance_card_reminder':
          primaryIntent = 'reminding_bring_card';
          break;
        case 'medical_conditions':
        case 'special_needs':
          primaryIntent = 'asking_special_needs';
          break;
      }
    }

    // Handle select_from_options
    if (result.category === 'select_from_options' && !isTerminalIntent) {
      primaryIntent = 'offering_time_slots';
    }

    // Handle acknowledge
    if (result.category === 'acknowledge' && result.terminalState === 'none') {
      if (result.infoProvided === 'address_and_parking') {
        primaryIntent = 'providing_address_and_parking';
      } else if (/address/i.test(result.infoProvided || '')) {
        primaryIntent = 'providing_address';
      } else if (/parking/i.test(result.infoProvided || '')) {
        primaryIntent = 'providing_parking_info';
      } else if (/hours/i.test(result.infoProvided || '')) {
        primaryIntent = 'providing_hours_info';
      } else if (/card_reminder/i.test(result.infoProvided || '')) {
        primaryIntent = 'reminding_bring_card';
      } else {
        primaryIntent = 'searching_availability';
      }
    }

    const terminalIntents: AgentIntent[] = ['saying_goodbye', 'confirming_booking', 'initiating_transfer'];

    return {
      primaryIntent,
      confidence: result.confidence,
      isQuestion: result.category !== 'acknowledge',
      requiresUserResponse: !terminalIntents.includes(primaryIntent),
      reasoning: result.reasoning,
    };
  }

  /**
   * Check if result indicates terminal state
   */
  isTerminal(result: CategoryClassificationResult): boolean {
    return result.terminalState !== 'none' && result.confidence >= 0.7;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxSize: number; ttlMs: number } {
    return this.cache.stats();
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

// =============================================================================
// Singleton Factory
// =============================================================================

let defaultInstance: SemanticClassifier | null = null;

export function getSemanticClassifier(): SemanticClassifier {
  if (!defaultInstance) {
    defaultInstance = new SemanticClassifier();
  }
  return defaultInstance;
}

export function resetSemanticClassifier(): void {
  defaultInstance = null;
}

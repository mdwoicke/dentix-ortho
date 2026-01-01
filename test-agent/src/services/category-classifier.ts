/**
 * Category Classifier Service
 *
 * Two-tier classification system:
 * - Tier 1: Fast pattern-based rules (no LLM)
 * - Tier 2: LLM fallback for ambiguous cases
 *
 * Replaces 60+ specific intents with 6 response categories.
 */

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

export interface CategoryClassifierConfig {
  /** Confidence threshold for Tier 1 (below this, use LLM) */
  tier1ConfidenceThreshold: number;

  /** Whether to use LLM for Tier 2 */
  useLlm: boolean;

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
}

const DEFAULT_CONFIG: CategoryClassifierConfig = {
  tier1ConfidenceThreshold: 0.8,
  useLlm: true,
  model: 'claude-3-5-haiku-20241022',
  temperature: 0.1,
  maxTokens: 512,
  timeout: 15000,
  cacheEnabled: true,
  cacheTtlMs: 300000, // 5 minutes
};

// =============================================================================
// Pattern Rules for Tier 1
// =============================================================================

interface PatternRule {
  category: ResponseCategory;
  patterns: RegExp[];
  confidence: number;
  priority: number; // Higher = checked first
  extractors?: {
    dataFields?: (text: string) => DataFieldCategory[];
    confirmationSubject?: (text: string) => ConfirmationSubject;
    options?: (text: string) => string[];
    terminalState?: (text: string) => TerminalState;
  };
}

/**
 * Ordered pattern rules for Tier 1 classification
 * Higher priority rules are checked first
 */
const PATTERN_RULES: PatternRule[] = [
  // ==========================================================================
  // TERMINAL STATE DETECTION (Highest Priority)
  // ==========================================================================
  {
    category: 'acknowledge',
    patterns: [
      // Standard patterns
      /\b(your appointment|booking|appointment)\s+(has been|is)\s+(successfully\s+)?(scheduled|booked|confirmed)\b/i,
      /\bI have (booked|scheduled|confirmed)\b/i,
      /\bconfirmation number\b/i,
      // Plural appointments (multi-child scenarios)
      /\b(both|all|your)\s+appointments?\s+(are|is)\s+confirmed\b/i,
      // Direct confirmation phrases
      /\bappointment\s+is\s+confirmed\b/i,
      /\bappointments?\s+confirmed\b/i,
      /\byou('re| are)\s+(all\s+)?(set|booked|scheduled)\b/i,
      /\bwe('ve| have)\s+(scheduled|booked)\s+(you|your)\b/i,
      // Scheduled for pattern
      /\b(is|are)\s+scheduled\s+for\b/i,
    ],
    confidence: 0.95,
    priority: 100,
    extractors: {
      terminalState: () => 'booking_confirmed',
    },
  },
  {
    category: 'acknowledge',
    patterns: [
      /\b(transfer|connect|transferring)\s+(you|caller)\s+(to|with)\b/i,
      /\bplease hold\s+(while|as)\s+I\s+transfer\b/i,
      /\blet me (transfer|connect) you\b/i,
    ],
    confidence: 0.95,
    priority: 99,
    extractors: {
      terminalState: () => 'transfer_initiated',
    },
  },
  {
    category: 'acknowledge',
    patterns: [
      /\b(goodbye|bye|have a (great|good|nice|wonderful) day)\b/i,
      /\bthank you for calling\b/i,
      /\btake care\b/i,
    ],
    confidence: 0.90,
    priority: 98,
    extractors: {
      terminalState: () => 'conversation_ended',
    },
  },

  // ==========================================================================
  // CONFIRM_OR_DENY (High Priority)
  // ==========================================================================
  {
    category: 'confirm_or_deny',
    patterns: [
      /\bis that (correct|right|accurate)\b/i,
      /\bdoes that (sound|look) (correct|right|good)\b/i,
      /\bcan you confirm\b/i,
      /\bjust to confirm\b/i,
    ],
    confidence: 0.90,
    priority: 80,
    extractors: {
      confirmationSubject: () => 'information_correct',
    },
  },
  {
    category: 'confirm_or_deny',
    patterns: [
      /\bwould you like to proceed\s*(anyway)?\b/i,
      /\bshould (I|we) proceed\b/i,
      /\bdo you (still )?want to (proceed|continue|book)\b/i,
    ],
    confidence: 0.90,
    priority: 79,
    extractors: {
      confirmationSubject: () => 'proceed_anyway',
    },
  },
  {
    category: 'confirm_or_deny',
    patterns: [
      /\bis (the|that) spelling (correct|right)\b/i,
      /\bdid I (spell|get) that (right|correctly)\b/i,
    ],
    confidence: 0.90,
    priority: 78,
    extractors: {
      confirmationSubject: () => 'spelling_correct',
    },
  },
  {
    category: 'confirm_or_deny',
    patterns: [
      /\bwould you like the (address|directions)\b/i,
      /\bcan I give you the address\b/i,
    ],
    confidence: 0.88,
    priority: 77,
    extractors: {
      confirmationSubject: () => 'wants_address',
    },
  },
  {
    category: 'confirm_or_deny',
    patterns: [
      /\bwould you like (the )?parking (info|information)\b/i,
      /\bshould I tell you about parking\b/i,
    ],
    confidence: 0.88,
    priority: 76,
    extractors: {
      confirmationSubject: () => 'wants_parking_info',
    },
  },
  {
    // "Would you like me to check/look/search for..." patterns
    // These are offers to perform an action - expect "yes" response
    category: 'confirm_or_deny',
    patterns: [
      /\bwould you like me to (check|look|search|find)\b/i,
      /\bshould I (check|look|search|find) for\b/i,
      /\bwant me to (check|look|search|find)\b/i,
      /\bshall I (check|look|search|find)\b/i,
      /\bwould you like me to see (if|what|when)\b/i,
    ],
    confidence: 0.90,
    priority: 75,
    extractors: {
      confirmationSubject: () => 'general',
    },
  },
  {
    category: 'acknowledge',
    patterns: [
      /\bplease (remember to )?bring (your )?insurance card\b/i,
      /\bdon't forget (to bring |your )?insurance\b/i,
    ],
    confidence: 0.88,
    priority: 74,
    extractors: {
      confirmationSubject: () => 'insurance_card_reminder',
    },
  },

  // ==========================================================================
  // SELECT_FROM_OPTIONS
  // ==========================================================================
  {
    category: 'select_from_options',
    patterns: [
      /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(at\s+)?\d+[:\d]*\s*(am|pm)?\b/i,
      /\bI (have|found|see)\s+(an?|some)\s+(opening|slot|availability|time)\b/i,
      /\b(how about|what about|would)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    ],
    confidence: 0.88,
    priority: 70,
    extractors: {
      options: (text) => {
        const slots: string[] = [];
        // Extract day + time patterns
        const dayTimePattern = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(?:at\s+)?(\d+[:\d]*\s*(?:am|pm)?)/gi;
        let match;
        while ((match = dayTimePattern.exec(text)) !== null) {
          slots.push(`${match[1]} at ${match[2]}`.trim());
        }
        // Extract location patterns
        const locationPattern = /\b(alleghany|philadelphia|main street|oak avenue)\b/gi;
        while ((match = locationPattern.exec(text)) !== null) {
          if (!slots.includes(match[1])) {
            slots.push(match[1]);
          }
        }
        return [...new Set(slots)];
      },
    },
  },

  // ==========================================================================
  // PROVIDE_DATA - Identity Fields
  // ==========================================================================
  {
    category: 'provide_data',
    patterns: [
      /\b(what('s| is)|may I have|could I get|can I have)\s+(your\s+)?(full\s+)?name\b/i,
      /\bwho am I speaking with\b/i,
      /\b(first and last|full) name\b/i,
    ],
    confidence: 0.90,
    priority: 60,
    extractors: {
      dataFields: () => ['caller_name'],
    },
  },
  {
    category: 'provide_data',
    patterns: [
      /\b(spell|spelling)\b.*\bname\b/i,
      /\bhow do you spell\b/i,
      /\bcan you spell that\b/i,
    ],
    confidence: 0.90,
    priority: 59,
    extractors: {
      dataFields: () => ['caller_name_spelling'],
    },
  },
  {
    category: 'provide_data',
    patterns: [
      /\b(what('s| is)|may I have|could I get)\s+(your\s+)?(phone|contact)\s*(number)?\b/i,
      /\bgood (phone|contact) number\b/i,
      /\bbest (phone|number|way) to reach you\b/i,
      /\bphone number\s+(to reach|for)\b/i,
      /\b(what('s| is)|may I have)\s+(the\s+)?(best\s+)?(phone|contact)\s*(number)?\b/i,
      /\bwhat('s| is)\s+\w+\s+phone\s*number\b/i,
    ],
    confidence: 0.90,
    priority: 58,
    extractors: {
      dataFields: () => ['caller_phone'],
    },
  },
  {
    category: 'provide_data',
    patterns: [
      /\b(what('s| is)|may I have|could I get)\s+(your\s+)?email\b/i,
      /\bemail address\b/i,
    ],
    confidence: 0.88,
    priority: 57,
    extractors: {
      dataFields: () => ['caller_email'],
    },
  },

  // ==========================================================================
  // PROVIDE_DATA - Child Fields
  // ==========================================================================
  {
    category: 'provide_data',
    patterns: [
      /\bhow many (children|kids)\b/i,
      /\bnumber of (children|kids)\b/i,
    ],
    confidence: 0.90,
    priority: 55,
    extractors: {
      dataFields: () => ['child_count'],
    },
  },
  {
    category: 'provide_data',
    patterns: [
      /\b(what('s| is)|may I have)\s+(the\s+)?(child'?s?|patient'?s?|son'?s?|daughter'?s?)\s+(first\s+)?(and\s+last\s+)?(full\s+)?name\b/i,
      /\bname of (the\s+)?(child|patient|son|daughter)\b/i,
      /\b(child|son|daughter)('?s)? (full\s+)?name\b/i,
      /\b(your\s+)?(son'?s?|daughter'?s?)\s+(full\s+)?name\b/i,
      /\bwhat'?s\s+(your\s+)?(son'?s?|daughter'?s?)\s+name\b/i,
    ],
    confidence: 0.90,
    priority: 55, // Higher priority to ensure son/daughter name questions match correctly
    extractors: {
      dataFields: () => ['child_name'],
    },
  },
  {
    category: 'provide_data',
    patterns: [
      /\b(what('s| is)|when is)\s+(the\s+)?(child'?s?|patient'?s?|son'?s?|daughter'?s?)?\s*(date of birth|dob|birthday|birth date)\b/i,
      /\bwhen (was|were) (the\s+)?(child|patient|son|daughter|they|he|she) born\b/i,
      /\b(child|son|daughter)('?s)? (date of birth|birthday|dob)\b/i,
      /\bwhat('s| is)\s+\w+'?s?\s+(date of birth|dob|birthday|birth date)\b/i,
      /\b\w+'?s\s+(date of birth|dob|birthday)\b/i,
      /\b(your\s+)?(son'?s?|daughter'?s?)\s+(date of birth|birthday|dob)\b/i,
    ],
    confidence: 0.90,
    priority: 54, // Slightly lower than child_name (55)
    extractors: {
      dataFields: () => ['child_dob'],
    },
  },
  {
    category: 'provide_data',
    patterns: [
      /\bhow old is (the\s+)?(child|patient)\b/i,
      /\b(child'?s?|patient'?s?) age\b/i,
      /\bwhat age is\b/i,
    ],
    confidence: 0.88,
    priority: 52,
    extractors: {
      dataFields: () => ['child_age'],
    },
  },

  // ==========================================================================
  // PROVIDE_DATA - History Fields
  // ==========================================================================
  {
    category: 'provide_data',
    patterns: [
      /\b(is|are) (this|the\s+child|the\s+patient|they) (a\s+)?new (patient|to (our|this))\b/i,
      /\bnew patient\b.*\?/i,
      /\bhave (you|they) been (to|seen at) (our|this) office before\b/i,
    ],
    confidence: 0.88,
    priority: 50,
    extractors: {
      dataFields: () => ['new_patient_status'],
    },
  },
  {
    category: 'provide_data',
    patterns: [
      /\bhave (you|they) visited (this|our) (office|location) before\b/i,
      /\bprevious visit\b/i,
      /\bbeen here before\b/i,
      // Additional patterns for child/patient visit questions
      /\bhas (your|the) (child|patient|son|daughter) been (to|at) (our|this|the) office before\b/i,
      /\b(child|patient|kid) (been|visited) (here|our office|this office) before\b/i,
      /\bvisited (us|this office|our office) before\b/i,
    ],
    confidence: 0.88,
    priority: 49,
    extractors: {
      dataFields: () => ['previous_visit'],
    },
  },
  {
    category: 'provide_data',
    patterns: [
      /\bhad (braces|orthodontic treatment|ortho) before\b/i,
      /\bhad braces (or|and) orthodontic treatment before\b/i,
      /\bhad (braces|ortho|orthodontic).*(before|previously)\b/i,
      /\bprevious orthodontic\b/i,
      /\bseen (an )?orthodontist before\b/i,
      /\borthodontic treatment before\b/i,
    ],
    confidence: 0.85,
    priority: 48,
    extractors: {
      dataFields: () => ['previous_ortho_treatment'],
    },
  },

  // ==========================================================================
  // PROVIDE_DATA - Insurance & Needs
  // ==========================================================================
  {
    category: 'provide_data',
    patterns: [
      /\b(what('s| is)|do you have)\s+(your\s+)?insurance\b/i,
      /\binsurance (provider|company|carrier)\b/i,
      /\bwho is (your\s+)?insurance (with|through)\b/i,
      /\bwhat insurance (do you have|does \w+ have)\b/i,
      /\bwhat (kind of )?insurance\b/i,
      /\b(do you have|does \w+ have) insurance\b/i,
    ],
    confidence: 0.88,
    priority: 45,
    extractors: {
      dataFields: () => ['insurance_info'],
    },
  },
  {
    category: 'provide_data',
    patterns: [
      // Question-form patterns (high priority - match actual questions, not acknowledgments)
      /\b(are there )?(any )?special (needs|accommodations|requirements)\b/i,
      /\bspecial needs or accommodations\b/i,
      /\b(should|do) (we|I) (know|note|be aware)\b/i,
      /\banything (else )?(we should know|to note|to be aware of)\b/i,
      /\bmedical conditions\b/i,
      /\baccommodations (we should|to) (know|note)\b/i,
    ],
    confidence: 0.92, // Higher confidence to beat previous_ortho_treatment
    priority: 49, // Higher priority than previous_ortho_treatment (48)
    extractors: {
      dataFields: () => ['special_needs'],
    },
  },

  // ==========================================================================
  // EXPRESS_PREFERENCE
  // ==========================================================================
  {
    category: 'express_preference',
    patterns: [
      /\bprefer\s+(morning|afternoon|evening)\b/i,
      /\b(morning|afternoon|evening)\s+or\s+(morning|afternoon|evening)\b/i,
      /\bwhat time (of day )?works (best|better)\b/i,
    ],
    confidence: 0.85,
    priority: 40,
    extractors: {
      dataFields: () => ['time_preference'],
    },
  },
  {
    category: 'express_preference',
    patterns: [
      /\bwhich location\b/i,
      /\bprefer(red)? location\b/i,
      /\b(alleghany|philadelphia)\s+or\s+(alleghany|philadelphia)\b/i,
    ],
    confidence: 0.85,
    priority: 39,
    extractors: {
      dataFields: () => ['location_preference'],
    },
  },

  // ==========================================================================
  // ACKNOWLEDGE (Information Provided)
  // ==========================================================================
  {
    category: 'acknowledge',
    patterns: [
      /\b(the\s+)?address is\b/i,
      /\blocated at\b/i,
      /\boffice is at\b/i,
    ],
    confidence: 0.85,
    priority: 30,
    extractors: {
      terminalState: () => 'none',
    },
  },
  {
    category: 'acknowledge',
    patterns: [
      /\bparking (is|available)\b/i,
      /\bfree parking\b/i,
      /\bpark in\b/i,
    ],
    confidence: 0.85,
    priority: 29,
    extractors: {
      terminalState: () => 'none',
    },
  },
  {
    category: 'acknowledge',
    patterns: [
      /\b(let me|one moment|checking|looking)\b.*\b(check|look|search|find)\b/i,
      /\bI('m| am) (checking|looking|searching)\b/i,
    ],
    confidence: 0.80,
    priority: 28,
    extractors: {
      terminalState: () => 'none',
    },
  },

  // ==========================================================================
  // CLARIFY_REQUEST (Low Priority Fallback)
  // ==========================================================================
  {
    category: 'clarify_request',
    patterns: [
      /\b(sorry|pardon|excuse me)\b.*\b(repeat|say that again|didn't (catch|understand))\b/i,
      /\bcould you (please )?(repeat|clarify)\b/i,
      /\bI didn't (quite )?(understand|catch|get) that\b/i,
    ],
    confidence: 0.85,
    priority: 20,
  },
];

// =============================================================================
// Cache Entry
// =============================================================================

interface CacheEntry {
  result: CategoryClassificationResult;
  timestamp: number;
}

// =============================================================================
// Category Classifier Service
// =============================================================================

export class CategoryClassifier {
  private llmProvider: LLMProvider;
  private classifierConfig: CategoryClassifierConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private sortedRules: PatternRule[];

  constructor(cfg?: Partial<CategoryClassifierConfig>) {
    this.classifierConfig = { ...DEFAULT_CONFIG, ...cfg };
    this.llmProvider = getLLMProvider();
    // Sort rules by priority (descending)
    this.sortedRules = [...PATTERN_RULES].sort((a, b) => b.priority - a.priority);
    console.log('[CategoryClassifier] Initialized with', this.sortedRules.length, 'pattern rules');
  }

  /**
   * Check if LLM is available for Tier 2
   */
  async isLlmAvailable(): Promise<boolean> {
    const status = await this.llmProvider.checkAvailability();
    return status.available && this.classifierConfig.useLlm;
  }

  /**
   * Classify an agent response into a response category
   */
  async classify(
    agentResponse: string,
    conversationHistory: ConversationTurn[],
    persona: UserPersona
  ): Promise<CategoryClassificationResult> {
    // Check cache first
    const cacheKey = this.getCacheKey(agentResponse);
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return cached;
    }

    // Tier 1: Pattern-based classification
    const tier1Result = this.classifyWithPatterns(agentResponse);

    if (tier1Result.confidence >= this.classifierConfig.tier1ConfidenceThreshold) {
      console.log(`[CategoryClassifier] Tier 1 match: ${tier1Result.category} (${tier1Result.confidence.toFixed(2)})`);
      this.saveToCache(cacheKey, tier1Result);
      return tier1Result;
    }

    // Tier 2: LLM-based classification
    const llmAvailable = await this.isLlmAvailable();
    if (llmAvailable) {
      try {
        const tier2Result = await this.classifyWithLlm(agentResponse, conversationHistory, persona);
        console.log(`[CategoryClassifier] Tier 2 match: ${tier2Result.category} (${tier2Result.confidence.toFixed(2)})`);
        this.saveToCache(cacheKey, tier2Result);
        return tier2Result;
      } catch (error) {
        console.warn('[CategoryClassifier] LLM classification failed, using Tier 1 result:', error);
      }
    }

    // Fall back to Tier 1 result even if below threshold
    console.log(`[CategoryClassifier] Using Tier 1 fallback: ${tier1Result.category} (${tier1Result.confidence.toFixed(2)})`);
    this.saveToCache(cacheKey, tier1Result);
    return tier1Result;
  }

  /**
   * Tier 1: Pattern-based classification
   */
  private classifyWithPatterns(agentResponse: string): CategoryClassificationResult {
    for (const rule of this.sortedRules) {
      for (const pattern of rule.patterns) {
        if (pattern.test(agentResponse)) {
          const result: CategoryClassificationResult = {
            category: rule.category,
            confidence: rule.confidence,
            terminalState: rule.extractors?.terminalState?.(agentResponse) || 'none',
            bookingMentioned: /\b(book|appointment|schedule)\b/i.test(agentResponse),
            transferMentioned: /\b(transfer|connect|hold)\b/i.test(agentResponse),
            matchedPattern: pattern.source,
          };

          // Apply extractors
          if (rule.extractors?.dataFields) {
            result.dataFields = rule.extractors.dataFields(agentResponse);
          }
          if (rule.extractors?.confirmationSubject) {
            result.confirmationSubject = rule.extractors.confirmationSubject(agentResponse);
          }
          if (rule.extractors?.options) {
            result.options = rule.extractors.options(agentResponse);
          }

          return result;
        }
      }
    }

    // No pattern matched - return low-confidence unknown
    return {
      category: 'provide_data',
      confidence: 0.3,
      dataFields: ['unknown'],
      terminalState: 'none',
      bookingMentioned: /\b(book|appointment|schedule)\b/i.test(agentResponse),
      transferMentioned: /\b(transfer|connect|hold)\b/i.test(agentResponse),
      reasoning: 'No pattern matched',
    };
  }

  /**
   * Tier 2: LLM-based classification
   */
  private async classifyWithLlm(
    agentResponse: string,
    conversationHistory: ConversationTurn[],
    persona: UserPersona
  ): Promise<CategoryClassificationResult> {
    const prompt = this.buildLlmPrompt(agentResponse, conversationHistory, persona);

    const response = await this.llmProvider.execute({
      prompt,
      model: this.classifierConfig.model,
      maxTokens: this.classifierConfig.maxTokens,
      temperature: this.classifierConfig.temperature,
      timeout: this.classifierConfig.timeout,
    });

    if (!response.success || !response.content) {
      throw new Error(response.error || 'No response from LLM');
    }

    return this.parseLlmResponse(response.content);
  }

  /**
   * Build prompt for LLM classification
   */
  private buildLlmPrompt(
    agentResponse: string,
    conversationHistory: ConversationTurn[],
    persona: UserPersona
  ): string {
    const recentHistory = conversationHistory.slice(-4);
    const historyText = recentHistory.length > 0
      ? recentHistory.map(t => `[${t.role}]: ${t.content}`).join('\n')
      : 'No prior conversation';

    return `You are classifying an orthodontic scheduling assistant's response to determine what TYPE of response is needed from the caller.

## Agent's Response
"${agentResponse}"

## Recent Conversation
${historyText}

## Caller Info
- Name: ${persona.inventory.parentFirstName} ${persona.inventory.parentLastName}
- Children: ${persona.inventory.children.length}
- Has Insurance: ${persona.inventory.hasInsurance ?? 'unknown'}

## Classification Task
Determine what TYPE of response the caller should give. Return ONLY a JSON object:

{
  "category": "provide_data" | "confirm_or_deny" | "select_from_options" | "acknowledge" | "clarify_request" | "express_preference",
  "confidence": 0.0-1.0,
  "dataFields": ["caller_name", "child_dob", ...], // if category is provide_data
  "confirmationSubject": "information_correct" | "proceed_anyway" | "booking_details" | "wants_address" | "wants_parking_info" | "spelling_correct" | "insurance_card_reminder" | "general", // if confirm_or_deny
  "expectedAnswer": "yes" | "no" | "either", // if confirm_or_deny
  "options": ["Monday at 9am", ...], // if select_from_options
  "terminalState": "booking_confirmed" | "transfer_initiated" | "conversation_ended" | "error_terminal" | "none",
  "bookingMentioned": true/false,
  "transferMentioned": true/false,
  "reasoning": "Brief explanation"
}

## Response Categories
- provide_data: Agent is asking for specific information (name, phone, DOB, etc.)
- confirm_or_deny: Agent is asking a yes/no question or seeking confirmation
- select_from_options: Agent is offering specific choices (time slots, locations)
- acknowledge: Agent provided information that just needs acknowledgment
- clarify_request: Agent's question is unclear, caller should ask for clarification
- express_preference: Agent asking open-ended preference (morning vs afternoon)

## Data Field Values
caller_name, caller_name_spelling, caller_phone, caller_email,
child_count, child_name, child_dob, child_age,
new_patient_status, previous_visit, previous_ortho_treatment,
insurance_info, special_needs, time_preference, location_preference

Return ONLY the JSON, no markdown.`;
  }

  /**
   * Parse LLM response into CategoryClassificationResult
   * Uses lenient parsing to handle LLM variations
   */
  private parseLlmResponse(text: string): CategoryClassificationResult {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Sanitize LLM response before Zod validation
      const sanitized = this.sanitizeLlmResponse(parsed);

      // Validate with Zod schema
      return CategoryClassificationResultSchema.parse(sanitized);
    } catch (error) {
      console.warn('[CategoryClassifier] Failed to parse LLM response:', error);
      // Return a safe default
      return {
        category: 'provide_data',
        confidence: 0.4,
        dataFields: ['unknown'],
        terminalState: 'none',
        bookingMentioned: false,
        transferMentioned: false,
        reasoning: 'Failed to parse LLM response',
      };
    }
  }

  /**
   * Sanitize LLM response to handle enum value variations
   */
  private sanitizeLlmResponse(parsed: any): any {
    const validCategories = ['provide_data', 'confirm_or_deny', 'select_from_options', 'acknowledge', 'clarify_request', 'express_preference'];
    const validConfirmationSubjects = ['information_correct', 'proceed_anyway', 'booking_details', 'wants_address', 'wants_parking_info', 'spelling_correct', 'insurance_card_reminder', 'general'];
    const validExpectedAnswers = ['yes', 'no', 'either'];
    const validTerminalStates = ['booking_confirmed', 'transfer_initiated', 'conversation_ended', 'error_terminal', 'none'];
    const validDataFields = ['caller_name', 'caller_name_spelling', 'caller_phone', 'caller_email', 'child_count', 'child_name', 'child_dob', 'child_age', 'new_patient_status', 'previous_visit', 'previous_ortho_treatment', 'insurance_info', 'special_needs', 'time_preference', 'location_preference', 'day_preference', 'other', 'unknown'];

    // Sanitize category
    if (!validCategories.includes(parsed.category)) {
      parsed.category = 'provide_data';
    }

    // Sanitize confirmationSubject - map invalid values to 'general'
    if (parsed.confirmationSubject && !validConfirmationSubjects.includes(parsed.confirmationSubject)) {
      // Check if it's actually a data field (LLM confusion)
      if (validDataFields.includes(parsed.confirmationSubject)) {
        // Move to dataFields and remove from confirmationSubject
        parsed.dataFields = parsed.dataFields || [];
        if (!parsed.dataFields.includes(parsed.confirmationSubject)) {
          parsed.dataFields.push(parsed.confirmationSubject);
        }
        parsed.confirmationSubject = 'general';
      } else {
        parsed.confirmationSubject = 'general';
      }
    }

    // Sanitize expectedAnswer
    if (parsed.expectedAnswer && !validExpectedAnswers.includes(parsed.expectedAnswer)) {
      // Handle "yes/no" -> "either"
      if (parsed.expectedAnswer.includes('/') || parsed.expectedAnswer.includes('or')) {
        parsed.expectedAnswer = 'either';
      } else if (parsed.expectedAnswer.toLowerCase().startsWith('yes')) {
        parsed.expectedAnswer = 'yes';
      } else if (parsed.expectedAnswer.toLowerCase().startsWith('no')) {
        parsed.expectedAnswer = 'no';
      } else {
        parsed.expectedAnswer = 'either';
      }
    }

    // Sanitize terminalState
    if (parsed.terminalState && !validTerminalStates.includes(parsed.terminalState)) {
      parsed.terminalState = 'none';
    }

    // Sanitize dataFields array
    if (parsed.dataFields && Array.isArray(parsed.dataFields)) {
      parsed.dataFields = parsed.dataFields
        .map((f: string) => validDataFields.includes(f) ? f : 'unknown')
        .filter((f: string, i: number, arr: string[]) => arr.indexOf(f) === i); // unique
    }

    return parsed;
  }

  /**
   * Convert CategoryClassificationResult to legacy IntentDetectionResult
   * for backwards compatibility with ProgressTracker
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
    if (result.terminalState === 'booking_confirmed') {
      primaryIntent = 'confirming_booking';
    } else if (result.terminalState === 'transfer_initiated') {
      primaryIntent = 'initiating_transfer';
    } else if (result.terminalState === 'conversation_ended') {
      primaryIntent = 'saying_goodbye';
    }

    // Override for specific confirmation subjects
    // IMPORTANT: Don't override terminal state intents (booking, transfer, goodbye)
    const isTerminalIntent = result.terminalState && result.terminalState !== 'none';
    if (result.category === 'confirm_or_deny' && !isTerminalIntent) {
      switch (result.confirmationSubject) {
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
      }
    }

    // Handle select_from_options (don't override terminal state intents)
    if (result.category === 'select_from_options' && !isTerminalIntent) {
      primaryIntent = 'offering_time_slots';
    }

    // Handle acknowledge
    if (result.category === 'acknowledge' && result.terminalState === 'none') {
      if (/address/i.test(result.infoProvided || '')) {
        primaryIntent = 'providing_address';
      } else if (/parking/i.test(result.infoProvided || '')) {
        primaryIntent = 'providing_parking_info';
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
    return result.terminalState !== 'none' && result.confidence >= 0.8;
  }

  // ==========================================================================
  // Caching
  // ==========================================================================

  private getCacheKey(response: string): string {
    return response.slice(0, 150).toLowerCase().replace(/\s+/g, ' ');
  }

  private getFromCache(key: string): CategoryClassificationResult | null {
    if (!this.classifierConfig.cacheEnabled) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.classifierConfig.cacheTtlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.result;
  }

  private saveToCache(key: string, result: CategoryClassificationResult): void {
    if (!this.classifierConfig.cacheEnabled) return;

    this.cache.set(key, {
      result,
      timestamp: Date.now(),
    });

    if (this.cache.size > 100) {
      this.cleanCache();
    }
  }

  private cleanCache(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.classifierConfig.cacheTtlMs) {
        this.cache.delete(key);
      }
    }
  }

  clearCache(): void {
    this.cache.clear();
  }
}

// =============================================================================
// Singleton
// =============================================================================

let defaultInstance: CategoryClassifier | null = null;

export function getCategoryClassifier(): CategoryClassifier {
  if (!defaultInstance) {
    defaultInstance = new CategoryClassifier();
  }
  return defaultInstance;
}

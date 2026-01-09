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
  tier1ConfidenceThreshold: 0.75, // Lowered from 0.8 - more pattern matches, fewer LLM calls
  useLlm: true,
  model: 'claude-3-5-haiku-20241022',
  temperature: 0.1,
  maxTokens: 512,
  timeout: 15000, // 15s - needed for parallel execution (8s caused too many timeouts)
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
    infoProvided?: (text: string) => string;
    bookingConfirmedThisTurn?: (text: string) => boolean;
  };
}

/**
 * Ordered pattern rules for Tier 1 classification
 * Higher priority rules are checked first
 */
const PATTERN_RULES: PatternRule[] = [
  // ==========================================================================
  // FALSE POSITIVE PREVENTION (Highest Priority - checked FIRST)
  // ==========================================================================
  // These patterns catch agent statements that SOUND like confirmations but aren't.
  // They must be checked BEFORE booking confirmation patterns.
  {
    category: 'acknowledge',
    patterns: [
      // Future/in-progress actions (NOT confirmations)
      /\blet me (verify|check|confirm|schedule|book)\b/i,
      /\bI('ll| will) (verify|check|confirm|schedule|book)\b/i,
      /\bI('m| am) (verifying|checking|confirming|scheduling|booking)\b/i,
      /\bone moment while I (verify|check|confirm|schedule|book)\b/i,
      /\bprocessing your (request|booking|appointment)\b/i,
      /\bjust a moment\b/i,
      /\blet me (look|search|find|pull up)\b/i,
      /\bI('m| am) (looking|searching|finding|pulling)\b/i,
    ],
    confidence: 0.85,
    priority: 105, // Higher than booking confirmation to catch false positives
    extractors: {
      terminalState: () => 'none', // Explicitly NOT a terminal state
      infoProvided: () => 'processing',
    },
  },
  // ==========================================================================
  // TERMINAL STATE DETECTION (Highest Priority)
  // ==========================================================================
  {
    category: 'acknowledge',
    patterns: [
      // Standard patterns - use PAST TENSE to indicate completed action
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
      bookingConfirmedThisTurn: () => true,
    },
  },
  {
    category: 'acknowledge',
    patterns: [
      // Actual transfer in progress - specific phrases indicating action is happening
      /\bI('m| am) (now\s+)?(transferring|connecting) you\b/i,
      /\btransferring you (now|to)\b/i,
      /\bplease hold\s+(while|as)\s+I\s+transfer\b/i,
      /\blet me transfer you (now|right now)\b/i,
      /\bconnecting you (now|right now)\b/i,
      // "One moment while I transfer your call"
      /\bone moment while I transfer\b/i,
      /\bwhile I transfer your call\b/i,
    ],
    confidence: 0.95,
    priority: 99,
    extractors: {
      terminalState: () => 'transfer_initiated',
    },
  },
  // Offer to transfer/connect - NOT a terminal state (just asking if user wants transfer)
  {
    category: 'confirm_or_deny',
    patterns: [
      /\bwould you like (me to )?(connect|transfer) you\b/i,
      /\bshould I (connect|transfer) you\b/i,
      /\bconnect you with a (specialist|representative|team member)\b/i,
      /\bwant me to (connect|transfer) you\b/i,
      /\bfor more options\??$/i,
    ],
    confidence: 0.90,
    priority: 98,
    extractors: {
      confirmationSubject: () => 'proceed_anyway',
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
  // Phone number confirmation - HIGHER priority than generic information_correct
  // This ensures phone confirmations are tracked for parent_phone collection
  {
    category: 'confirm_or_deny',
    patterns: [
      /\bis\s+[\d\-().\s]+\s+the best number\b/i,
      /\bthe best number to reach you\b/i,
      /\bis that the (right|correct|best) (number|phone)\b/i,
      /\bis this the (right|correct|best) (number|phone)\b/i,
      /\bcalling from\b.*\bis that the best number\b/i,
      /\bbest number for the account\b/i,
    ],
    confidence: 0.92,
    priority: 82,  // Higher than generic information_correct (80)
    extractors: {
      confirmationSubject: () => 'phone_number_correct',
    },
  },
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
    // Combined card reminder + special needs question (higher priority)
    // When agent mentions bringing insurance card AND asks about special needs,
    // we should classify as provide_data asking for special_needs
    // AND track card_reminder in dataFields for goal evaluation
    category: 'provide_data',
    patterns: [
      /\b(bring|remember).{0,80}(insurance|card).{0,100}special needs\b/i,
      /\binsurance card.{0,100}special needs\b/i,
      /\bverify.{0,30}coverage.{0,50}special needs\b/i,
    ],
    confidence: 0.90,
    priority: 76, // Higher than standalone card_reminder
    extractors: {
      dataFields: () => ['special_needs', 'card_reminder'], // Track both fields
      infoProvided: () => 'card_reminder',
    },
  },
  {
    category: 'acknowledge',
    patterns: [
      /\bplease (remember to )?bring (your )?insurance card\b/i,
      /\bdon't forget (to bring |your )?insurance\b/i,
      /\bremember to bring\b.*\bcard\b/i,
      /\bbring your (insurance )?card\b/i,
    ],
    confidence: 0.88,
    priority: 74,
    extractors: {
      terminalState: () => 'none',
      infoProvided: () => 'card_reminder',
    },
  },
  {
    // "Are you calling about X?" / "Is this for X?" / "Is this about X?" patterns
    // Common opening confirmation questions from agent - expect "yes" response
    category: 'confirm_or_deny',
    patterns: [
      /\bare you calling (about|for|regarding)\b/i,
      /\bis this (for|about|regarding)\s+(a|an)?\s*(ortho|braces|dental|appointment)\b/i,
      /\bis this (call )?(about|for|regarding)\b/i,
      /\bare you (looking|interested) (in|for)\b/i,
      /\blike braces\??$/i,  // "...like braces?"
      /\bor invisalign\??$/i,  // "...or Invisalign?"
    ],
    confidence: 0.88,
    priority: 73,
    extractors: {
      confirmationSubject: () => 'general',
    },
  },
  {
    // "Would that work?" / "Does that work?" patterns
    // Agent offering a time slot and asking for confirmation
    category: 'confirm_or_deny',
    patterns: [
      /\bwould that work\b/i,
      /\bdoes that work\b/i,
      /\bwork for you\?$/i,
      /\bwork for \w+\?$/i,  // "work for Emma?"
      /\bsound good\??$/i,
    ],
    confidence: 0.90,
    priority: 72,
    extractors: {
      confirmationSubject: () => 'booking_details',
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
    // CHILD name spelling request - HIGHEST priority to avoid matching caller_name_spelling
    // Patterns: "spell Jake's name", "spell your son's name", "spell your child's name"
    category: 'provide_data',
    patterns: [
      // Using child's actual name: "Could you please spell Jake's first and last name"
      /\bspell \w+'s (first )?(and last )?(full )?name\b/i,
      // "spell your child's/son's/daughter's name"
      /\bspell (your )?(child'?s?|son'?s?|daughter'?s?|kid'?s?|patient'?s?) (first )?(and last )?(full )?name\b/i,
      // "spell [Name]'s name letter by letter"
      /\bspell \w+'s.*letter by letter\b/i,
      // "how do you spell your child's/son's name"
      /\bhow do you spell (your )?(child'?s?|son'?s?|daughter'?s?) name\b/i,
    ],
    confidence: 0.92,
    priority: 63, // HIGHER than caller_name_spelling (61) to catch child spelling first
    extractors: {
      dataFields: () => ['child_name_spelling'],
    },
  },
  {
    // Parent/caller spelling request - lower priority than child name spelling
    category: 'provide_data',
    patterns: [
      /\bcan you spell your (full |last |first )?name\b/i,
      // Generic "spell name" - only if no child context
      /\bhow do you spell your name\b/i,
    ],
    confidence: 0.90,
    priority: 61, // Lower than child_name_spelling (63)
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
    // Spell your email - still returns caller_email (emails are spoken, not spelled letter by letter)
    category: 'provide_data',
    patterns: [
      /\b(spell|spelling)\b.*\bemail\b/i,
      /\bspell your email\b/i,
      /\bcan you spell.*email\b/i,
    ],
    confidence: 0.92,
    priority: 58,
    extractors: {
      dataFields: () => ['caller_email'],
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
      // Primary pattern - handles "What is your son's first and last name?" and "What is the first child's full name?"
      /\b(what('s| is)|may I have)\s+(the\s+|your\s+)?(first\s+|second\s+|third\s+)?(child'?s?|patient'?s?|son'?s?|daughter'?s?|kid'?s?)\s+(first\s+)?(and\s+last\s+)?(full\s+)?name\b/i,
      /\bname of (the\s+|your\s+)?(first\s+|second\s+)?(child|patient|son|daughter|kid)\b/i,
      /\b(first\s+|second\s+)?(child|son|daughter|kid)('?s)? (first\s+)?(and\s+last\s+)?(full\s+)?name\b/i,
      /\b(your\s+)?(first\s+|second\s+)?(son'?s?|daughter'?s?|child'?s?|kid'?s?)\s+(first\s+)?(and\s+last\s+)?(full\s+)?name\b/i,
      /\bwhat'?s\s+(your\s+)?(first\s+|second\s+)?(son'?s?|daughter'?s?|child'?s?)\s+(first\s+)?(and\s+last\s+)?name\b/i,
      // More specific patterns to capture child name questions with "first and last name"
      /\b(first\s+|second\s+)?(child'?s?|kid'?s?|patient'?s?|son'?s?|daughter'?s?).*(first\s+)?and\s+last\s+name\b/i,
      /\byour (first\s+|second\s+)?(child|kid|patient|son|daughter).*(first\s+)?(and\s+last\s+)?name\b/i,
    ],
    confidence: 0.90,
    priority: 62, // MUST be higher than caller_name (60) to correctly classify child name questions
    extractors: {
      dataFields: () => ['child_name'],
    },
  },
  {
    // PARENT's own DOB - "your date of birth" without child/patient qualifiers
    // This MUST have higher priority than child_dob to correctly distinguish
    category: 'provide_data',
    patterns: [
      /\bmay i have your (date of birth|dob|birth\s*date)\b/i,
      /\bwhat('s| is) your (date of birth|dob|birth\s*date)\b/i,
      /\byour (date of birth|dob|birth\s*date)\s*(please|in)\b/i,
      /\bprovide your (date of birth|dob|birth\s*date)\b/i,
      /\bi need your (date of birth|dob|birth\s*date)\b/i,
      /\byour own (date of birth|dob|birth\s*date)\b/i,
    ],
    confidence: 0.92,
    priority: 56, // HIGHER than child_dob (54) to capture parent DOB questions
    extractors: {
      dataFields: () => ['parent_dob'],
    },
  },
  {
    category: 'provide_data',
    patterns: [
      /\b(what('s| is)|when is)\s+(the\s+)?(child'?s?|patient'?s?|son'?s?|daughter'?s?)?\s*(date of birth|dob|birthday|birth date)\b/i,
      /\bwhen (was|were) (the\s+)?(child|patient|son|daughter|they|he|she) born\b/i,
      /\b(child|son|daughter)('?s)? (date of birth|birthday|dob)\b/i,
      /\b(your\s+)?(son'?s?|daughter'?s?)\s+(date of birth|birthday|dob)\b/i,
      // Pattern for using child's actual name: "What is Emma's date of birth?"
      // Matches: "[Name]'s date of birth" (any name followed by possessive + DOB phrase)
      /\bwhat('s| is)\s+\w+['']s\s+(date of birth|dob|birthday|birth\s*date)\b/i,
      // Pattern for "when was [Name] born"
      /\bwhen (was|were)\s+\w+\s+born\b/i,
    ],
    confidence: 0.90,
    priority: 54, // Lower than parent_dob (56) - child DOB requires child qualifier
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
      // Additional patterns for child/patient visit questions (singular)
      /\bhas (your|the) (child|patient|son|daughter) been (to|at) (our|this|the) office before\b/i,
      /\b(child|patient|kid) (been|visited) (here|our office|this office) before\b/i,
      /\bvisited (us|this office|our office) before\b/i,
      // Pattern for singular child with "been seen at" and "any of our offices"
      /\bhas (your )?(child|kid|patient|son|daughter) (ever )?(been |been seen )(to |at )?(our |this |the |any of our )?(offices?|location) before\b/i,
      // Patterns for multiple children - updated to handle "been seen at" and "any of our offices"
      /\bhave (either of |any of )?(your )?(children|kids) (ever )?(been |been seen )(to |at )?(our |this |the |any of our )?(offices?|location) before\b/i,
      /\bhas (either of |any of )?(your )?(children|kids) (ever )?(been |been seen )(to |at )?(our |this |the |any of our )?(offices?|location) before\b/i,
      /\b(children|kids) (ever )?(been|been seen) (here|to our office|at our office|at any of our offices) before\b/i,
      // "them" as pronoun reference to children
      /\bhave (any of )?them (ever )?(been|been seen) (to )?(our |this |the |any of our )?(offices?|location)? before\b/i,
      // Pattern for child's actual name: "Has Emma ever been seen at any of our offices before?"
      /\bhas \w+ (ever )?(been |been seen )(to |at )?(our |this |the |any of our )?(offices?|locations?) before\b/i,
      // Pattern for "Has either [Name] or your [other child]..." pattern
      /\bhas (either )?\w+ (or )?(your )?(child|second child|other child) (ever )?(been |been seen )(to |at )?(our |this |the |any of our )?(offices?|locations?) before\b/i,
      // Pattern for TWO child names: "Has either Michael or Lily ever been seen at any of our offices before?"
      /\bhas (either )?\w+ or \w+ (ever )?(been |been seen )(to |at )?(our |this |the |any of our )?(offices?|locations?) before\b/i,
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
    // Insurance member ID and group number - asked after carrier name
    category: 'provide_data',
    patterns: [
      /\bmember\s*id\s*(and|&)?\s*(group\s*(number|#)?)?/i,  // "member ID and group number"
      /\bgroup\s*(number|#)?\s*(and|&)?\s*(member\s*id)?/i,  // "group number and member ID"
      /\binsurance\s*(member\s*)?id/i,                       // "insurance ID", "insurance member ID"
      /\b(provide|tell me|give me)\s*(the\s+)?(member\s*id|group\s*(number|#))/i,
      /\b(do you have|what is)\s*(the\s+)?(member\s*id|group\s*(number|#))/i,
      /\bpolicy\s*number/i,                                  // "policy number"
    ],
    confidence: 0.90,
    priority: 46, // Slightly higher than insurance_info (45) to be checked first
    extractors: {
      dataFields: () => ['insurance_member_id'],
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
      // Additional patterns for "you'd like us to know" phrasing
      /\bspecial needs.{0,30}(know|aware|note)\b/i,
      /\b(know|aware|note).{0,30}special needs\b/i,
      /\baccommodations.{0,30}(you'd|you would) like\b/i,
      /\banything.{0,20}(us|we).{0,10}(know|aware)\b/i,
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
  // Combined address + parking pattern (higher priority - check first)
  {
    category: 'acknowledge',
    patterns: [
      // Address with parking in same message
      /\b(Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Drive|Dr).+\b(park|parking)\b/i,
      /\baddress.+\b(park|parking)\b/i,
      /\blocated.+\b(park|parking)\b/i,
    ],
    confidence: 0.88,
    priority: 32, // Higher than individual patterns
    extractors: {
      terminalState: () => 'none',
      infoProvided: () => 'address_and_parking',
    },
  },
  {
    category: 'acknowledge',
    patterns: [
      /\b(the\s+)?address is\b/i,
      /\blocated at\b/i,
      /\boffice is at\b/i,
      // Match "It's [number] [street name]" pattern (e.g., "It's 2301 East Allegheny Avenue")
      /\bIt('s| is)\s+\d+\s+[\w\s]+?(Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way)\b/i,
      // Match street address with suite/unit (e.g., "2301 East Allegheny Avenue, Suite 300")
      /\b\d+\s+[\w\s]+?(Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way).{0,20}(Suite|Ste|Unit|#)\s*\d+/i,
    ],
    confidence: 0.85,
    priority: 30,
    extractors: {
      terminalState: () => 'none',
      infoProvided: () => 'address',
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
      infoProvided: () => 'parking',
    },
  },
  // Hours of operation patterns - agent providing hours info
  {
    category: 'acknowledge',
    patterns: [
      /\bwe('re| are) open\b/i,
      /\bour hours\b/i,
      /\bhours (are|of operation)\b/i,
      /\bopen (from|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
      /\bmonday (through|to) (friday|saturday|sunday)\b/i,
      /\b\d+\s*(:\d+)?\s*(am|AM|pm|PM)\s+to\s+\d+\s*(:\d+)?\s*(am|AM|pm|PM)\b/i,
    ],
    confidence: 0.90,
    priority: 31, // Higher priority than address/parking to catch hours first
    extractors: {
      terminalState: () => 'none',
      infoProvided: () => 'hours',
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
            bookingConfirmedThisTurn: false,
            matchedPattern: pattern.source,
          };

          // Apply extractors
          if (rule.extractors?.dataFields) {
            result.dataFields = rule.extractors.dataFields(agentResponse);
            // Debug logging for special_needs detection
            if (result.dataFields?.includes('special_needs')) {
              console.log(`[CategoryClassifier] ✓ special_needs detected: pattern="${pattern.source.substring(0, 50)}..."`);
            }
          }
          if (rule.extractors?.confirmationSubject) {
            result.confirmationSubject = rule.extractors.confirmationSubject(agentResponse);
          }
          if (rule.extractors?.options) {
            result.options = rule.extractors.options(agentResponse);
          }
          if (rule.extractors?.infoProvided) {
            result.infoProvided = rule.extractors.infoProvided(agentResponse);
          }
          if (rule.extractors?.bookingConfirmedThisTurn) {
            result.bookingConfirmedThisTurn = rule.extractors.bookingConfirmedThisTurn(agentResponse);
          }

          // POST-PROCESSING: Check for follow-up questions after booking confirmation
          // If booking is confirmed BUT agent asks about address/parking, prioritize the question
          if (result.terminalState === 'booking_confirmed') {
            const followUpResult = this.checkForFollowUpQuestion(agentResponse, result);
            if (followUpResult) {
              console.log('[CategoryClassifier] Detected follow-up question after booking confirmation');
              return followUpResult;
            }
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
      bookingConfirmedThisTurn: false,
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

## CRITICAL: Terminal State Rules
terminalState="booking_confirmed" should ONLY be set when the agent EXPLICITLY confirms the booking is complete.

THESE ARE NOT CONFIRMATIONS (terminalState="none"):
- "Let me verify that information..."
- "I'm checking availability..."
- "Let me schedule that for you..."
- "I'll book that appointment..."
- "Processing your request..."
- "One moment while I confirm..."
- Any statement about FUTURE or IN-PROGRESS actions

THESE ARE CONFIRMATIONS (terminalState="booking_confirmed"):
- "Your appointment has been scheduled for..."
- "I've booked you for Monday at 9am"
- "Your appointment is confirmed"
- "You're all set for..."
- "I have scheduled your appointment"
- Past tense statements about completed booking

The key difference: A confirmation means the action is DONE, not that it's being attempted.

## Data Field Values
caller_name, caller_name_spelling, caller_phone, caller_email,
child_count, child_name, child_name_spelling, child_dob, child_age,
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
        bookingConfirmedThisTurn: false,
        reasoning: 'Failed to parse LLM response',
      };
    }
  }

  /**
   * Sanitize LLM response to handle enum value variations
   */
  private sanitizeLlmResponse(parsed: any): any {
    const validCategories = ['provide_data', 'confirm_or_deny', 'select_from_options', 'acknowledge', 'clarify_request', 'express_preference'];
    const validConfirmationSubjects = ['information_correct', 'phone_number_correct', 'proceed_anyway', 'booking_details', 'wants_address', 'wants_parking_info', 'spelling_correct', 'insurance_card_reminder', 'previous_visit', 'previous_treatment', 'has_insurance', 'wants_time_slot', 'ready_to_book', 'medical_conditions', 'special_needs', 'general'];
    const validExpectedAnswers = ['yes', 'no', 'either'];
    const validTerminalStates = ['booking_confirmed', 'transfer_initiated', 'conversation_ended', 'error_terminal', 'none'];
    const validDataFields = ['caller_name', 'caller_name_spelling', 'caller_phone', 'caller_email', 'parent_dob', 'child_count', 'child_name', 'child_name_spelling', 'child_dob', 'child_age', 'new_patient_status', 'previous_visit', 'previous_ortho_treatment', 'insurance_info', 'insurance_member_id', 'special_needs', 'medical_conditions', 'card_reminder', 'time_preference', 'location_preference', 'day_preference', 'other', 'unknown'];

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

    // Override for terminal states OR persistent flags
    if (result.terminalState === 'booking_confirmed' || result.bookingConfirmedThisTurn) {
      primaryIntent = 'confirming_booking';
    } else if (result.terminalState === 'transfer_initiated') {
      primaryIntent = 'initiating_transfer';
    } else if (result.terminalState === 'conversation_ended') {
      primaryIntent = 'saying_goodbye';
    }

    // Override for specific confirmation subjects
    // IMPORTANT: Don't override terminal state intents (booking, transfer, goodbye)
    // Also don't override if booking was confirmed this turn (even with follow-up question)
    const isTerminalIntent = result.terminalState && result.terminalState !== 'none';
    const shouldPreserveBookingIntent = result.bookingConfirmedThisTurn === true;
    if (result.category === 'confirm_or_deny' && !isTerminalIntent && !shouldPreserveBookingIntent) {
      switch (result.confirmationSubject) {
        case 'phone_number_correct':
          // Phone confirmation = asking_phone for progress tracking
          // This ensures parent_phone gets marked as collected
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
      }
    }

    // Handle select_from_options (don't override terminal state intents)
    if (result.category === 'select_from_options' && !isTerminalIntent) {
      primaryIntent = 'offering_time_slots';
    }

    // Handle acknowledge
    if (result.category === 'acknowledge' && result.terminalState === 'none') {
      // Check for combined address + parking first
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
   * Check for follow-up questions after booking confirmation
   * When agent confirms booking but asks "Would you like the address?", we should
   * treat this as a confirm_or_deny question, NOT a terminal state
   */
  private checkForFollowUpQuestion(
    agentResponse: string,
    originalResult: CategoryClassificationResult
  ): CategoryClassificationResult | null {
    // Patterns for follow-up questions after booking confirmation
    // These are ordered by specificity - more specific patterns first
    const addressQuestionPatterns = [
      // Direct questions at end of message
      /would you like the address\s*\??\s*$/i,
      /want the address\s*\??\s*$/i,
      /like the address\s*\??\s*$/i,
      // General patterns anywhere in message
      /\bwould you like (the|an?)\s*address\b/i,
      /\bwant (the|an?)\s*address\b/i,
      /\bneed (the|an?)\s*address\b/i,
      /\bprovide (the|an?)\s*address\b/i,
      /\bshould I (give|send|provide) you (the|an?)\s*address\b/i,
      /\bdo you (want|need) (the|an?)\s*address\b/i,
      // Question ending with "address?"
      /\baddress\s*\?\s*$/i,
    ];

    const parkingQuestionPatterns = [
      /\bwould you like (the\s+)?parking (info|information)\b/i,
      /\bwant (the\s+)?parking (info|information)\b/i,
      /\bparking info\s*\?\s*$/i,
    ];

    const anythingElsePatterns = [
      /\bis there anything else\b/i,
      /\banything else I can help\b/i,
      /\banything else\s*\?\s*$/i,
    ];

    // Check for address question
    for (const pattern of addressQuestionPatterns) {
      if (pattern.test(agentResponse)) {
        return {
          ...originalResult,
          category: 'confirm_or_deny' as ResponseCategory,
          confirmationSubject: 'wants_address' as ConfirmationSubject,
          terminalState: 'none' as TerminalState, // NOT terminal - user needs to respond
          reasoning: 'Booking confirmed but agent asking about address - requires user response',
        };
      }
    }

    // Check for parking question
    for (const pattern of parkingQuestionPatterns) {
      if (pattern.test(agentResponse)) {
        return {
          ...originalResult,
          category: 'confirm_or_deny',
          confirmationSubject: 'wants_parking_info',
          terminalState: 'none',
          reasoning: 'Booking confirmed but agent asking about parking - requires user response',
        };
      }
    }

    // Check for "anything else" question
    for (const pattern of anythingElsePatterns) {
      if (pattern.test(agentResponse)) {
        return {
          ...originalResult,
          category: 'confirm_or_deny',
          confirmationSubject: 'general',
          terminalState: 'none',
          reasoning: 'Booking confirmed but agent asking if anything else needed',
        };
      }
    }

    // No follow-up question detected - proceed with terminal state
    return null;
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

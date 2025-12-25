/**
 * Agent Intent Types for Goal-Oriented Testing
 *
 * Defines what the agent is asking for / doing in a response.
 */

/**
 * Possible intents detected from agent responses
 */
export type AgentIntent =
  // Greetings & Closings
  | 'greeting'
  | 'saying_goodbye'

  // Asking for parent information
  | 'asking_parent_name'
  | 'asking_spell_name'
  | 'asking_phone'
  | 'asking_email'

  // Asking for child information
  | 'asking_child_count'
  | 'asking_child_name'
  | 'asking_child_dob'
  | 'asking_child_age'

  // Asking about patient status
  | 'asking_new_patient'
  | 'asking_previous_visit'
  | 'asking_previous_ortho'

  // Asking about preferences/insurance
  | 'asking_insurance'
  | 'asking_special_needs'
  | 'asking_time_preference'
  | 'asking_location_preference'

  // Confirmations
  | 'confirming_information'
  | 'confirming_spelling'

  // Booking flow
  | 'offering_time_slots'
  | 'confirming_booking'

  // Transfers & errors
  | 'initiating_transfer'
  | 'handling_error'
  | 'asking_clarification'

  // Catch-all
  | 'unknown';

/**
 * Mapping from intent to the collectable field it relates to
 */
export const INTENT_TO_FIELD: Partial<Record<AgentIntent, string>> = {
  'asking_parent_name': 'parent_name',
  'asking_spell_name': 'parent_name_spelling',
  'asking_phone': 'parent_phone',
  'asking_email': 'parent_email',
  'asking_child_count': 'child_count',
  'asking_child_name': 'child_names',
  'asking_child_dob': 'child_dob',
  'asking_child_age': 'child_dob',
  'asking_new_patient': 'is_new_patient',
  'asking_previous_visit': 'previous_visit',
  'asking_previous_ortho': 'previous_ortho',
  'asking_insurance': 'insurance',
  'asking_special_needs': 'special_needs',
  'asking_time_preference': 'time_preference',
  'asking_location_preference': 'location_preference',
};

/**
 * Result of intent detection from agent response
 */
export interface IntentDetectionResult {
  /** Primary detected intent */
  primaryIntent: AgentIntent;

  /** Confidence score 0-1 */
  confidence: number;

  /** Secondary intents if agent asked multiple things */
  secondaryIntents?: AgentIntent[];

  /** Any information the agent mentioned/confirmed */
  extractedInfo?: Record<string, any>;

  /** Whether the response is a question */
  isQuestion: boolean;

  /** Whether a user response is expected/needed */
  requiresUserResponse: boolean;

  /** Raw reasoning from the LLM (for debugging) */
  reasoning?: string;
}

/**
 * Keywords that suggest specific intents (for fallback detection)
 */
export const INTENT_KEYWORDS: Record<AgentIntent, RegExp[]> = {
  'greeting': [/\b(hi|hello|welcome|good morning|good afternoon)\b/i, /\bmy name is allie\b/i],
  'saying_goodbye': [/\b(goodbye|bye|thank you for calling|have a great day)\b/i],

  'asking_parent_name': [/\b(your name|first and last name|full name)\b/i, /\bmay i have your.*name\b/i],
  'asking_spell_name': [/\b(spell|spelling|s-p-e-l-l)\b/i],
  'asking_phone': [/\b(phone|number|reach you|contact)\b/i],
  'asking_email': [/\b(email|e-mail)\b/i],

  'asking_child_count': [/\b(how many|number of).*child/i, /\bchildren.*coming in\b/i],
  'asking_child_name': [/\b(child'?s? name|name of.*child)\b/i],
  'asking_child_dob': [/\b(birth|birthday|born|date of birth|dob)\b/i],
  'asking_child_age': [/\b(how old|age)\b/i],

  'asking_new_patient': [/\b(new patient|first time|been here before)\b/i],
  'asking_previous_visit': [/\b(visited|been to|previous|before)\b/i],
  'asking_previous_ortho': [/\b(orthodont|braces|retainer|treatment before)\b/i],

  'asking_insurance': [/\b(insurance|coverage|carrier|provider)\b/i],
  'asking_special_needs': [/\b(special|condition|allerg|need to know|aware of)\b/i],
  'asking_time_preference': [/\b(time|when|schedule|appointment|availability|prefer)\b/i],
  'asking_location_preference': [/\b(location|office|alleghany|philadelphia)\b/i],

  'confirming_information': [/\b(confirm|correct|verify|got it|thank you)\b/i],
  'confirming_spelling': [/\b(spelled|s-\w+-\w+)\b/i],

  'offering_time_slots': [/\b(available|slot|opening|can see you)\b/i],
  'confirming_booking': [/\b(booked|scheduled|confirmed|appointment.*set)\b/i],

  'initiating_transfer': [/\b(transfer|connect|live agent|specialist|hold)\b/i],
  'handling_error': [/\b(sorry|apologize|trouble|try again)\b/i],
  'asking_clarification': [/\b(didn't catch|repeat|could you say|pardon)\b/i],

  'unknown': [],
};

/**
 * Simple keyword-based intent detection (fallback when LLM unavailable)
 */
export function detectIntentByKeywords(response: string): AgentIntent {
  for (const [intent, patterns] of Object.entries(INTENT_KEYWORDS)) {
    if (intent === 'unknown') continue;
    for (const pattern of patterns) {
      if (pattern.test(response)) {
        return intent as AgentIntent;
      }
    }
  }
  return 'unknown';
}

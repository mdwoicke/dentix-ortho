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
  | 'asking_parent_dob'  // Parent's own date of birth (not child's)

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
  | 'asking_proceed_confirmation'  // "Would you like to proceed anyway?" (e.g., out-of-network insurance)
  | 'reminding_bring_card'         // "Please bring your insurance card to the appointment"

  // Booking flow
  | 'searching_availability'  // Bot is looking up available times
  | 'offering_time_slots'     // Bot is presenting specific time options
  | 'confirming_booking'

  // Post-booking info
  | 'offering_address'        // Bot asks if caller wants the address
  | 'providing_address'       // Bot provides office address
  | 'providing_parking_info'  // Bot provides parking information
  | 'providing_address_and_parking' // Bot provides both address and parking info in same message
  | 'providing_hours_info'    // Bot provides hours of operation

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
  'asking_parent_dob': 'parent_dob',
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
  'reminding_bring_card': 'card_reminder',
  'providing_address': 'address_provided',
  'providing_parking_info': 'parking_info',
  'providing_hours_info': 'hours_info',
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
  'saying_goodbye': [
    /\b(goodbye|bye bye)\b/i,                    // Explicit goodbye
    /\bhave a (great|wonderful|nice) day\b/i,    // Farewell wishes
    /\bthank you for calling.*have a\b/i,        // "Thank you for calling! Have a great day"
    /\btake care\b/i,                            // "Take care!"
    /\bwe('ll| will) (see you|talk to you)\b/i,  // "We'll see you on Monday!"
  ],

  'asking_parent_name': [/\b(your name|first and last name|full name)\b/i, /\bmay i have your.*name\b/i],
  'asking_spell_name': [/\b(spell|spelling|s-p-e-l-l)\b/i],
  'asking_phone': [
    /\bphone\s*number\b/i,                    // "What is your phone number?"
    /\bbest number\b/i,                       // "is that the best number to reach you?"
    /\bnumber is ending\b/i,                  // "your number is ending in..."
    /\bcaller id\b/i,                         // references to caller ID
    /\bis that (the|a|your).*number\b/i,      // "is that the number to reach you?"
    /\bwhat.*(phone|number|contact)\b/i,      // "What is your phone/contact number?"
    /\bcan i (have|get) your.*(phone|number)\b/i, // "Can I have your phone number?"
  ],
  'asking_email': [
    /\bwhat('s| is) your (email|e-mail)\b/i,          // "What is your email?"
    /\b(email|e-mail) address\b/i,                     // "email address" in question context
    /\bmay i have your.*(email|e-mail)\b/i,           // "May I have your email?"
    /\bcan i get your.*(email|e-mail)\b/i,            // "Can I get your email?"
    /\bprovide.*(email|e-mail)\b/i,                   // "Please provide your email"
  ],

  'asking_parent_dob': [
    // PARENT's own DOB - "your date of birth" without child/kid qualifiers
    /\bmay i have your (date of birth|dob|birth\s*date)\b/i,           // "May I have your date of birth?"
    /\bwhat('s| is) your (date of birth|dob|birth\s*date)\b/i,         // "What is your date of birth?"
    /\byour (date of birth|dob|birth\s*date)\s*(please|in)\b/i,        // "your date of birth please"
    /\bprovide your (date of birth|dob|birth\s*date)\b/i,              // "provide your date of birth"
    /\bi need your (date of birth|dob|birth\s*date)\b/i,               // "I need your date of birth"
    /\byour own (date of birth|dob|birth\s*date)\b/i,                  // "your own date of birth"
  ],

  'asking_child_count': [/\b(how many|number of).*child/i, /\bchildren.*coming in\b/i],
  'asking_child_name': [
    /\bchild'?s?\s+(?:\w+\s+){0,4}name\b/i,   // "child's first and last name" - limit to 4 words between
    /\bname\s+of\s+(?:your\s+)?(?:\w+\s+)?child\b/i,  // "name of your child", "name of your second child"
    /\bwhat is (your )?child'?s?\b/i,         // "What is your child's..."
    /\bpatient'?s?\s+(?:\w+\s+){0,3}name\b/i, // "patient's name", "patient's first name"
    /\b(first|second|other)\s+child\b/i,      // "second child", "first child", "other child"
  ],
  'asking_child_dob': [
    // CHILD's DOB - requires "child", "kid", "patient" qualifier or possessive context
    /\bchild'?s?\s+(date of birth|dob|birth\s*date|birthday)\b/i,     // "child's date of birth"
    /\b(kid'?s?|patient'?s?)\s+(date of birth|dob|birth\s*date)\b/i,  // "kid's/patient's DOB"
    /\byour (child|kid|patient|son|daughter)('?s)? (date of birth|dob|birth\s*date|birthday)\b/i, // "your child's DOB"
    /\b(date of birth|dob|birth\s*date) (of|for) (your )?(child|kid|patient|son|daughter)\b/i,    // "DOB of your child"
  ],
  'asking_child_age': [/\b(how old|age)\b/i],

  'asking_new_patient': [/\b(new patient|first time|been here before)\b/i],
  'asking_previous_visit': [
    /\b(visited|been to|previous visit)\b/i,
    /\b(child|kid|patient|son|daughter).*(been|been seen).*(office|offices|location).*before\b/i,
    /\b(been seen at|been to).*(our|any of our|this).*(office|offices)\b/i,
  ],
  'asking_previous_ortho': [/\b(orthodont|braces|retainer|treatment before)\b/i],

  'asking_insurance': [
    /\bwhat (kind of |type of )?(insurance|coverage)\b/i,  // "What kind of insurance?"
    /\bwho is your (insurance|carrier|provider)\b/i,       // "Who is your insurance provider?"
    /\bdo you have (insurance|coverage)\b/i,               // "Do you have insurance?"
    /\b(insurance|carrier|provider).*(do you have|what is)\b/i, // "What insurance do you have?"
  ],
  'asking_special_needs': [
    /\bspecial needs\b/i,                            // "Do they have special needs?"
    /\bconditions? we should (know|be aware)\b/i,   // "conditions we should be aware of"
    /\ballerg(y|ies|ic)\b/i,                         // allergies
    /\bshould we be aware of\b/i,                    // "anything we should be aware of"
    /\bneed to know about\b/i,                       // "anything we need to know about"
  ],
  'asking_time_preference': [
    /\b(prefer|preference).*(time|morning|afternoon|day)\b/i,  // "Do you prefer morning or afternoon?"
    /\b(when|what time).*(work|available|convenient)\b/i,      // "When works for you?"
    /\bmorning or afternoon\b/i,                                // Direct question
    /\bwhat (time|day).*(prefer|work)\b/i,                     // "What time works best?"
  ],
  'asking_location_preference': [
    /\bwhich (location|office)\b/i,                    // "Which location would you prefer?"
    /\b(prefer|preference).*(location|office)\b/i,     // "Do you have a location preference?"
    /\balleghany or philadelphia\b/i,                  // Direct question
    /\bphiladelphia or alleghany\b/i,                  // Direct question (reverse order)
  ],

  'confirming_information': [/\b(confirm|correct|verify|got it|thank you)\b/i],
  'confirming_spelling': [/\b(spelled|s-\w+-\w+)\b/i],
  'asking_proceed_confirmation': [
    /\bwould you like to proceed\b/i,
    /\bdo you (still )?want to (proceed|continue)\b/i,
    /\bnot in.?network\b.*\b(proceed|continue|anyway)\b/i,
    /\b(proceed|continue) anyway\b/i,
  ],
  'reminding_bring_card': [
    /\bbring your insurance card\b/i,                          // "Please bring your insurance card"
    /\bbring.*(insurance|coverage) card\b/i,                   // "bring your insurance card to the appointment"
    /\binsurance card.*(to|at) the appointment\b/i,            // "insurance card to the appointment"
    /\bverify your coverage\b/i,                               // "verify your coverage details"
  ],

  'searching_availability': [
    /\b(let me check|one moment|checking|looking up|look up)\b.*\b(available|availability|times|slots)\b/i,
    /\b(available|availability).*\b(let me|one moment|checking)\b/i,
    /\bworking on finding\b.*\b(appointment|time|slot)\b/i,  // "working on finding the next available appointment"
    /\bchecking available appointment\b/i,                    // "checking available appointment times"
    /\bwill (let you know|offer you).*\b(slot|time)\b/i,      // "will let you know the first available slot"
  ],
  'offering_time_slots': [
    /\b(I have|we have|there is|there are).*\b(available|opening|slot)\b/i,
    /\bcan see you (on|at)\b/i,
    /\bI can offer\b/i,
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday).*\b(at|available)\b/i,
  ],
  'confirming_booking': [
    /\bappointment has been (successfully )?scheduled\b/i,
    /\bappointment.*scheduled\b/i,
    /\b(booked|scheduled) .* for (Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i,
    /\bI have booked\b/i,
    /\byour appointment is confirmed\b/i,
    /\bappointment.*set\b/i,
    // Note: "Let me get that booked" is NOT a confirmation - it's the bot starting to book
    // The actual confirmation comes AFTER with "Your appointment has been scheduled"
  ],

  'offering_address': [
    /\bwould you like.*(address|directions)\b/i,           // "Would you like the address?"
    /\bwant me to (give|provide).*(address|directions)\b/i, // "Want me to give you the address?"
    /\bneed.*(address|directions)\b/i,                      // "Do you need the address?"
  ],
  'providing_address': [
    /\boffice is located at\b/i,                            // "The office is located at..."
    /\baddress is\b/i,                                      // "The address is..."
    /\blocated at\b.*\d+\b/i,                               // "located at 123..."
    /\b\d+\s+\w+\s+(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr)\b/i, // Street address pattern
  ],
  'providing_parking_info': [
    /\bparking\b.*\b(available|lot|garage|street|behind|front|free)\b/i, // "Parking is available..."
    /\b(free|ample|plenty of)\s+parking\b/i,                              // "Free parking"
    /\bpark\b.*\b(building|office|lot)\b/i,                               // "You can park..."
  ],
  'providing_address_and_parking': [
    // Combined address + parking pattern
    /\b(Avenue|Ave|Street|St|Road|Rd).+\b(park|parking)\b/i,
  ],
  'providing_hours_info': [
    /\bwe('re| are) open\b/i,                                             // "We're open..."
    /\bour hours\b/i,                                                     // "Our hours are..."
    /\bhours (are|of operation)\b/i,                                      // "Hours of operation"
    /\bopen (from|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, // "Open Monday..."
    /\bmonday (through|to) (friday|saturday|sunday)\b/i,                  // "Monday through Friday"
  ],

  'initiating_transfer': [/\b(transfer|connect|live agent|specialist|hold)\b/i],
  'handling_error': [/\b(sorry|apologize|trouble|try again)\b/i],
  'asking_clarification': [/\b(didn't catch|repeat|could you say|pardon)\b/i],

  'unknown': [],
};

/**
 * Priority order for intent detection - terminal/important intents checked first
 * This prevents less specific patterns from matching before terminal intents
 */
const INTENT_PRIORITY_ORDER: AgentIntent[] = [
  // Terminal intents - check these FIRST (most important)
  'confirming_booking',
  'saying_goodbye',
  'initiating_transfer',

  // Post-booking info - check BEFORE booking flow to catch address/parking responses
  'providing_address',
  'providing_parking_info',
  'providing_hours_info',
  'offering_address',

  // Booking flow - check searching BEFORE offering
  'searching_availability',
  'offering_time_slots',

  // Specific questions - check BEFORE confirmations to avoid misclassification
  // IMPORTANT: More specific intents must come BEFORE less specific ones
  // special_needs before insurance (bot often confirms insurance then asks about special needs)
  'asking_special_needs',    // "special needs/conditions" - check FIRST (often combined with insurance confirmation)
  'asking_insurance',        // "what kind of insurance" - more specific patterns now
  'asking_time_preference',  // "prefer morning/afternoon" - specific
  'asking_location_preference', // "which location/office" - specific

  // Parent DOB - check BEFORE child DOB to distinguish "your DOB" from "child's DOB"
  'asking_parent_dob',   // "May I have your date of birth?" - parent's own DOB

  // Child questions - must come before phone but after insurance/preferences
  'asking_child_count',  // "how many children" - specific pattern
  'asking_child_dob',    // "child's date of birth" - requires child qualifier
  'asking_child_age',
  'asking_child_name',
  'asking_spell_name',
  'asking_phone',  // Phone confirmation from caller ID should map here
  'asking_email',
  'asking_parent_name',

  // Patient status - check BEFORE confirmations to avoid "Thank you" prefix matching
  'asking_new_patient',
  'asking_previous_ortho',
  'asking_previous_visit',

  // Specific confirmations - check AFTER patient status questions
  'asking_proceed_confirmation',
  'reminding_bring_card',  // "bring your insurance card" - after out-of-network disclosure
  'confirming_spelling',
  'confirming_information',

  // Error handling
  'handling_error',
  'asking_clarification',

  // Generic
  'greeting',
];

/**
 * Simple keyword-based intent detection (fallback when LLM unavailable)
 * Uses priority ordering to check terminal intents first
 */
export function detectIntentByKeywords(response: string): AgentIntent {
  // Check intents in priority order
  for (const intent of INTENT_PRIORITY_ORDER) {
    const patterns = INTENT_KEYWORDS[intent];
    if (!patterns || patterns.length === 0) continue;

    for (const pattern of patterns) {
      if (pattern.test(response)) {
        return intent;
      }
    }
  }
  return 'unknown';
}

/**
 * Response Formatter Service
 *
 * Formats responses based on persona traits (verbosity, etc.)
 * Provides natural variation using response pools.
 */

import type { ResponseCategory, ConfirmationSubject } from '../schemas/response-category-schemas';
import type { PersonaTraits } from '../tests/types/persona';

// =============================================================================
// Response Variation Pools
// =============================================================================

/**
 * Prefixes for different categories - adds natural variation
 */
const CATEGORY_PREFIXES: Record<ResponseCategory, Record<PersonaTraits['verbosity'], string[]>> = {
  provide_data: {
    terse: [''],
    normal: ['Sure,', "It's", 'Yes,', 'That would be'],
    verbose: ["Yes, of course!", "Sure thing!", "Happy to help,", "Absolutely,"],
  },
  confirm_or_deny: {
    terse: ['Yes', 'No', 'Correct', 'Right'],
    normal: ["Yes, that's correct", "That's right", 'Correct', "Yes, exactly"],
    verbose: ["Yes, that's absolutely correct!", "That's exactly right!", "Yes, you've got it!"],
  },
  select_from_options: {
    terse: [''],
    normal: ["I'll take", "Let's go with", 'Yes,', "That works,"],
    verbose: ["That sounds perfect!", "I'd love that time!", "Yes, let's do"],
  },
  acknowledge: {
    terse: ['Thanks', 'Got it', 'OK'],
    normal: ['Great, thank you', 'Perfect, thanks', 'Got it, thanks'],
    verbose: ['That sounds wonderful!', 'Perfect, thank you so much!', "Great, I really appreciate it!"],
  },
  clarify_request: {
    terse: ['What?', 'Sorry?', 'Repeat?'],
    normal: ['Sorry, could you repeat that?', "I didn't quite catch that", 'Could you clarify?'],
    verbose: ["I'm so sorry, I didn't quite understand. Could you please repeat that?"],
  },
  express_preference: {
    terse: [''],
    normal: ['I prefer', "We'd like", 'Ideally,'],
    verbose: ['If possible, we would really prefer', "We'd love if we could have"],
  },
};

/**
 * Suffixes for adding politeness/natural endings
 */
const POLITENESS_SUFFIXES: Record<PersonaTraits['verbosity'], string[]> = {
  terse: [''],
  normal: ['', 'please', 'if possible'],
  verbose: ['if that works for you', 'please and thank you', 'we really appreciate it'],
};

/**
 * Confirmation responses
 */
const CONFIRMATION_RESPONSES: Record<ConfirmationSubject, Record<'yes' | 'no', Record<PersonaTraits['verbosity'], string[]>>> = {
  information_correct: {
    yes: {
      terse: ['Yes', 'Correct'],
      normal: ["Yes, that's correct", "That's right"],
      verbose: ["Yes, that's exactly right!", "Correct, you've got all the information right!"],
    },
    no: {
      terse: ['No', 'Actually...'],
      normal: ["Actually, let me correct that", "Not quite, it should be"],
      verbose: ["Oh, I'm sorry but that's not quite right. Let me clarify..."],
    },
  },
  proceed_anyway: {
    yes: {
      terse: ['Yes', 'OK', 'Proceed'],
      normal: ['Yes, please proceed', "That's fine, go ahead"],
      verbose: ["Yes, please go ahead anyway. We'll figure it out!"],
    },
    no: {
      terse: ['No', 'Cancel'],
      normal: ["No, let's not proceed", "Actually, I'd like to reconsider"],
      verbose: ["Hmm, actually I think I'd rather not proceed with that. Let me think about it."],
    },
  },
  booking_details: {
    yes: {
      terse: ['Yes', 'Confirmed'],
      normal: ["Yes, that's all correct", 'Perfect, confirmed'],
      verbose: ["Yes, all of those details are perfect! Thank you so much!"],
    },
    no: {
      terse: ['Wait', 'Actually...'],
      normal: ["Actually, there's a small issue", 'Wait, let me check'],
      verbose: ["Hold on, I think there might be a small mix-up. Let me clarify..."],
    },
  },
  wants_address: {
    yes: {
      terse: ['Yes'],
      normal: ['Yes, please', 'Yes, that would be helpful'],
      verbose: ["Yes please! I'd really appreciate having the address."],
    },
    no: {
      terse: ['No', "I'm fine"],
      normal: ["No thanks, I know where it is", "I'm good, thanks"],
      verbose: ["No thank you, I'm already familiar with the location!"],
    },
  },
  wants_parking_info: {
    yes: {
      terse: ['Yes'],
      normal: ['Yes, please', 'That would be helpful'],
      verbose: ["Yes please! Parking info would be really helpful."],
    },
    no: {
      terse: ['No', "I'm fine"],
      normal: ["No thanks, I'll figure it out", "I'm okay"],
      verbose: ["No thank you, I'm sure I'll find parking just fine!"],
    },
  },
  spelling_correct: {
    yes: {
      terse: ['Yes', 'Correct'],
      normal: ["Yes, that's the correct spelling", 'Correct'],
      verbose: ["Yes, you've spelled it perfectly!"],
    },
    no: {
      terse: ['No', 'Actually...'],
      normal: ["Actually, let me spell it again", "Not quite, it's spelled"],
      verbose: ["Oh no, I think there was a small mistake. Let me spell it out more clearly..."],
    },
  },
  insurance_card_reminder: {
    yes: {
      terse: ['OK', 'Will do'],
      normal: ["Okay, I'll bring the insurance card", 'Will do, thanks'],
      verbose: ["Absolutely! I'll make sure to bring the insurance card with us."],
    },
    no: {
      terse: ['OK'],
      normal: ['Understood'],
      verbose: ["Got it, thank you for the reminder!"],
    },
  },
  general: {
    yes: {
      terse: ['Yes', 'OK'],
      // Removed "That's fine" - too ambiguous, can be interpreted as declining
      normal: ['Yes please', 'Yes, thank you', 'Sure, please do'],
      verbose: ["Yes, that sounds great! Please do.", "Yes please, that would be wonderful!"],
    },
    no: {
      terse: ['No'],
      normal: ['Actually, no', "I don't think so"],
      verbose: ["Hmm, I'm not so sure about that..."],
    },
  },
};

/**
 * Acknowledgment responses for different info types
 */
const ACKNOWLEDGMENT_RESPONSES: Record<string, Record<PersonaTraits['verbosity'], string[]>> = {
  booking_confirmation: {
    terse: ['Thanks', 'Great'],
    normal: ['Great, thank you!', 'Perfect, thanks so much'],
    verbose: ["Wonderful! Thank you so much for scheduling that for us!"],
  },
  address: {
    terse: ['Got it', 'Thanks'],
    normal: ['Thank you, I got the address', 'Perfect, thanks'],
    verbose: ["Great, I've written that down. Thank you so much!"],
  },
  parking_info: {
    terse: ['Thanks', 'OK'],
    normal: ['Perfect, thanks for the parking info', 'Got it, thanks'],
    verbose: ["That's really helpful, thank you so much for the parking information!"],
  },
  searching: {
    terse: ['OK'],
    normal: ['Okay, thank you', 'Sure, take your time'],
    verbose: ["No problem, take your time! I appreciate you checking for us."],
  },
  general: {
    terse: ['OK', 'Thanks'],
    normal: ['Thank you', 'Got it', 'Perfect'],
    verbose: ["Thank you so much!", "That's great, I appreciate it!"],
  },
};

// =============================================================================
// Response Formatter Class
// =============================================================================

export class ResponseFormatter {
  private traits: PersonaTraits;

  constructor(traits: PersonaTraits) {
    this.traits = traits;
  }

  /**
   * Format data provision response
   */
  formatDataResponse(data: string | string[]): string {
    const dataStr = Array.isArray(data) ? data.join(', ') : data;
    const prefix = this.pickRandom(CATEGORY_PREFIXES.provide_data[this.traits.verbosity]);
    return this.combine(prefix, dataStr);
  }

  /**
   * Format confirmation response
   */
  formatConfirmation(
    subject: ConfirmationSubject,
    answer: 'yes' | 'no'
  ): string {
    const responses = CONFIRMATION_RESPONSES[subject]?.[answer]?.[this.traits.verbosity]
      || CONFIRMATION_RESPONSES.general[answer][this.traits.verbosity];
    return this.pickRandom(responses);
  }

  /**
   * Format option selection response
   */
  formatSelection(selectedOption: string): string {
    const prefix = this.pickRandom(CATEGORY_PREFIXES.select_from_options[this.traits.verbosity]);
    return this.combine(prefix, selectedOption);
  }

  /**
   * Format acknowledgment response
   */
  formatAcknowledgment(infoType?: string): string {
    const type = infoType || 'general';
    const responses = ACKNOWLEDGMENT_RESPONSES[type]?.[this.traits.verbosity]
      || ACKNOWLEDGMENT_RESPONSES.general[this.traits.verbosity];
    return this.pickRandom(responses);
  }

  /**
   * Format clarification request
   */
  formatClarificationRequest(): string {
    return this.pickRandom(CATEGORY_PREFIXES.clarify_request[this.traits.verbosity]);
  }

  /**
   * Format preference expression
   */
  formatPreference(preference: string): string {
    const prefix = this.pickRandom(CATEGORY_PREFIXES.express_preference[this.traits.verbosity]);
    return this.combine(prefix, preference);
  }

  /**
   * Format terminal goodbye
   */
  formatGoodbye(): string {
    const goodbyes: Record<PersonaTraits['verbosity'], string[]> = {
      terse: ['Bye', 'Thanks, bye'],
      normal: ['Thank you, goodbye!', 'Thanks so much, bye!'],
      verbose: ["Thank you so much for all your help! Have a wonderful day!"],
    };
    return this.pickRandom(goodbyes[this.traits.verbosity]);
  }

  /**
   * Add extra info based on persona traits
   */
  addExtraInfo(baseResponse: string, extraInfo?: string): string {
    if (!extraInfo || !this.traits.providesExtraInfo) {
      return baseResponse;
    }

    if (this.traits.verbosity === 'terse') {
      return baseResponse; // Terse personas don't add extra info
    }

    return `${baseResponse} ${extraInfo}`;
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  private pickRandom<T>(items: T[]): T {
    if (!items || items.length === 0) {
      return '' as unknown as T;
    }
    return items[Math.floor(Math.random() * items.length)];
  }

  private combine(prefix: string, content: string): string {
    if (!prefix || prefix.trim() === '') {
      return content;
    }
    // Avoid double spacing
    return `${prefix.trim()} ${content.trim()}`.trim();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

export function createFormatter(traits: PersonaTraits): ResponseFormatter {
  return new ResponseFormatter(traits);
}

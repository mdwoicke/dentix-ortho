/**
 * Response Category Schemas for Dynamic User Response Generation
 *
 * Instead of 60+ specific intents, these schemas classify WHAT TYPE of response
 * is needed. This reduces maintenance burden and enables semantic understanding.
 */

import { z } from 'zod';

// =============================================================================
// Response Categories
// =============================================================================

/**
 * High-level response categories - what TYPE of response is needed
 */
export const ResponseCategorySchema = z.enum([
  'provide_data',        // Agent asking for specific data (name, phone, DOB)
  'confirm_or_deny',     // Agent asking yes/no or confirmation question
  'select_from_options', // Agent offering choices (time slots, locations)
  'acknowledge',         // Agent provided info (just acknowledge receipt)
  'clarify_request',     // Agent asked something unclear or ambiguous
  'express_preference',  // Agent asking open-ended preference question
]);

export type ResponseCategory = z.infer<typeof ResponseCategorySchema>;

// =============================================================================
// Data Field Categories
// =============================================================================

/**
 * Normalized data field types for extraction
 * Maps to persona DataInventory fields
 */
export const DataFieldCategorySchema = z.enum([
  // Identity fields (parent/caller)
  'caller_name',
  'caller_name_spelling',
  'caller_phone',
  'caller_email',
  'parent_dob',  // Parent's own date of birth (not child's)

  // Child fields
  'child_count',
  'child_name',
  'child_name_spelling',  // Spelling of child's name (distinct from caller_name_spelling)
  'child_dob',
  'child_age',

  // History fields
  'new_patient_status',
  'previous_visit',
  'previous_ortho_treatment',

  // Insurance & needs
  'insurance_info',
  'insurance_member_id',  // Member ID and group number
  'special_needs',
  'medical_conditions',  // "Does [patient] have any medical conditions?"
  'card_reminder', // Agent reminded to bring insurance card

  // Preference fields
  'time_preference',
  'location_preference',
  'day_preference',

  // Meta fields
  'other',
  'unknown',
]);

export type DataFieldCategory = z.infer<typeof DataFieldCategorySchema>;

// =============================================================================
// Confirmation Context
// =============================================================================

/**
 * What is being confirmed in a confirm_or_deny question
 */
export const ConfirmationSubjectSchema = z.enum([
  'information_correct',    // "Is that correct?"
  'phone_number_correct',   // "Is [number] the best number?" - phone confirmation
  'proceed_anyway',         // "Would you like to proceed anyway?"
  'booking_details',        // "Confirming your appointment for..."
  'wants_address',          // "Would you like the address?"
  'wants_parking_info',     // "Would you like parking information?"
  'spelling_correct',       // "Is the spelling correct?"
  'insurance_card_reminder', // "Please bring your insurance card"
  'previous_visit',         // "Has [patient] been seen before?"
  'previous_treatment',     // "Has [patient] had orthodontic treatment before?"
  'has_insurance',          // "Do you have dental/orthodontic insurance?"
  'wants_time_slot',        // "Does [time] work for you?"
  'ready_to_book',          // "Would you like me to book this?"
  'medical_conditions',     // "Does [patient] have any medical conditions?"
  'special_needs',          // "Does [patient] have any special needs?"
  'general',                // Generic confirmation
]);

export type ConfirmationSubject = z.infer<typeof ConfirmationSubjectSchema>;

// =============================================================================
// Terminal State Indicators
// =============================================================================

/**
 * Indicates conversation should end
 */
export const TerminalStateSchema = z.enum([
  'booking_confirmed',
  'transfer_initiated',
  'conversation_ended',
  'error_terminal',
  'none',
]);

export type TerminalState = z.infer<typeof TerminalStateSchema>;

// =============================================================================
// Category Classification Result
// =============================================================================

/**
 * Complete result of category-based classification
 */
export const CategoryClassificationResultSchema = z.object({
  // Primary classification
  category: ResponseCategorySchema,
  confidence: z.number().min(0).max(1),

  // For provide_data: what data is being requested (can be multiple)
  dataFields: z.array(DataFieldCategorySchema).optional(),

  // For confirm_or_deny: what is being confirmed
  confirmationSubject: ConfirmationSubjectSchema.optional(),
  expectedAnswer: z.enum(['yes', 'no', 'either']).optional(),

  // For select_from_options: the options presented
  options: z.array(z.string()).optional(),

  // For acknowledge: what was provided
  infoProvided: z.string().optional(),

  // Terminal state detection
  terminalState: TerminalStateSchema.default('none'),

  // Flow indicators
  bookingMentioned: z.boolean().default(false),
  transferMentioned: z.boolean().default(false),

  // Persistent flags - survive follow-up question overrides
  bookingConfirmedThisTurn: z.boolean().default(false),

  // Debugging
  reasoning: z.string().optional(),
  matchedPattern: z.string().optional(),
});

export type CategoryClassificationResult = z.infer<typeof CategoryClassificationResultSchema>;

// =============================================================================
// Response Context
// =============================================================================

/**
 * Context needed for response generation
 */
export const ResponseContextSchema = z.object({
  // Current child being discussed (for multi-child scenarios)
  currentChildIndex: z.number().default(0),

  // Fields already provided in this conversation
  providedFields: z.array(DataFieldCategorySchema).default([]),

  // Last few turns for context
  recentHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })).default([]),

  // Conversation turn number
  turnNumber: z.number().default(0),
});

export type ResponseContext = z.infer<typeof ResponseContextSchema>;

// =============================================================================
// Pattern Rule Definition
// =============================================================================

/**
 * Definition of a pattern-based classification rule
 */
export const PatternRuleSchema = z.object({
  category: ResponseCategorySchema,
  patterns: z.array(z.string()), // RegExp patterns as strings
  baseConfidence: z.number().min(0).max(1),
  priority: z.number().default(0), // Higher = checked first
});

export type PatternRule = z.infer<typeof PatternRuleSchema>;

// =============================================================================
// LLM Classification Request/Response
// =============================================================================

/**
 * Request format for LLM-based classification
 */
export const LLMClassificationRequestSchema = z.object({
  agentMessage: z.string(),
  recentHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string(),
  })),
  pendingFields: z.array(DataFieldCategorySchema),
  personaContext: z.object({
    hasInsurance: z.boolean(),
    childCount: z.number(),
    currentChildIndex: z.number(),
  }),
});

export type LLMClassificationRequest = z.infer<typeof LLMClassificationRequestSchema>;

// =============================================================================
// Field Category to Legacy Intent Mapping (Backwards Compatibility)
// =============================================================================

/**
 * Maps new DataFieldCategory to legacy AgentIntent for ProgressTracker compatibility
 */
export const FIELD_TO_LEGACY_INTENT: Record<DataFieldCategory, string> = {
  'caller_name': 'asking_parent_name',
  'caller_name_spelling': 'asking_spell_name',
  'caller_phone': 'asking_phone',
  'caller_email': 'asking_email',
  'parent_dob': 'asking_parent_dob',
  'child_count': 'asking_child_count',
  'child_name': 'asking_child_name',
  'child_name_spelling': 'asking_spell_child_name',
  'child_dob': 'asking_child_dob',
  'child_age': 'asking_child_age',
  'new_patient_status': 'asking_new_patient',
  'previous_visit': 'asking_previous_visit',
  'previous_ortho_treatment': 'asking_previous_ortho',
  'insurance_info': 'asking_insurance',
  'insurance_member_id': 'asking_insurance_member_id',
  'special_needs': 'asking_special_needs',
  'medical_conditions': 'asking_medical_conditions',
  'card_reminder': 'reminding_bring_card',
  'time_preference': 'asking_time_preference',
  'location_preference': 'asking_location_preference',
  'day_preference': 'asking_time_preference',
  'other': 'unknown',
  'unknown': 'unknown',
};

/**
 * Maps category + context to legacy intent
 */
export const CATEGORY_TO_LEGACY_INTENT: Record<ResponseCategory, string> = {
  'provide_data': 'unknown', // Overridden by dataFields
  'confirm_or_deny': 'confirming_information',
  'select_from_options': 'offering_time_slots',
  'acknowledge': 'confirming_booking',
  'clarify_request': 'asking_clarification',
  'express_preference': 'asking_time_preference',
};

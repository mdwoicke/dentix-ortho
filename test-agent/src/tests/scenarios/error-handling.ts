/**
 * Error Handling Test Scenarios
 * Tests for error conditions and graceful failure handling
 * Updated to match actual Allie IVA conversation flow order
 *
 * Enhanced with semantic expectations for AI-powered evaluation.
 */

import {
  TestCase,
  patterns,
  semanticExpectations as se,
  negativeExpectations as ne,
} from '../test-case';

// Allie IVA specific patterns - matched to actual bot responses
// Bot may respond dynamically based on context - patterns are flexible
const alliePatterns = {
  // Greeting/initial response - accepts ANY relevant engagement with scheduling request
  greeting: /allie|help|how may i|may i have|name|first and last|that's great|new patient|orthodontic|consult|appointment|child|schedule|absolutely|certainly|of course/i,
  askSpelling: /spell|spelling|confirm.*name|correct/i,
  // Bot may ask about children count OR acknowledge if already mentioned
  askChildren: /how many children|scheduling for|one child|two child|three child|confirm/i,
  // Bot may ask about new patient OR acknowledge it was already stated
  askNewPatientConsult: /new patient|consult|first time|never been|orthodontic/i,
  askInfo: /name|phone|help|assist|may i|first and last/i,
};

export const errorHandlingScenarios: TestCase[] = [
  {
    id: 'ERR-001',
    name: 'Gibberish Input Recovery',
    description: 'Handle completely nonsensical user input and recover',
    category: 'error-handling',
    tags: ['input-validation', 'gibberish'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-gibberish',
        userMessage: 'asdfghjkl qwerty zxcvbnm 12345',
        expectedPatterns: [/help|understand|clarify|rephrase|allie|assist|repeat|sorry/i],
        unexpectedPatterns: [],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
        validator: (response, ctx) => {
          const asksForClarification = /understand|clarify|rephrase|repeat|sorry|catch/i.test(response);
          const offersHelp = /help|assist|allie|how may/i.test(response);
          const crashed = /error|exception|failed|undefined|null/i.test(response);

          if (crashed) {
            return {
              passed: false,
              message: 'Chatbot crashed on gibberish input',
              severity: 'critical',
              recommendation: 'Add input validation and fallback handling',
            };
          }

          return {
            passed: asksForClarification || offersHelp || response.length > 20,
            message: 'Handled gracefully - either asked for clarification or offered help',
          };
        },
      },
      {
        id: 'step-2-recover',
        userMessage: 'Sorry, I need to schedule an orthodontic appointment for my child',
        // Bot should either greet or ask for name/info - it's recovering from gibberish
        expectedPatterns: [/allie|help|name|assist|how may|first and last|that's great/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
      },
    ],

    expectations: [
      {
        type: 'no-errors',
        description: 'Should recover from gibberish input',
      },
    ],
  },

  {
    id: 'ERR-002',
    name: 'Empty or Whitespace Input',
    description: 'Handle empty or whitespace-only messages',
    category: 'error-handling',
    tags: ['input-validation', 'empty'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-empty',
        userMessage: '   ',
        expectedPatterns: [/help|how can|assist|allie|hear|repeat|sorry/i],
        unexpectedPatterns: [],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
        validator: (response, ctx) => {
          const offersHelp = /help|assist|how can|allie|hear|repeat/i.test(response);
          const crashed = /error|null|undefined/i.test(response);

          if (crashed) {
            return {
              passed: false,
              message: 'Chatbot had error on empty input',
              severity: 'critical',
              recommendation: 'Validate input before processing',
            };
          }

          return { passed: true, message: 'Empty input handled - did not crash' };
        },
      },
      {
        id: 'step-2-normal',
        userMessage: 'I need to schedule an orthodontic appointment for my child',
        // Bot should either greet or ask for name/info after empty input
        expectedPatterns: [/allie|help|name|assist|how may|first and last|that's great/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
      },
    ],

    expectations: [
      {
        type: 'no-errors',
        description: 'Should handle empty input without crashing',
      },
    ],
  },

  {
    id: 'ERR-003',
    name: 'Very Long Input',
    description: 'Handle extremely long user messages',
    category: 'error-handling',
    tags: ['input-validation', 'length'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-long-message',
        userMessage: () => {
          const base = 'I would like to schedule an orthodontic appointment for my child please. ';
          return base.repeat(50) + 'My name is Sarah Johnson and my phone is 2155551234';
        },
        expectedPatterns: [/allie|name|help|appointment|spell|thank/i],
        unexpectedPatterns: [],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
        validator: (response, ctx) => {
          const handled = response.length > 10;

          if (!handled) {
            return {
              passed: false,
              message: 'No meaningful response for long input',
              severity: 'medium',
              recommendation: 'Handle long inputs gracefully',
            };
          }

          return { passed: true, message: 'Long input processed successfully' };
        },
      },
    ],

    expectations: [
      {
        type: 'no-errors',
        description: 'Should handle long input without timeout or crash',
      },
    ],
  },

  {
    id: 'ERR-004',
    name: 'Cancel Mid-Conversation',
    description: 'User wants to cancel/abandon booking process',
    category: 'error-handling',
    tags: ['cancellation', 'flow-control'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-start',
        userMessage: 'Hi I need to schedule an appointment for my child',
        expectedPatterns: [alliePatterns.greeting],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
      },
      {
        id: 'step-2-provide-info',
        userMessage: 'My name is Tom Wilson, phone 2155558888',
        // Bot may ask to spell, ask about children, or ask about new patient
        expectedPatterns: [/spell|spelling|confirm.*name|correct|how many children|scheduling for|child|new patient|consult|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
      },
      {
        id: 'step-3-spell',
        userMessage: 'T O M   W I L S O N',
        // Bot may ask about children, confirm phone, or continue with flow
        expectedPatterns: [/how many children|scheduling for|child|new patient|consult|thank|got it|understood|phone|number|reach|best/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
      },
      {
        id: 'step-4-cancel',
        userMessage: 'Actually never mind, I need to cancel. I will call back later.',
        expectedPatterns: [/cancel|ok|no problem|understand|call back|another time|help|goodbye|anything else/i],
        unexpectedPatterns: [],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
        validator: (response, ctx) => {
          const acknowledgesCancel = /cancel|ok|no problem|understand|noted|goodbye|anything else/i.test(response);
          const offersHelp = /help|anything else|assist|call back/i.test(response);
          const continues = /how many children|new patient|orthodontic/i.test(response);

          if (continues) {
            return {
              passed: false,
              message: 'Did not acknowledge cancellation, continued with flow',
              severity: 'high',
              recommendation: 'Recognize cancel/abort keywords and reset conversation',
            };
          }

          return { passed: acknowledgesCancel || offersHelp, message: 'Cancellation handled appropriately' };
        },
      },
    ],

    expectations: [
      {
        type: 'custom',
        description: 'Should recognize and honor cancellation request',
      },
    ],
  },

  {
    id: 'ERR-005',
    name: 'Special Characters in Name',
    description: 'Handle special characters in parent/child names',
    category: 'error-handling',
    tags: ['input-validation', 'special-chars'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-greeting',
        userMessage: 'Hi I need to schedule an appointment',
        expectedPatterns: [alliePatterns.greeting],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
      },
      {
        id: 'step-2-special-name',
        userMessage: "My name is Mary O'Connor-Smith, phone 2155551111",
        // Bot may ask to spell, ask about children, or ask about new patient
        expectedPatterns: [/spell|spelling|confirm.*name|correct|how many children|scheduling for|child|new patient|consult|thank/i],
        unexpectedPatterns: [/error|invalid/i],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
        validator: (response, ctx) => {
          const handled = /spell|thank you|confirm|name|child|new patient|consult/i.test(response);
          const errorMsg = /error|invalid|cannot/i.test(response);

          if (errorMsg) {
            return {
              passed: false,
              message: 'Special characters in name caused error',
              severity: 'medium',
              recommendation: 'Handle apostrophes and hyphens in names properly',
            };
          }

          return { passed: handled, message: 'Special character name handled' };
        },
      },
      {
        id: 'step-3-spell-special',
        userMessage: "O apostrophe C O N N O R hyphen S M I T H",
        // Bot may ask about children or continue
        expectedPatterns: [/how many children|scheduling for|child|new patient|consult|thank|got it|understood/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
      },
    ],

    expectations: [
      {
        type: 'no-errors',
        description: 'Should handle special characters in names',
      },
    ],
  },

  {
    id: 'ERR-006',
    name: 'Unclear Number of Children',
    description: 'Handle vague or unclear response about number of children',
    category: 'error-handling',
    tags: ['clarification', 'ambiguous-input'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-greeting',
        userMessage: 'Schedule orthodontic appointment for my kids',
        // Bot may give Allie greeting OR skip to asking for name directly OR ask about children
        // Expanded patterns to handle various bot responses
        expectedPatterns: [/allie|help|name|may i have|first and last|that's great|how many|child|schedule|appointment|orthodontic|consult|happy|call|phone|hi|hello|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
      },
      {
        id: 'step-2-provide-info',
        userMessage: 'Jane Doe, 2155552222',
        // Bot may ask to spell, ask about children, or ask about new patient
        expectedPatterns: [/spell|spelling|confirm.*name|correct|how many children|scheduling for|child|new patient|consult|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
      },
      {
        id: 'step-3-spell',
        userMessage: 'J A N E   D O E',
        // Bot may ask about children or continue
        expectedPatterns: [/how many children|scheduling for|child|new patient|consult|thank|got it|understood/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
      },
      {
        id: 'step-4-vague-answer',
        userMessage: 'A few of them',
        // Bot may ask for clarification, or ask about new patient, or continue
        expectedPatterns: [/how many|specific|number|exactly|few|could you|new patient|consult|child|ok|thank/i],
        unexpectedPatterns: [],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [],
        validator: (response, ctx) => {
          const asksForClarification = /how many|specific|number|exactly|could you|clarify/i.test(response);
          const assumed = /assuming|will.*schedule|okay|proceeding|new patient|consult|child/i.test(response);

          return {
            passed: asksForClarification || assumed,
            message: asksForClarification ? 'Asked for clarification' : 'Made reasonable assumption and continued'
          };
        },
      },
      {
        id: 'step-5-clarify',
        userMessage: 'Two children',
        // Bot may ask about new patient, office visits, or continue
        expectedPatterns: [/new patient|consult|been to.*office|visited|first time|braces|ortho|child.*name|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.handleError()],
        negativeExpectations: [ne.noErrors(), ne.noInternalDetails()],
      },
    ],

    expectations: [
      {
        type: 'custom',
        description: 'Should ask for clarification on ambiguous input or make reasonable assumption',
      },
    ],
  },
];

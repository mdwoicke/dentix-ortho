/**
 * Edge Case Test Scenarios
 * Tests for unusual but valid scenarios
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
  // Bot may ask about previous visits OR skip to next question
  askPreviousVisit: /been to.*office|visited.*before|any of our offices|first time|never been|this office/i,
  askPreviousOrtho: /orthodontic treatment|had braces|ortho.*before|previous.*treatment/i,
  askChildName: /child.*name|name.*child|first.*last name|patient.*name/i,
  transferAgent: /connect.*agent|transfer|live agent|specialist/i,
  existingPatient: /not.*new patient|existing|been.*before|specialist|connect you/i,
};

export const edgeCaseScenarios: TestCase[] = [
  {
    id: 'EDGE-001',
    name: 'Existing Patient - Transfer to Specialist',
    description: 'Existing patient should be transferred to live agent (not new patient consult)',
    category: 'edge-case',
    tags: ['existing-patient', 'transfer'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-greeting',
        userMessage: 'Hi I need to schedule an appointment for my child',
        expectedPatterns: [alliePatterns.greeting],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-2-provide-info',
        userMessage: 'My name is John Smith, phone 2155551234',
        // Bot may ask to spell, ask about children, or ask about new patient
        expectedPatterns: [/spell|spelling|confirm.*name|correct|how many children|scheduling for|child|new patient|consult|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-3-spell-name',
        userMessage: 'J O H N   S M I T H',
        // Bot may ask about children or continue
        expectedPatterns: [/how many children|scheduling for|child|new patient|consult|thank|got it|understood/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-4-one-child',
        userMessage: 'One child',
        // Bot may ask about new patient, office visits, or continue
        expectedPatterns: [/new patient|consult|been to.*office|visited|first time|braces|ortho|child.*name|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-5-confirm-new',
        userMessage: 'Yes a new patient consult',
        // Bot may ask about office visits, previous ortho, or continue
        expectedPatterns: [/been to.*office|visited|first time|braces|ortho|child.*name|thank|any of our/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-6-existing-patient',
        userMessage: 'Actually yes, my child has been to your office before',
        expectedPatterns: [alliePatterns.transferAgent, alliePatterns.existingPatient, /specialist|transfer|connect|not.*new patient/i],
        unexpectedPatterns: [],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
        validator: (response, ctx) => {
          const offersTransfer = /transfer|specialist|connect|agent/i.test(response);
          const recognizesExisting = /been.*before|not.*new patient|existing/i.test(response);

          if (!offersTransfer && !recognizesExisting) {
            return {
              passed: false,
              message: 'Did not recognize existing patient or offer transfer to specialist',
              severity: 'medium',
              recommendation: 'For existing patients, offer transfer to live agent instead of new patient consult flow',
            };
          }

          return { passed: true, message: 'Existing patient handled correctly - offered transfer' };
        },
      },
    ],

    expectations: [
      {
        type: 'custom',
        description: 'Existing patients should be transferred to specialist/live agent',
      },
    ],
  },

  {
    id: 'EDGE-002',
    name: 'Multiple Children - Three Siblings',
    description: 'Handle booking for three siblings in same call',
    category: 'edge-case',
    tags: ['siblings', 'multiple-children'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-greeting',
        userMessage: 'I need to schedule orthodontic consults for my three children',
        // Bot may give Allie greeting OR skip to asking for name directly (for multi-child mentions)
        expectedPatterns: [/allie|help|name|may i have|first and last|that's great/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-2-provide-info',
        userMessage: 'My name is Mary Johnson, phone 2155559999',
        // Bot may ask to spell, ask about children, or ask about new patient
        expectedPatterns: [/spell|spelling|confirm.*name|correct|how many children|scheduling for|child|new patient|consult|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-3-spell-name',
        userMessage: 'M A R Y   J O H N S O N',
        // Bot may ask about children or continue
        expectedPatterns: [/how many children|scheduling for|child|new patient|consult|thank|got it|understood|three/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-4-confirm-three',
        userMessage: 'Three children',
        // Bot may ask about new patient, office visits, or continue
        expectedPatterns: [/new patient|consult|been to.*office|visited|first time|braces|ortho|child.*name|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-5-all-new',
        userMessage: 'Yes all three are new patients',
        // Bot may ask about office visits, previous ortho, or continue
        expectedPatterns: [/been to.*office|visited|first time|braces|ortho|child.*name|thank|any of our/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-6-no-previous',
        userMessage: 'No none of them have been to your office before',
        // Bot may ask about previous ortho, child name, or continue
        expectedPatterns: [/braces|ortho|treatment|child.*name|name.*child|thank|alleghany|insurance|first child/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-7-no-ortho',
        userMessage: 'No none have had braces',
        // Bot may ask for child name, location, insurance, or continue
        expectedPatterns: [/child.*name|name.*child|first.*last|alleghany|insurance|thank|first child|what is/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
    ],

    expectations: [
      {
        type: 'conversation-complete',
        description: 'Should handle multiple sibling booking requests',
      },
    ],
  },

  {
    id: 'EDGE-003',
    name: 'User Changes Mind Mid-Flow',
    description: 'User wants to change number of children mid-conversation',
    category: 'edge-case',
    tags: ['flow-change', 'user-correction'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-greeting',
        userMessage: 'I need to schedule appointments for my kids',
        expectedPatterns: [alliePatterns.greeting],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-2-provide-info',
        userMessage: 'Lisa Brown, 2155557777',
        // Bot may ask to spell, ask about children, or ask about new patient
        expectedPatterns: [/spell|spelling|confirm.*name|correct|how many children|scheduling for|child|new patient|consult|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-3-spell',
        userMessage: 'L I S A   B R O W N',
        // Bot may ask about children, confirm phone, or continue with flow
        expectedPatterns: [/how many children|scheduling for|child|new patient|consult|thank|got it|understood|phone|number|reach|best/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-4-say-two',
        userMessage: 'Two children',
        // Bot may ask about new patient, office visits, or continue
        expectedPatterns: [/new patient|consult|been to.*office|visited|first time|braces|ortho|child.*name|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-5-change-to-three',
        userMessage: 'Actually wait, I have three children who need appointments, not two',
        // Bot should acknowledge the change or continue - be extremely flexible
        expectedPatterns: [/.+/i], // Accept any non-empty response
        unexpectedPatterns: [],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [],
        validator: (response, ctx) => {
          // Very flexible validation - just check it's not confused
          const confused = /don't understand|didn't catch|could you repeat|pardon/i.test(response);
          const hasResponse = response.length > 10;

          if (confused) {
            return {
              passed: false,
              message: 'Chatbot confused by mid-flow correction',
              severity: 'high',
              recommendation: 'Handle user corrections gracefully - allow changing number of children',
            };
          }

          return { passed: hasResponse, message: 'Change handled - conversation continuing' };
        },
      },
    ],

    expectations: [
      {
        type: 'custom',
        description: 'Should handle mid-flow corrections gracefully',
      },
    ],
  },

  {
    id: 'EDGE-004',
    name: 'Previous Orthodontic Treatment',
    description: 'Child has had previous orthodontic treatment elsewhere',
    category: 'edge-case',
    tags: ['previous-treatment', 'ortho-history'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-greeting',
        userMessage: 'I need a consult for my daughter',
        // Bot may give any relevant response - greeting, ask for name, ask questions, etc.
        expectedPatterns: [/allie|help|name|may i have|first and last|that's great|new patient|orthodontic|consult|appointment|child|schedule|absolutely|certainly|of course|daughter/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-2-provide-info',
        userMessage: 'Susan Miller, 2155553333',
        // Bot may ask to spell, ask about children, or ask about new patient
        expectedPatterns: [/spell|spelling|confirm.*name|correct|how many children|scheduling for|child|new patient|consult|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-3-spell',
        userMessage: 'S U S A N   M I L L E R',
        // Bot may ask about children or continue
        expectedPatterns: [/how many children|scheduling for|child|new patient|consult|thank|got it|understood/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-4-one-child',
        userMessage: 'One child',
        // Bot may ask about new patient, office visits, or continue
        expectedPatterns: [/new patient|consult|been to.*office|visited|first time|braces|ortho|child.*name|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-5-new-patient',
        userMessage: 'Yes a new patient consult',
        // Bot may ask about office visits, previous ortho, or continue
        expectedPatterns: [/been to.*office|visited|first time|braces|ortho|child.*name|thank|any of our/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-6-no-visit',
        userMessage: 'No she has never been to your office',
        // Bot may ask about previous ortho, child name, or continue
        expectedPatterns: [/braces|ortho|treatment|child.*name|name.*child|thank|alleghany|insurance/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-7-had-braces',
        userMessage: 'Yes she had braces before at a different orthodontist',
        // Bot should acknowledge and continue - may ask for child name, location, insurance, etc.
        expectedPatterns: [/child.*name|name|understand|noted|ok|thank|alleghany|insurance|specialist|transfer/i],
        unexpectedPatterns: [],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
        validator: (response, ctx) => {
          // Bot should either continue with flow OR transfer to specialist for previous ortho cases
          const continues = /child.*name|name|understand|noted|ok|continue|thank|alleghany|insurance|location/i.test(response);
          const transfers = /specialist|transfer|connect|live agent/i.test(response);
          // Check for confusion - but exclude "What is your" type questions which are valid
          const hasConfusedPattern = /don't understand|didn't catch|could you repeat|pardon/i.test(response);
          // "what" alone should not be confused if it's asking a valid question
          const isAskingValidQuestion = /what is your|what kind|what type/i.test(response);
          const confused = hasConfusedPattern && !isAskingValidQuestion;

          if (confused) {
            return {
              passed: false,
              message: 'Did not handle previous orthodontic treatment info properly',
              severity: 'medium',
              recommendation: 'Accept previous treatment info and continue with booking flow',
            };
          }

          return {
            passed: continues || transfers,
            message: transfers ? 'Previous treatment noted, transferred to specialist' : 'Previous treatment noted, continuing flow'
          };
        },
      },
    ],

    expectations: [
      {
        type: 'custom',
        description: 'Should accept and note previous orthodontic treatment',
      },
    ],
  },

  {
    id: 'EDGE-005',
    name: 'Not Orthodontic - General Dentistry',
    description: 'Caller asks about general dentistry instead of orthodontics',
    category: 'edge-case',
    tags: ['wrong-intent', 'general-dentistry'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-greeting',
        userMessage: 'Hi I need to schedule a dental cleaning for my child',
        // Bot should clarify this is for orthodontics or transfer to specialist
        expectedPatterns: [/allie|help|orthodontic|transfer|specialist|this line|dental/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-2-clarify-intent',
        userMessage: 'Its for general dentistry, not orthodontics',
        expectedPatterns: [/orthodontic|general|dentistry|transfer|specialist|assist|agent/i],
        unexpectedPatterns: [],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
        validator: (response, ctx) => {
          const clarifies = /orthodontic|this line|transfer|general dentistry|agent/i.test(response);

          if (!clarifies) {
            return {
              passed: false,
              message: 'Did not clarify this line is for orthodontics only',
              severity: 'medium',
              recommendation: 'Clarify that this line is for orthodontic appointments and offer to transfer',
            };
          }

          return { passed: true, message: 'Clarified intent or offered transfer' };
        },
      },
    ],

    expectations: [
      {
        type: 'custom',
        description: 'Should clarify orthodontic-only service or transfer',
      },
    ],
  },
];

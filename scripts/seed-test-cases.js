/**
 * Seed Test Cases Script
 * Creates all test cases from the existing TypeScript definitions via the API
 */

const API_BASE = 'http://localhost:3001/api/test-monitor';

async function createTestCase(testCase) {
  const response = await fetch(`${API_BASE}/test-cases`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testCase),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create ${testCase.caseId}: ${error}`);
  }

  return response.json();
}

// Happy Path Test Cases
const happyPathCases = [
  {
    caseId: 'HAPPY-001',
    name: 'New Patient Ortho Consult - Single Child',
    description: 'Complete new patient orthodontic consult booking for one child',
    category: 'happy-path',
    tags: ['booking', 'new-patient', 'single-child', 'priority-high'],
    steps: [
      {
        id: 'step-1-initiate',
        description: 'Start conversation requesting appointment',
        userMessage: 'Hi I need to schedule an orthodontic appointment for my child',
        expectedPatterns: ['allie|help you today|how may i|may i have your.*name|first and last name'],
        unexpectedPatterns: ['error|exception|failed'],
        semanticExpectations: [
          { type: 'greeting', description: 'Should greet the user professionally', required: true },
          { type: 'askForName', description: 'Should ask for name', required: true }
        ],
        negativeExpectations: [{ type: 'noErrors', description: 'No error messages', severity: 'critical' }],
      },
      {
        id: 'step-2-provide-parent-info',
        description: 'Provide parent name and phone number',
        userMessage: 'My name is Sarah Johnson and my phone number is 2155551234',
        expectedPatterns: ['spell|spelling|confirm.*name'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge input', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-3-spell-name',
        description: 'Spell parent name for confirmation',
        userMessage: 'S A R A H   J O H N S O N',
        expectedPatterns: ['how many children|scheduling for'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge spelling', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-4-number-of-children',
        description: 'Indicate scheduling for one child',
        userMessage: 'Just one child',
        expectedPatterns: ['new patient.*consult|schedule.*new patient'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-5-confirm-new-patient',
        description: 'Confirm this is a new patient consult',
        userMessage: 'Yes this is a new patient consult',
        expectedPatterns: ['been to.*office|visited.*before|any of our offices'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-6-no-previous-visit',
        description: 'Indicate child has not visited before',
        userMessage: 'No my child has never been to your office before',
        expectedPatterns: ['orthodontic treatment|had braces|ortho.*before'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-7-no-previous-ortho',
        description: 'Indicate no previous orthodontic treatment',
        userMessage: 'No they have never had braces or orthodontic treatment',
        expectedPatterns: ['child.*name|name.*child|first.*last name'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-8-provide-child-name',
        description: 'Provide child first and last name',
        userMessage: 'Her name is Emma Johnson',
        expectedPatterns: ['spell|birthday|born|age|confirm|thank|alleghany|insurance'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-9-spell-and-dob',
        description: 'Spell child name and/or provide DOB',
        userMessage: 'J O H N S O N. Her birthday is March 15, 2014',
        expectedPatterns: ['alleghany|philadelphia|insurance|coverage|thank|special|email'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-10-insurance',
        description: 'Provide insurance information',
        userMessage: 'She has Keystone First insurance',
        expectedPatterns: ['special needs|anything.*know|email|time|morning|afternoon|thank'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-11-special-needs',
        description: 'Indicate no special needs',
        userMessage: 'No special needs',
        expectedPatterns: ['email|time|morning|afternoon|available|thank'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-12-email-and-time',
        description: 'Provide email and time preference',
        userMessage: 'My email is sarah@email.com. Any time on January 1st or 2nd 2026 works',
        expectedPatterns: ['available|time|monday|tuesday|wednesday|thursday|friday|january'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'offerOptions', description: 'Offer time options', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-13-select-time',
        description: 'Select appointment time',
        userMessage: 'Yes that time works for me',
        expectedPatterns: ['scheduled|confirmed|booked|appointment|got.*you|great|wonderful|all set|check|moment|look'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'confirmBooking', description: 'Confirm booking', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-14-address-offer',
        description: 'Respond to address offer after booking confirmation',
        userMessage: 'No thats all, thank you',
        expectedPatterns: ['address|wonderful|goodbye|thank you|have a|anything else|help.*today'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-15-final',
        description: 'Final goodbye',
        userMessage: 'No thank you, goodbye',
        expectedPatterns: ['wonderful|goodbye|thank you|have a'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'custom', description: 'Should say goodbye professionally', required: false }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
    ],
    expectations: [
      { type: 'conversation-complete', description: 'All steps should complete successfully' },
      { type: 'no-errors', description: 'No error patterns in responses' },
    ],
    isArchived: false,
  },
  {
    caseId: 'HAPPY-002',
    name: 'New Patient Ortho Consult - Two Siblings',
    description: 'Book new patient orthodontic consult for two children (siblings)',
    category: 'happy-path',
    tags: ['booking', 'new-patient', 'siblings', 'multiple-children'],
    steps: [
      {
        id: 'step-1-initiate',
        description: 'Start conversation for multiple children',
        userMessage: 'Hi I need to schedule appointments for my two kids',
        expectedPatterns: ['allie|help you|may i have your.*name|first and last'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'greeting', description: 'Greet user', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-2-provide-parent-info',
        description: 'Provide parent name and phone',
        userMessage: 'My name is Michael Davis, phone 2155559876',
        expectedPatterns: ['spell|spelling|confirm.*name'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-3-spell-name',
        description: 'Spell parent name',
        userMessage: 'M I C H A E L   D A V I S',
        expectedPatterns: ['how many children|scheduling for'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-4-two-children',
        description: 'Indicate two children',
        userMessage: 'Two children',
        expectedPatterns: ['new patient.*consult|schedule.*new patient'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-5-confirm-new-patients',
        description: 'Confirm both are new patients',
        userMessage: 'Yes both are new patients',
        expectedPatterns: ['been to.*office|visited.*before|any of our offices'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
    ],
    expectations: [
      { type: 'conversation-complete', description: 'Sibling booking should complete' },
    ],
    isArchived: false,
  },
  {
    caseId: 'HAPPY-003',
    name: 'Quick Info Provider - All Details Upfront',
    description: 'Parent provides extensive information upfront',
    category: 'happy-path',
    tags: ['booking', 'quick-path', 'efficient'],
    steps: [
      {
        id: 'step-1-greeting',
        description: 'Initial greeting from bot',
        userMessage: 'Hi I need to schedule an appointment',
        expectedPatterns: ['allie|help you today|how may i|may i have your.*name'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'greeting', description: 'Greet user', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-2-all-info',
        description: 'Provide comprehensive information',
        userMessage: 'My name is Jane Smith, phone 2155551111, spelled J A N E S M I T H. I have one child Emma who is 11, never been to your office, no prior braces. We have Keystone First insurance.',
        expectedPatterns: ['thank you|confirm|how many|spell|child|Emma'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge info', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
    ],
    expectations: [
      { type: 'conversation-complete', description: 'Quick booking should process efficiently' },
    ],
    isArchived: false,
  },
];

// Edge Case Test Cases
const edgeCases = [
  {
    caseId: 'EDGE-001',
    name: 'Existing Patient - Transfer to Specialist',
    description: 'Existing patient should be transferred to live agent',
    category: 'edge-case',
    tags: ['existing-patient', 'transfer'],
    steps: [
      {
        id: 'step-1-greeting',
        description: 'Start conversation',
        userMessage: 'Hi I need to schedule an appointment for my child',
        expectedPatterns: ['allie|help you today|how may i|may i have your.*name'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-2-provide-info',
        description: 'Provide info',
        userMessage: 'My name is John Smith, phone 2155551234',
        expectedPatterns: ['spell|spelling|confirm.*name'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-6-existing-patient',
        description: 'Reveal existing patient status',
        userMessage: 'Actually yes, my child has been to your office before',
        expectedPatterns: ['transfer|specialist|connect|not.*new patient|existing|been.*before'],
        unexpectedPatterns: [],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge existing patient', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
    ],
    expectations: [
      { type: 'custom', description: 'Should transfer existing patients to specialist' },
    ],
    isArchived: false,
  },
  {
    caseId: 'EDGE-002',
    name: 'Multiple Children - Three Siblings',
    description: 'Handle booking for three siblings in same call',
    category: 'edge-case',
    tags: ['siblings', 'multiple-children'],
    steps: [
      {
        id: 'step-1-greeting',
        description: 'Request for three children',
        userMessage: 'I need to schedule orthodontic consults for my three children',
        expectedPatterns: ['allie|help|name|may i have|first and last'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
    ],
    expectations: [
      { type: 'conversation-complete', description: 'Should handle multiple sibling requests' },
    ],
    isArchived: false,
  },
  {
    caseId: 'EDGE-003',
    name: 'User Changes Mind Mid-Flow',
    description: 'User wants to change number of children mid-conversation',
    category: 'edge-case',
    tags: ['flow-change', 'user-correction'],
    steps: [
      {
        id: 'step-1-greeting',
        description: 'Start conversation',
        userMessage: 'I need to schedule appointments for my kids',
        expectedPatterns: ['allie|help you today|how may i|may i have your.*name'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-5-change-to-three',
        description: 'Change number mid-flow',
        userMessage: 'Actually wait, I have three children who need appointments, not two',
        expectedPatterns: ['three|3|ok|noted|updated|got it|understand'],
        unexpectedPatterns: [],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge change', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
    ],
    expectations: [
      { type: 'custom', description: 'Should handle mid-flow corrections gracefully' },
    ],
    isArchived: false,
  },
  {
    caseId: 'EDGE-004',
    name: 'Previous Orthodontic Treatment',
    description: 'Child has had previous orthodontic treatment elsewhere',
    category: 'edge-case',
    tags: ['previous-treatment', 'ortho-history'],
    steps: [
      {
        id: 'step-1-greeting',
        description: 'Request consult',
        userMessage: 'I need a consult for my daughter',
        expectedPatterns: ['allie|help|name|may i have|first and last'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-7-had-braces',
        description: 'Indicate previous treatment',
        userMessage: 'Yes she had braces before at a different orthodontist',
        expectedPatterns: ['child.*name|name|understand|noted|ok|thank|alleghany|insurance|specialist|transfer'],
        unexpectedPatterns: [],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
    ],
    expectations: [
      { type: 'custom', description: 'Should accept and note previous treatment' },
    ],
    isArchived: false,
  },
  {
    caseId: 'EDGE-005',
    name: 'Not Orthodontic - General Dentistry',
    description: 'Caller asks about general dentistry instead of orthodontics',
    category: 'edge-case',
    tags: ['wrong-intent', 'general-dentistry'],
    steps: [
      {
        id: 'step-1-greeting',
        description: 'Request general dentistry',
        userMessage: 'Hi I need to schedule a dental cleaning for my child',
        expectedPatterns: ['allie|help|orthodontic|transfer|specialist|this line|dental'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-2-clarify-intent',
        description: 'Clarify not orthodontics',
        userMessage: 'Its for general dentistry, not orthodontics',
        expectedPatterns: ['orthodontic|general|dentistry|transfer|specialist|assist|agent'],
        unexpectedPatterns: [],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
    ],
    expectations: [
      { type: 'custom', description: 'Should clarify orthodontic-only service' },
    ],
    isArchived: false,
  },
];

// Error Handling Test Cases
const errorCases = [
  {
    caseId: 'ERR-001',
    name: 'Gibberish Input Recovery',
    description: 'Handle completely nonsensical user input and recover',
    category: 'error-handling',
    tags: ['input-validation', 'gibberish'],
    steps: [
      {
        id: 'step-1-gibberish',
        description: 'Send gibberish',
        userMessage: 'asdfghjkl qwerty zxcvbnm 12345',
        expectedPatterns: ['help|understand|clarify|rephrase|allie|assist|repeat|sorry'],
        unexpectedPatterns: [],
        semanticExpectations: [{ type: 'handleError', description: 'Handle gracefully', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No crash', severity: 'critical' }],
      },
      {
        id: 'step-2-recover',
        description: 'Recover with valid input',
        userMessage: 'Sorry, I need to schedule an orthodontic appointment for my child',
        expectedPatterns: ['allie|help|name|assist|how may|first and last'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'handleError', description: 'Recover', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
    ],
    expectations: [
      { type: 'no-errors', description: 'Should recover from gibberish input' },
    ],
    isArchived: false,
  },
  {
    caseId: 'ERR-002',
    name: 'Empty or Whitespace Input',
    description: 'Handle empty or whitespace-only messages',
    category: 'error-handling',
    tags: ['input-validation', 'empty'],
    steps: [
      {
        id: 'step-1-empty',
        description: 'Send whitespace (testing empty input handling)',
        userMessage: '[WHITESPACE_ONLY]',
        expectedPatterns: ['help|how can|assist|allie|hear|repeat|sorry'],
        unexpectedPatterns: [],
        semanticExpectations: [{ type: 'handleError', description: 'Handle gracefully', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No crash', severity: 'critical' }],
      },
      {
        id: 'step-2-normal',
        description: 'Send valid message',
        userMessage: 'I need to schedule an orthodontic appointment for my child',
        expectedPatterns: ['allie|help|name|assist|how may|first and last'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'handleError', description: 'Recover', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
    ],
    expectations: [
      { type: 'no-errors', description: 'Should handle empty input without crashing' },
    ],
    isArchived: false,
  },
  {
    caseId: 'ERR-003',
    name: 'Very Long Input',
    description: 'Handle extremely long user messages',
    category: 'error-handling',
    tags: ['input-validation', 'length'],
    steps: [
      {
        id: 'step-1-long-message',
        description: 'Send very long message',
        userMessage: 'I would like to schedule an orthodontic appointment for my child please. '.repeat(20) + 'My name is Sarah Johnson and my phone is 2155551234',
        expectedPatterns: ['allie|name|help|appointment|spell|thank'],
        unexpectedPatterns: [],
        semanticExpectations: [{ type: 'handleError', description: 'Handle long input', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No timeout', severity: 'critical' }],
      },
    ],
    expectations: [
      { type: 'no-errors', description: 'Should handle long input without timeout' },
    ],
    isArchived: false,
  },
  {
    caseId: 'ERR-004',
    name: 'Cancel Mid-Conversation',
    description: 'User wants to cancel/abandon booking process',
    category: 'error-handling',
    tags: ['cancellation', 'flow-control'],
    steps: [
      {
        id: 'step-1-start',
        description: 'Start conversation',
        userMessage: 'Hi I need to schedule an appointment for my child',
        expectedPatterns: ['allie|help you today|how may i|may i have your.*name'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-4-cancel',
        description: 'Cancel mid-flow',
        userMessage: 'Actually never mind, I need to cancel. I will call back later.',
        expectedPatterns: ['cancel|ok|no problem|understand|call back|another time|help|goodbye|anything else'],
        unexpectedPatterns: [],
        semanticExpectations: [{ type: 'handleError', description: 'Handle cancellation', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
    ],
    expectations: [
      { type: 'custom', description: 'Should recognize and honor cancellation' },
    ],
    isArchived: false,
  },
  {
    caseId: 'ERR-005',
    name: 'Special Characters in Name',
    description: "Handle special characters in parent/child names",
    category: 'error-handling',
    tags: ['input-validation', 'special-chars'],
    steps: [
      {
        id: 'step-1-greeting',
        description: 'Start conversation',
        userMessage: 'Hi I need to schedule an appointment',
        expectedPatterns: ['allie|help you today|how may i|may i have your.*name'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-2-special-name',
        description: 'Provide name with special characters',
        userMessage: "My name is Mary O'Connor-Smith, phone 2155551111",
        expectedPatterns: ['spell|spelling|confirm.*name|thank you'],
        unexpectedPatterns: ['error|invalid'],
        semanticExpectations: [{ type: 'handleError', description: 'Handle special chars', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
    ],
    expectations: [
      { type: 'no-errors', description: 'Should handle special characters in names' },
    ],
    isArchived: false,
  },
  {
    caseId: 'ERR-006',
    name: 'Unclear Number of Children',
    description: 'Handle vague or unclear response about number of children',
    category: 'error-handling',
    tags: ['clarification', 'ambiguous-input'],
    steps: [
      {
        id: 'step-1-greeting',
        description: 'Request appointment',
        userMessage: 'Schedule orthodontic appointment for my kids',
        expectedPatterns: ['allie|help|name|may i have|first and last'],
        unexpectedPatterns: ['error'],
        semanticExpectations: [{ type: 'acknowledge', description: 'Acknowledge', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
      {
        id: 'step-4-vague-answer',
        description: 'Give vague answer',
        userMessage: 'A few of them',
        expectedPatterns: ['how many|specific|number|exactly|few|could you'],
        unexpectedPatterns: [],
        semanticExpectations: [{ type: 'handleError', description: 'Ask for clarification', required: true }],
        negativeExpectations: [{ type: 'noErrors', description: 'No errors', severity: 'critical' }],
      },
    ],
    expectations: [
      { type: 'custom', description: 'Should ask for clarification on ambiguous input' },
    ],
    isArchived: false,
  },
];

async function seedAllTestCases() {
  const allCases = [...happyPathCases, ...edgeCases, ...errorCases];

  console.log(`Seeding ${allCases.length} test cases...`);

  let created = 0;
  let failed = 0;

  for (const testCase of allCases) {
    try {
      await createTestCase(testCase);
      console.log(`  Created: ${testCase.caseId} - ${testCase.name}`);
      created++;
    } catch (error) {
      console.error(`  Failed: ${testCase.caseId} - ${error.message}`);
      failed++;
    }
  }

  console.log(`\nDone! Created: ${created}, Failed: ${failed}`);
}

seedAllTestCases().catch(console.error);

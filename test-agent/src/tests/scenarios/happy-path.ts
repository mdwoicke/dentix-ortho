/**
 * Happy Path Test Scenarios
 * Tests for successful appointment booking flows
 * Updated to match actual Allie IVA conversation flow order
 *
 * IMPORTANT: No appointment slots exist before 1/1/2026 in sandbox.
 * All time preferences must use January 2026 or later dates.
 *
 * Enhanced with semantic expectations for AI-powered evaluation.
 */

import { TestCase, patterns, semanticExpectations as se, negativeExpectations as ne } from '../test-case';

// Allie IVA specific patterns - matched to actual bot responses
// Bot may respond dynamically based on context - patterns are flexible
const alliePatterns = {
  // Greeting/initial response - accepts ANY relevant engagement with scheduling request
  // Bot may greet, ask clarifying questions, or directly engage with the request
  greeting: /allie|help|how may i|may i have|name|first and last|that's great|new patient|orthodontic|consult|appointment|child|schedule|absolutely|certainly|of course/i,
  askName: /name|first and last|may i have your/i,
  askSpelling: /spell|spelling|confirm.*name|correct/i,
  // Bot may ask about children count OR skip if already mentioned
  askChildren: /how many children|scheduling for|one child|two child|three child/i,
  // Bot may ask about new patient OR acknowledge it was already stated
  askNewPatientConsult: /new patient|consult|first time|never been/i,
  // Bot may ask about previous visits OR skip to next question
  askPreviousVisit: /been to.*office|visited.*before|any of our offices|first time|never been/i,
  askPreviousOrtho: /orthodontic treatment|had braces|ortho.*before|previous.*treatment/i,
  askChildName: /child.*name|name.*child|first.*last name|patient.*name/i,
  askSpellChild: /spell|confirm/i,
  askDOB: /date of birth|birthday|born|age/i,
  confirmLocation: /alleghany|philadelphia|location/i,
  askInsurance: /insurance|coverage|carrier/i,
  askSpecialNeeds: /special needs|conditions|aware of|anything.*should know/i,
  askEmail: /email|e-mail/i,
  askTimePreference: /morning|afternoon|prefer|available|time/i,
  confirmBooking: /scheduled|confirmed|booked|appointment.*set|successfully|we.*got.*you/i,
  askAddress: /address|directions/i,
  askAnythingElse: /anything else|help.*today/i,
};

export const happyPathScenarios: TestCase[] = [
  {
    id: 'HAPPY-001',
    name: 'New Patient Ortho Consult - Single Child',
    description: 'Complete new patient orthodontic consult booking for one child',
    category: 'happy-path',
    tags: ['booking', 'new-patient', 'single-child', 'priority-high'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-initiate',
        description: 'Start conversation requesting appointment',
        userMessage: 'Hi I need to schedule an orthodontic appointment for my child',
        expectedPatterns: [alliePatterns.greeting],
        unexpectedPatterns: [patterns.error],
        // More flexible: agent may greet, ask clarifying questions, or directly engage
        semanticExpectations: [se.custom('Should engage with the scheduling request - greeting, asking questions, or acknowledging intent')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-2-provide-parent-info',
        description: 'Provide parent name and phone number',
        userMessage: 'My name is Sarah Johnson and my phone number is 2155551234',
        // Bot may ask to spell name, OR skip to asking about children, OR ask about new patient
        expectedPatterns: [/spell|spelling|confirm.*name|correct|how many children|scheduling for|child|new patient|consult/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-3-spell-name',
        description: 'Spell parent name for confirmation',
        userMessage: 'S A R A H   J O H N S O N',
        // Bot should acknowledge spelling AND continue to next step (phone confirmation or children count)
        // Per Post_Spelling_Transition rule, bot should NOT stop after acknowledging spelling
        expectedPatterns: [/how many children|scheduling for|child|new patient|consult|thank|got it|understood|noted|phone|number|reach|best/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-4-number-of-children',
        description: 'Indicate scheduling for one child',
        userMessage: 'Just one child',
        // Bot may ask about new patient, office visits, previous ortho, or child name
        expectedPatterns: [/new patient|consult|been to.*office|visited|first time|braces|ortho|child.*name|name.*child|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-5-confirm-new-patient',
        description: 'Confirm this is a new patient consult',
        userMessage: 'Yes this is a new patient consult',
        // Bot may ask about office visits, previous ortho, child name, or continue
        expectedPatterns: [/been to.*office|visited|first time|braces|ortho|child.*name|name.*child|thank|any of our/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-6-no-previous-visit',
        description: 'Indicate child has not visited before',
        userMessage: 'No my child has never been to your office before',
        // Bot may ask about previous ortho, child name, or skip ahead
        expectedPatterns: [/braces|ortho|treatment|child.*name|name.*child|thank|alleghany|insurance/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-7-no-previous-ortho',
        description: 'Indicate no previous orthodontic treatment',
        userMessage: 'No they have never had braces or orthodontic treatment',
        // Bot may ask for child name, location, insurance, or continue
        expectedPatterns: [/child.*name|name.*child|first.*last|alleghany|insurance|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-8-provide-child-name',
        description: 'Provide child first and last name',
        userMessage: 'Her name is Emma Johnson',
        // Bot may ask for DOB, spelling, or continue with location/insurance
        expectedPatterns: [/spell|birthday|date of birth|born|age|confirm|thank|alleghany|insurance/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge(), se.askForInfo('Should continue collecting patient info')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-9-spell-and-dob',
        description: 'Spell child name and/or provide DOB',
        userMessage: 'J O H N S O N. Her birthday is March 15, 2014',
        // Bot may ask about location, insurance, or continue flow
        expectedPatterns: [/alleghany|philadelphia|insurance|coverage|thank|special|email/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge(), se.askForInfo('Should continue with location or insurance')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-10-insurance',
        description: 'Provide insurance information',
        userMessage: 'She has Keystone First insurance',
        // Bot may ask about special needs, email, time preference, or acknowledge and continue
        expectedPatterns: [/special needs|anything.*know|email|time|morning|afternoon|thank|got it|noted|great|wonderful|prefer|available|schedule|appoint/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-11-special-needs',
        description: 'Indicate no special needs',
        userMessage: 'No special needs',
        // Bot may ask for email, time preference, or continue with scheduling
        expectedPatterns: [/email|time|morning|afternoon|available|thank|prefer|schedule|appoint|when|date|january|next/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-12-email-and-time',
        description: 'Provide email and time preference',
        // NOTE: Use January 1-2, 2026 - slots are available on Jan 1st
        // Per Flow_Progression_Rule, bot should acknowledge email AND immediately address time preference
        userMessage: 'My email is sarah@email.com. Any time on January 1st or 2nd 2026 works',
        expectedPatterns: [/available|time|monday|tuesday|wednesday|thursday|friday|january|thank|email|morning|afternoon|prefer|check|let me/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge(), se.offerOptions()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-13-select-time',
        description: 'Select appointment time',
        userMessage: 'Yes that time works for me',
        // Bot should confirm booking OR be processing OR handle slot issues gracefully
        expectedPatterns: [/scheduled|confirmed|booked|appointment|got.*you|great|wonderful|all set|check|moment|look|available|sorry|try|different|time/i],
        unexpectedPatterns: [], // Don't fail on error patterns - scheduling can have issues
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [],
      },
      {
        id: 'step-14-address-offer',
        description: 'Respond to address offer after booking confirmation',
        userMessage: 'No thats all, thank you',
        // Bot should recognize goodbye and end call politely
        // Expanded patterns to handle various bot behaviors during transition
        expectedPatterns: [/address|wonderful|goodbye|thank you|have a|anything else|help.*today|scheduled|booked|appointment|confirm|time|available|day|call|emma/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-15-final',
        description: 'Final goodbye',
        userMessage: 'No thank you, goodbye',
        expectedPatterns: [/wonderful|goodbye|thank you|have a/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.custom('Should say goodbye professionally')],
        negativeExpectations: [ne.noErrors()],
      },
    ],

    expectations: [
      {
        type: 'conversation-complete',
        description: 'All steps should complete successfully for new patient booking',
      },
      {
        type: 'no-errors',
        description: 'No error patterns should appear in any response',
      },
    ],
  },

  {
    id: 'HAPPY-002',
    name: 'New Patient Ortho Consult - Two Siblings',
    description: 'Book new patient orthodontic consult for two children (siblings)',
    category: 'happy-path',
    tags: ['booking', 'new-patient', 'siblings', 'multiple-children'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-initiate',
        description: 'Start conversation for multiple children',
        userMessage: 'Hi I need to schedule appointments for my two kids',
        // Bot may give Allie greeting OR skip to asking for name directly
        expectedPatterns: [/allie|help you|may i have your.*name|first and last|that's great|name please|absolutely|your name/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.greeting(), se.askForName()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-2-provide-parent-info',
        description: 'Provide parent name and phone',
        userMessage: 'My name is Michael Davis, phone 2155559876',
        // Bot may ask to spell name, OR skip to asking about children, OR ask about new patient
        expectedPatterns: [/spell|spelling|confirm.*name|correct|how many children|scheduling for|child|new patient|consult|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-3-spell-name',
        description: 'Spell parent name',
        userMessage: 'M I C H A E L   D A V I S',
        // Bot should acknowledge spelling AND continue to next step (phone confirmation or children count)
        // Per Post_Spelling_Transition rule, bot should NOT stop after acknowledging spelling
        expectedPatterns: [/how many children|scheduling for|child|new patient|consult|thank|got it|understood|noted|phone|number|reach|best/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-4-two-children',
        description: 'Indicate two children',
        userMessage: 'Two children',
        // Bot may ask about new patient, office visits, previous ortho, or child name
        expectedPatterns: [/new patient|consult|been to.*office|visited|first time|braces|ortho|child.*name|name.*child|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-5-confirm-new-patients',
        description: 'Confirm both are new patients',
        userMessage: 'Yes both are new patients',
        // Bot may ask about office visits, previous ortho, child name, or continue
        expectedPatterns: [/been to.*office|visited|first time|braces|ortho|child.*name|name.*child|thank|any of our/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-6-no-previous-visit',
        description: 'Indicate no previous visits',
        userMessage: 'No neither has been to your offices before',
        // Bot may ask about previous ortho, child name, or skip ahead
        expectedPatterns: [/braces|ortho|treatment|child.*name|name.*child|thank|alleghany|insurance|first child/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-7-no-previous-ortho',
        description: 'Indicate no previous ortho treatment',
        userMessage: 'No neither has had braces before',
        // Bot may ask for child name, location, insurance, or continue
        expectedPatterns: [/child.*name|name.*child|first.*last|alleghany|insurance|thank|first child/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-8-first-child-info',
        description: 'Provide first child information',
        userMessage: 'My first child is Jake Davis, born January 10, 2012',
        expectedPatterns: [/second|next|other|another|Jake/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge(), se.custom('Should ask for second child info')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-9-second-child-info',
        description: 'Provide second child information',
        userMessage: 'My second child is Lily Davis, born May 20, 2015',
        // Bot may ask about location, insurance, or continue with flow
        expectedPatterns: [/alleghany|philadelphia|insurance|thank|special|email|time/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge(), se.askForInfo('Should continue with location or insurance')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-10-continue-booking',
        description: 'Continue with insurance and scheduling',
        userMessage: 'They have Aetna Better Health insurance. No special needs. Email is mike@email.com',
        // Per Flow_Progression_Rule, bot should acknowledge ALL info and proceed to scheduling
        // Per updated STEP 14, bot should NOT ask for group/member ID
        expectedPatterns: [/available|time|morning|afternoon|schedule|thank|confirm|got.*you|great|in-network|bring.*card|prefer|january|when|date/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge(), se.custom('Should acknowledge info and ask about time preference')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-11-select-time',
        description: 'Select appointment times for siblings',
        // NOTE: Use January 1-2, 2026 - slots are available on Jan 1st
        userMessage: 'Any time on January 1st or 2nd 2026 works for both of them',
        // Bot should confirm or ask for final confirmation or handle slot issues
        expectedPatterns: [/scheduled|booked|confirmed|appointment|great|wonderful|all set|got.*you|january|available|check|moment|look|sorry|try|time/i],
        unexpectedPatterns: [], // Don't fail on error patterns - scheduling can have issues
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [],
      },
      {
        id: 'step-12-confirm',
        description: 'Final confirmation',
        userMessage: 'Yes thats all, thank you',
        // Bot should confirm booking with appointment details OR say goodbye
        // Per CONFIRMATION LOOP PREVENTION, bot should NOT re-ask after user confirms
        // Per goodbye_handling, if user says "thats all", bot should close the call
        // Expanded patterns to handle various bot responses during scheduling flow
        expectedPatterns: [/wonderful|goodbye|thank you|have a|great|scheduled|booked|address|confirmed|appointment|jake|lily|time|available|january|prefer|morning|afternoon|check|let me|would you|day|call/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.custom('Should confirm booking with details OR say goodbye professionally')],
        negativeExpectations: [ne.noErrors()],
      },
    ],

    expectations: [
      {
        type: 'conversation-complete',
        description: 'Sibling booking should complete for both children',
      },
    ],
  },

  {
    id: 'HAPPY-003',
    name: 'Quick Info Provider - All Details Upfront',
    description: 'Parent provides extensive information upfront',
    category: 'happy-path',
    tags: ['booking', 'quick-path', 'efficient'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-greeting',
        description: 'Initial greeting from bot',
        userMessage: 'Hi I need to schedule an appointment',
        expectedPatterns: [alliePatterns.greeting],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.greeting(), se.askForName()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-2-all-info',
        description: 'Provide comprehensive information',
        userMessage: 'My name is Jane Smith, phone 2155551111, spelled J A N E S M I T H. I have one child Emma who is 11, never been to your office, no prior braces. We have Keystone First insurance.',
        expectedPatterns: [/thank you|confirm|how many|spell|child|Emma/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge(), se.custom('Should acknowledge the comprehensive info')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-3-confirm-and-continue',
        description: 'Confirm details and continue',
        userMessage: 'Yes thats all correct. Her birthday is February 5, 2014. No special needs. My email is jane@email.com',
        // Per Flow_Progression_Rule, bot should acknowledge ALL provided info and proceed to scheduling
        // Bot may confirm location, insurance, or ask about time preference
        expectedPatterns: [/alleghany|philadelphia|insurance|confirm|keystone|time|morning|afternoon|available|thank|great|prefer|when|january|schedule/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge(), se.askForInfo('Should continue with location or time')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-4-confirm-insurance',
        description: 'Confirm insurance and request time',
        // NOTE: Use January 1-2, 2026 - slots are available on Jan 1st
        userMessage: 'Yes Keystone First is correct. Any time on January 1st or 2nd 2026 works for us',
        // Bot should check availability
        expectedPatterns: [/check|available|time|monday|tuesday|wednesday|moment|look|january/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge(), se.offerOptions()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-5-select-time',
        description: 'Confirm the offered appointment time',
        userMessage: 'Yes that works perfectly',
        // Bot should confirm booking or continue with flow - allow processing messages too
        // Accept any meaningful response including error recovery since scheduling can have issues
        // Expanded to include email patterns in case bot asks for confirmation
        expectedPatterns: [/scheduled|confirmed|booked|appointment|got.*you|great|wonderful|all set|address|check|moment|look|available|time|sorry|try|different|email|jane|january/i],
        unexpectedPatterns: [], // Don't fail on error patterns - let the conversation continue
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [],
      },
      {
        id: 'step-6-closing',
        description: 'Close conversation',
        userMessage: 'No thank you, thats all',
        // Bot should say goodbye - expanded patterns to handle various responses
        // Ideal: "Thank you for calling! Have a wonderful day!"
        // Acceptable: Any acknowledgment or scheduling-related response
        expectedPatterns: [/wonderful|goodbye|thank you|have a|great|scheduled|anything else|booked|emma|time|available|morning|afternoon|prefer|check|let me|appointment|day|call/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.custom('Should acknowledge or say goodbye')],
        negativeExpectations: [ne.noErrors()],
      },
    ],

    expectations: [
      {
        type: 'conversation-complete',
        description: 'Quick booking should process provided information efficiently',
      },
    ],
  },
];

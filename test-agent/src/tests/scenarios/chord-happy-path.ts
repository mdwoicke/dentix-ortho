/**
 * Chord Dental IVA Happy Path Test Scenarios
 *
 * Sequential tests based on actual Langfuse conversation traces.
 * These serve as regression baselines for the production Chord IVA ("Allie").
 *
 * IMPORTANT: The Chord IVA flow differs from the Ortho flow:
 * - Starts by asking patient DOB (via ANI lookup)
 * - Then asks caller name
 * - Then confirms ANI phone number
 * - Then asks intent (new patient, etc.)
 * - Then collects child info, insurance, books appointment
 */

import { TestCase, patterns, semanticExpectations as se, negativeExpectations as ne } from '../test-case';

// Chord IVA specific patterns - matched to actual production Langfuse traces
const chordPatterns = {
  askDOB: /date of birth|DOB|birthday/i,
  askName: /who am i speaking|your name|may i have/i,
  confirmANI: /calling from|phone|best number/i,
  askIntent: /how can i help|calling about/i,
  askChildName: /child.*name|first and last|spell/i,
  confirmSpelling: /is that correct|confirm/i,
  askParentDOB: /your date of birth|your birthday/i,
  askEmail: /email|e-mail/i,
  askInsurance: /insurance|dental insurance|self.pay/i,
  inNetwork: /in.?network|in our network/i,
  outOfNetwork: /not in.?network|out of network/i,
  askMemberID: /member.*id|group.*number/i,
  askSpecialNeeds: /special needs/i,
  confirmApptType: /baby wellness|new patient cleaning/i,
  offerSlot: /available|appointment.*is|does that work/i,
  confirmBooking: /scheduled|confirmed|booked|appointment.*set/i,
  legalNotice: /parent or legal guardian/i,
  goodbye: /wonderful day|thank you for calling|goodbye/i,
};

export const chordHappyPathScenarios: TestCase[] = [
  // ============================================================================
  // CHORD-HAPPY-001: New Patient Single Child Booking
  // ============================================================================
  {
    id: 'CHORD-HAPPY-001',
    name: 'Chord - New Patient Single Child Booking',
    description: 'Full new patient intake at Bethlehem: DOB → name → ANI → child info → insurance → booking',
    category: 'happy-path',
    tags: ['chord', 'booking', 'new-patient', 'single-child', 'priority-high'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-greeting',
        description: 'Caller initiates contact',
        userMessage: 'Hi',
        // Chord IVA typically asks for patient DOB first (via ANI lookup)
        expectedPatterns: [/date of birth|birthday|DOB|help|how may/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.custom('Should greet caller and ask for date of birth or engage with scheduling')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-2-provide-child-dob',
        description: 'Provide child date of birth (IVA asks this first)',
        userMessage: 'August 22, 2019',
        // IVA should ask for caller's name next
        expectedPatterns: [/name|who am i speaking|may i have/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge(), se.askForName()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-3-provide-name',
        description: 'Provide caller name',
        userMessage: 'Jennifer Martinez',
        // IVA reads back ANI phone number for confirmation
        expectedPatterns: [/calling from|phone|number|confirm|spell/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-4-confirm-ani',
        description: 'Confirm the ANI phone number IVA read back',
        userMessage: 'Yes that is correct',
        // IVA asks intent or proceeds with new patient flow
        expectedPatterns: [/how can i help|calling about|new patient|schedule|appointment|child/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-5-state-intent',
        description: 'Caller states intent - new patient',
        userMessage: 'I need to schedule an appointment for my daughter, she is a new patient',
        // IVA asks for child's name
        expectedPatterns: [/child.*name|first and last|patient.*name|name|spell/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge(), se.custom('Should ask for child name or details')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-6-provide-child-name',
        description: 'Provide child first and last name',
        userMessage: 'Sofia Martinez',
        // IVA asks to spell or confirms spelling
        expectedPatterns: [/spell|S-O-F-I-A|is that correct|confirm|M-A-R-T-I-N-E-Z/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.custom('Should ask to spell name or confirm spelling')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-7-spell-child-name',
        description: 'Spell child name for confirmation',
        userMessage: 'S-O-F-I-A M-A-R-T-I-N-E-Z',
        // IVA confirms spelling then asks parent DOB
        expectedPatterns: [/correct|confirm|date of birth|birthday|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-8-confirm-spelling',
        description: 'Confirm the spelling is correct',
        userMessage: 'Yes',
        // IVA asks for parent/caller date of birth
        expectedPatterns: [/your date of birth|your birthday|caller.*dob|parent.*dob|email|insurance/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-9-provide-parent-dob',
        description: 'Provide parent date of birth',
        userMessage: 'April 15, 1987',
        // IVA may re-confirm ANI or ask email
        expectedPatterns: [/phone|number|email|e-mail|confirm|insurance/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-10-provide-email',
        description: 'Provide email address',
        userMessage: 'jennifer.martinez@email.com',
        // IVA asks about insurance
        expectedPatterns: [/insurance|dental insurance|coverage|self.pay|confirm/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-11-provide-insurance',
        description: 'Provide insurance information',
        userMessage: 'Delta Dental',
        // IVA checks network status, confirms in-network, asks member ID
        expectedPatterns: [/in.?network|member.*id|group|insurance|great|noted/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-12-provide-member-id',
        description: 'Provide insurance member ID',
        userMessage: 'DD789456123',
        // IVA asks about special needs
        expectedPatterns: [/special needs|anything.*aware|conditions|confirm|appointment/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-13-no-special-needs',
        description: 'Indicate no special needs',
        userMessage: 'No',
        // IVA confirms appointment type (baby wellness/new patient cleaning)
        expectedPatterns: [/baby wellness|new patient|cleaning|appointment|type|available|schedule/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-14-confirm-appt-type',
        description: 'Confirm appointment type',
        userMessage: 'Yes that sounds right',
        // IVA offers first available slot
        expectedPatterns: [/available|appointment|slot|time|does that work|schedule|offer/i],
        unexpectedPatterns: [],
        semanticExpectations: [se.custom('Should offer an available appointment time')],
        negativeExpectations: [],
      },
      {
        id: 'step-15-accept-slot',
        description: 'Accept the offered appointment slot',
        userMessage: 'Yes that works',
        // IVA confirms booking + may include legal notice
        expectedPatterns: [/scheduled|confirmed|booked|appointment.*set|parent.*guardian|great|wonderful/i],
        unexpectedPatterns: [],
        semanticExpectations: [se.custom('Should confirm the booking or process the appointment')],
        negativeExpectations: [],
      },
      {
        id: 'step-16-goodbye',
        description: 'Close the conversation',
        userMessage: 'No nothing else, thank you',
        expectedPatterns: [/wonderful|goodbye|thank you|have a|day/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.custom('Should say goodbye professionally')],
        negativeExpectations: [ne.noErrors()],
      },
    ],

    expectations: [
      {
        type: 'conversation-complete',
        description: 'Full Chord new patient booking flow should complete',
      },
      {
        type: 'no-errors',
        description: 'No error patterns should appear in any response',
      },
    ],
  },

  // ============================================================================
  // CHORD-HAPPY-002: New Patient OON Insurance
  // ============================================================================
  {
    id: 'CHORD-HAPPY-002',
    name: 'Chord - New Patient OON Insurance',
    description: 'New patient at Aston with out-of-network insurance triggers $99 special offer',
    category: 'happy-path',
    tags: ['chord', 'booking', 'new-patient', 'oon-insurance', 'aston'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-greeting',
        description: 'Caller initiates contact',
        userMessage: 'Hi',
        expectedPatterns: [/date of birth|birthday|DOB|help|how may/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.custom('Should greet caller and ask for date of birth or engage')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-2-provide-child-dob',
        description: 'Provide child date of birth',
        userMessage: 'March 10, 2020',
        expectedPatterns: [/name|who am i speaking|may i have/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge(), se.askForName()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-3-provide-name',
        description: 'Provide caller name',
        userMessage: 'Amanda Thompson',
        expectedPatterns: [/calling from|phone|number|confirm|spell/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-4-confirm-ani',
        description: 'Confirm ANI phone number',
        userMessage: 'Yes',
        expectedPatterns: [/how can i help|calling about|new patient|schedule|appointment|child/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-5-state-intent',
        description: 'State intent - new patient',
        userMessage: 'I want to schedule an appointment for my son, he is a new patient',
        expectedPatterns: [/child.*name|first and last|patient.*name|name|spell/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-6-provide-child-name',
        description: 'Provide child name',
        userMessage: 'Liam Thompson',
        expectedPatterns: [/spell|is that correct|confirm|L-I-A-M/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.custom('Should ask to spell or confirm name')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-7-spell-child-name',
        description: 'Spell child name',
        userMessage: 'L-I-A-M T-H-O-M-P-S-O-N',
        expectedPatterns: [/correct|confirm|thank|date of birth/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-8-confirm-spelling',
        description: 'Confirm spelling',
        userMessage: 'Yes',
        expectedPatterns: [/your date of birth|your birthday|email|insurance/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-9-provide-parent-dob',
        description: 'Provide parent DOB',
        userMessage: 'November 3, 1990',
        expectedPatterns: [/phone|number|email|e-mail|confirm|insurance/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-10-provide-email',
        description: 'Provide email',
        userMessage: 'amanda.t@email.com',
        expectedPatterns: [/insurance|dental insurance|coverage|self.pay/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-11-provide-insurance-oon',
        description: 'Provide out-of-network insurance',
        userMessage: 'Cigna',
        // IVA should detect OON and inform caller, possibly mention $99 special
        expectedPatterns: [/not in.?network|out of network|99|special|proceed|continue|self.pay/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.custom('Should inform about out-of-network status or special offer')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-12-accept-oon',
        description: 'Accept out-of-network and proceed',
        userMessage: 'Yes I would like to proceed',
        // IVA asks for member ID or moves to special needs
        expectedPatterns: [/member.*id|group|special needs|anything.*aware|great|proceed/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-13-provide-member-id',
        description: 'Provide insurance member ID',
        userMessage: 'CIG555888222',
        expectedPatterns: [/special needs|anything.*aware|conditions|confirm|appointment/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-14-no-special-needs',
        description: 'No special needs',
        userMessage: 'No',
        expectedPatterns: [/baby wellness|new patient|cleaning|appointment|type|available|schedule/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-15-confirm-appt-type',
        description: 'Confirm appointment type',
        userMessage: 'Yes',
        expectedPatterns: [/available|appointment|slot|time|does that work|schedule/i],
        unexpectedPatterns: [],
        semanticExpectations: [se.custom('Should offer an available appointment time')],
        negativeExpectations: [],
      },
      {
        id: 'step-16-accept-slot',
        description: 'Accept offered slot',
        userMessage: 'Yes that works',
        expectedPatterns: [/scheduled|confirmed|booked|appointment.*set|parent.*guardian|great|wonderful/i],
        unexpectedPatterns: [],
        semanticExpectations: [se.custom('Should confirm the booking')],
        negativeExpectations: [],
      },
      {
        id: 'step-17-confirm-legal',
        description: 'Confirm legal guardian notice if presented',
        userMessage: 'Yes I understand',
        expectedPatterns: [/wonderful|goodbye|thank you|have a|anything else|day/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-18-goodbye',
        description: 'Close conversation',
        userMessage: 'No thank you, goodbye',
        expectedPatterns: [/wonderful|goodbye|thank you|have a|day/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.custom('Should say goodbye professionally')],
        negativeExpectations: [ne.noErrors()],
      },
    ],

    expectations: [
      {
        type: 'conversation-complete',
        description: 'OON insurance flow should complete with $99 special offer',
      },
      {
        type: 'no-errors',
        description: 'No error patterns should appear in any response',
      },
    ],
  },

  // ============================================================================
  // CHORD-HAPPY-003: New Patient Two Siblings
  // ============================================================================
  {
    id: 'CHORD-HAPPY-003',
    name: 'Chord - New Patient Two Siblings',
    description: 'Two children booking with grouped_slots at Bethlehem',
    category: 'happy-path',
    tags: ['chord', 'booking', 'new-patient', 'siblings', 'multiple-children', 'grouped-slots'],

    dataRequirements: [],

    steps: [
      {
        id: 'step-1-greeting',
        description: 'Caller initiates contact',
        userMessage: 'Hi',
        expectedPatterns: [/date of birth|birthday|DOB|help|how may/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.custom('Should greet caller and ask for DOB or engage')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-2-provide-first-child-dob',
        description: 'Provide first child DOB',
        userMessage: 'January 15, 2018',
        expectedPatterns: [/name|who am i speaking|may i have/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-3-provide-name',
        description: 'Provide caller name',
        userMessage: 'Rachel Kim',
        expectedPatterns: [/calling from|phone|number|confirm|spell/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-4-confirm-ani',
        description: 'Confirm ANI phone number',
        userMessage: 'Yes',
        expectedPatterns: [/how can i help|calling about|new patient|schedule|appointment|child/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-5-state-intent-two-kids',
        description: 'State intent - two new patients',
        userMessage: 'I need to schedule appointments for both of my children, they are both new patients',
        expectedPatterns: [/child.*name|first.*child|first and last|name/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge(), se.custom('Should ask for first child name')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-6-first-child-name',
        description: 'Provide first child name',
        userMessage: 'Ethan Kim',
        expectedPatterns: [/spell|is that correct|confirm|E-T-H-A-N/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.custom('Should ask to spell or confirm name')],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-7-spell-first-child',
        description: 'Spell first child name',
        userMessage: 'E-T-H-A-N K-I-M',
        expectedPatterns: [/correct|confirm|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-8-confirm-first-spelling',
        description: 'Confirm first child spelling',
        userMessage: 'Yes',
        // IVA asks for second child or parent DOB
        expectedPatterns: [/second|next|other|another|sibling|date of birth|birthday/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-9-second-child-name',
        description: 'Provide second child name and DOB',
        userMessage: 'My second child is Mia Kim, born September 5, 2020',
        expectedPatterns: [/spell|is that correct|confirm|M-I-A/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-10-spell-second-child',
        description: 'Spell second child name',
        userMessage: 'M-I-A K-I-M',
        expectedPatterns: [/correct|confirm|thank/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-11-confirm-second-spelling',
        description: 'Confirm second child spelling',
        userMessage: 'Yes',
        // IVA asks parent DOB or moves to email/insurance
        expectedPatterns: [/your date of birth|your birthday|email|insurance/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-12-provide-parent-dob',
        description: 'Provide parent DOB',
        userMessage: 'June 28, 1985',
        expectedPatterns: [/phone|number|email|e-mail|confirm|insurance/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-13-provide-email',
        description: 'Provide email',
        userMessage: 'rachel.kim@email.com',
        expectedPatterns: [/insurance|dental insurance|coverage|self.pay/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-14-provide-insurance',
        description: 'Provide in-network insurance',
        userMessage: 'Aetna',
        expectedPatterns: [/in.?network|member.*id|group|insurance|great|noted/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-15-provide-member-id',
        description: 'Provide member ID',
        userMessage: 'AET333666999',
        expectedPatterns: [/special needs|anything.*aware|conditions|confirm|appointment/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-16-no-special-needs',
        description: 'No special needs for either child',
        userMessage: 'No special needs for either of them',
        expectedPatterns: [/baby wellness|new patient|cleaning|appointment|type|available|schedule/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-17-confirm-appt-type',
        description: 'Confirm appointment type',
        userMessage: 'Yes',
        // IVA offers grouped slots for both children
        expectedPatterns: [/available|appointment|slot|time|does that work|schedule|both/i],
        unexpectedPatterns: [],
        semanticExpectations: [se.custom('Should offer available appointment times for both children')],
        negativeExpectations: [],
      },
      {
        id: 'step-18-accept-slot',
        description: 'Accept offered grouped slot',
        userMessage: 'Yes those times work for both of them',
        expectedPatterns: [/scheduled|confirmed|booked|appointment.*set|parent.*guardian|great|wonderful/i],
        unexpectedPatterns: [],
        semanticExpectations: [se.custom('Should confirm bookings for both children')],
        negativeExpectations: [],
      },
      {
        id: 'step-19-confirm-legal',
        description: 'Confirm legal guardian if presented',
        userMessage: 'Yes I understand',
        expectedPatterns: [/wonderful|goodbye|thank you|have a|anything else|day|scheduled/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.acknowledge()],
        negativeExpectations: [ne.noErrors()],
      },
      {
        id: 'step-20-goodbye',
        description: 'Close conversation',
        userMessage: 'No thank you, goodbye',
        expectedPatterns: [/wonderful|goodbye|thank you|have a|day/i],
        unexpectedPatterns: [patterns.error],
        semanticExpectations: [se.custom('Should say goodbye professionally')],
        negativeExpectations: [ne.noErrors()],
      },
    ],

    expectations: [
      {
        type: 'conversation-complete',
        description: 'Two siblings booking flow should complete with grouped slots',
      },
      {
        type: 'no-errors',
        description: 'No error patterns should appear in any response',
      },
    ],
  },
];

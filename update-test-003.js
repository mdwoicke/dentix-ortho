const fs = require('fs');
const path = 'C:/Users/mwoic/PycharmProjects/PythonProject/dentix-ortho/test-agent/src/tests/scenarios/happy-path.ts';
let content = fs.readFileSync(path, 'utf8');

// Update HAPPY-003 to handle the insurance confirmation step
const oldText = `      {
        id: 'step-3-confirm-and-continue',
        description: 'Confirm details and continue',
        userMessage: 'Yes thats all correct. Her birthday is February 5, 2014. No special needs. My email is jane@email.com',
        expectedPatterns: [/available|time|schedule|alleghany|philadelphia|morning|afternoon/i],
        unexpectedPatterns: [patterns.error],
      },
      {
        id: 'step-4-select-time',
        description: 'Select appointment time',
        userMessage: 'Any morning next week works',
        expectedPatterns: [/available|time|monday|tuesday|would that work/i],
        unexpectedPatterns: [patterns.error],
      },
      {
        id: 'step-5-confirm-time',
        description: 'Confirm the appointment time',
        userMessage: 'Yes that works perfectly',
        expectedPatterns: [alliePatterns.confirmBooking, /scheduled|confirmed|booked/i],
        unexpectedPatterns: [patterns.error],
      },
      {
        id: 'step-6-closing',
        description: 'Close conversation',
        userMessage: 'No thank you, thats all',
        expectedPatterns: [/wonderful|goodbye|thank you|have a/i],
        unexpectedPatterns: [patterns.error],
      },`;

const newText = `      {
        id: 'step-3-confirm-and-continue',
        description: 'Confirm details and continue',
        userMessage: 'Yes thats all correct. Her birthday is February 5, 2014. No special needs. My email is jane@email.com',
        // Bot may ask about location, insurance confirmation, or time preference
        expectedPatterns: [/alleghany|philadelphia|insurance|confirm|keystone|time|morning|afternoon|available/i],
        unexpectedPatterns: [patterns.error],
      },
      {
        id: 'step-4-confirm-insurance',
        description: 'Confirm insurance and request time',
        userMessage: 'Yes Keystone First is correct. Any morning next week works for us',
        // Bot should check availability
        expectedPatterns: [/check|available|time|monday|tuesday|wednesday|moment|look/i],
        unexpectedPatterns: [patterns.error],
      },
      {
        id: 'step-5-select-time',
        description: 'Confirm the offered appointment time',
        userMessage: 'Yes that works perfectly',
        // Bot should confirm booking or continue with flow
        expectedPatterns: [/scheduled|confirmed|booked|appointment|got.*you|great|wonderful|all set|address/i],
        unexpectedPatterns: [patterns.error],
      },
      {
        id: 'step-6-closing',
        description: 'Close conversation',
        userMessage: 'No thank you, thats all',
        expectedPatterns: [/wonderful|goodbye|thank you|have a/i],
        unexpectedPatterns: [patterns.error],
      },`;

if (content.includes(oldText)) {
  content = content.replace(oldText, newText);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Updated HAPPY-003 to handle insurance confirmation step');
} else {
  console.log('Pattern not found for HAPPY-003 - checking current content...');
  // Show what's around step-3
  const idx = content.indexOf("id: 'step-3-confirm-and-continue'");
  if (idx > -1) {
    console.log('Found step-3 at index', idx);
    console.log('Content around it:', content.substring(idx, idx + 500));
  }
}

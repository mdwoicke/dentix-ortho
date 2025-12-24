const fs = require('fs');
const path = 'C:/Users/mwoic/PycharmProjects/PythonProject/dentix-ortho/test-agent/src/tests/scenarios/happy-path.ts';
let content = fs.readFileSync(path, 'utf8');

// Update HAPPY-001 step-14 to step-14-address-offer and add step-15-final
const oldText = `      {
        id: 'step-14-final',
        description: 'Respond to final questions',
        userMessage: 'No thats all, thank you',
        expectedPatterns: [/wonderful|goodbye|thank you|have a/i],
        unexpectedPatterns: [patterns.error],
      },
    ],

    expectations: [
      {
        type: 'conversation-complete',
        description: 'All steps should complete successfully for new patient booking',
      },`;

const newText = `      {
        id: 'step-14-address-offer',
        description: 'Respond to address offer after booking confirmation',
        userMessage: 'No thats all, thank you',
        // Bot may ask about address OR proceed to goodbye/anything else
        expectedPatterns: [/address|wonderful|goodbye|thank you|have a|anything else|help.*today/i],
        unexpectedPatterns: [patterns.error],
      },
      {
        id: 'step-15-final',
        description: 'Final goodbye',
        userMessage: 'No thank you, goodbye',
        expectedPatterns: [/wonderful|goodbye|thank you|have a/i],
        unexpectedPatterns: [patterns.error],
      },
    ],

    expectations: [
      {
        type: 'conversation-complete',
        description: 'All steps should complete successfully for new patient booking',
      },`;

if (content.includes(oldText)) {
  content = content.replace(oldText, newText);
  fs.writeFileSync(path, content, 'utf8');
  console.log('Updated HAPPY-001 with extra step for address offer');
} else {
  console.log('Pattern not found - file may have already been modified');
}

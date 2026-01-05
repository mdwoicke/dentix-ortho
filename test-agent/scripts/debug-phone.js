// Debug phone field detection
const msg = "Thank you, D-A-V-I-D W-I-L-S-O-N. What's the best phone number to reach you?";

// Phone patterns from category-classifier.ts
const phonePatterns = [
  /\b(what('s| is)|may I have|could I get)\s+(your\s+)?(phone|contact)\s*(number)?\b/i,
  /\bgood (phone|contact) number\b/i,
  /\bbest (phone|number|way) to reach you\b/i,
  /\bphone number\s+(to reach|for)\b/i,
  /\b(what('s| is)|may I have)\s+(the\s+)?(best\s+)?(phone|contact)\s*(number)?\b/i,
  /\bwhat('s| is)\s+\w+\s+phone\s*number\b/i,
];

console.log('Testing Turn 6 agent message:');
console.log('Message:', msg);
console.log('');

let matched = false;
phonePatterns.forEach((p, i) => {
  if (p.test(msg)) {
    matched = true;
    console.log('MATCHED pattern ' + (i+1) + ':', p.source.substring(0, 60));
  }
});

if (!matched) {
  console.log('NO PATTERNS MATCHED');
}

// Now simulate FIELD_TO_LEGACY_INTENT
const FIELD_TO_LEGACY_INTENT = {
  'caller_phone': 'asking_phone',
};
const INTENT_TO_FIELD = {
  'asking_phone': 'parent_phone',
};

console.log('');
console.log('Field chain:');
console.log('  dataField: caller_phone');
console.log('  -> intent:', FIELD_TO_LEGACY_INTENT['caller_phone']);
console.log('  -> field:', INTENT_TO_FIELD['asking_phone']);

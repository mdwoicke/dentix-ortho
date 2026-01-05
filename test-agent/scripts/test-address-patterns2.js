// Test new address detection patterns
const msg = "It's 2301 East Allegheny Avenue, Suite 300-M, in Philadelphia. You can park in the lot across the building marked Commonwealth Campus.";

const patterns = [
  /\b(the\s+)?address is\b/i,
  /\blocated at\b/i,
  /\boffice is at\b/i,
  /\bIt('s| is)\s+\d+\s+[\w\s]+?(Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way)\b/i,
  /\b\d+\s+[\w\s]+?(Avenue|Ave|Street|St|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Way).{0,20}(Suite|Ste|Unit|#)\s*\d+/i,
];

console.log('Testing message:', msg);
console.log('');

let matched = false;
patterns.forEach((p, i) => {
  if (p.test(msg)) {
    matched = true;
    console.log('MATCHED pattern ' + (i+1) + ':', p.source.substring(0, 80));
  }
});

if (!matched) {
  console.log('NO PATTERNS MATCHED');
}

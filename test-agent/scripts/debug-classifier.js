/**
 * Debug script to test classifier on specific agent responses
 */
const { CategoryClassifier } = require('../dist/services/category-classifier');

async function main() {
  const classifier = new CategoryClassifier({
    provider: 'openai',
    model: 'gpt-4o-mini',
    enableTier2: false, // Just test Tier 1 patterns
  });

  const testMessages = [
    // Turn 14 - offering time slot
    "You mentioned morning works best. The first available is Wednesday, January twenty-eighth at nine thirty AM. Does that work for you?",
    // Turn 15 - slot became unavailable
    "That time just became unavailable. Let me check for another morning option for you. Would you like me to look at the next available morning appointment?",
    // Turn 16 - offering another slot
    "I have Thursday, January twenty-ninth at ten thirty AM available. Does that work for you?",
    // Turn 17 - the problematic message with PAYLOAD
    `Let me verify that time for you.\n\nPAYLOAD:\n{"TC": "13", "state": "SCHEDULING", "appointmentGUID": null}`,
  ];

  console.log('Testing Tier 1 (pattern matching only) classification:');
  console.log('='.repeat(70));

  for (let i = 0; i < testMessages.length; i++) {
    const msg = testMessages[i];
    console.log(`\n--- Turn ${14 + i} ---`);
    console.log('Content:', msg.substring(0, 80) + (msg.length > 80 ? '...' : ''));

    try {
      const result = await classifier.classify(msg);
      console.log('Category:', result.category);
      console.log('Terminal State:', result.terminalState);
      console.log('Booking Confirmed This Turn:', result.bookingConfirmedThisTurn);
      console.log('Confidence:', result.confidence);
      if (result.matchedPattern) {
        console.log('Matched Pattern:', result.matchedPattern);
      }
    } catch (e) {
      console.log('Error:', e.message);
    }
  }
}

main().catch(console.error);

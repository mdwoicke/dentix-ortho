const transcript = [
  {"role":"assistant","content":"Hi! I'm Allie. I'd be happy to help you schedule an orthodontic appointment. What's your name?"},
  {"role":"assistant","content":"Got it, Sarah Johnson. Can you spell your full name for me? And what's the best phone number to reach you?"},
  {"role":"assistant","content":"Thank you, Sarah Johnson. What's the best phone number to reach you?"},
  {"role":"assistant","content":"Got it, two one five, five five five, one two three four. How many children are we scheduling today?"},
  {"role":"assistant","content":"Got it, one child. Has your child been to our office before?"},
  {"role":"assistant","content":"Thank you for letting me know. Has your child had braces or orthodontic treatment before?"},
  {"role":"assistant","content":"Got it, no previous orthodontic treatment. What's your child's name?"},
  {"role":"assistant","content":"Thank you, Emma Johnson. What's Emma's date of birth?"},
  {"role":"assistant","content":"Got it, March fourteenth, two thousand fourteen. We'll be scheduling at CDH Ortho Alleghany. What insurance do you have?"},
  {"role":"assistant","content":"Great, Keystone First is in-network! Do you have the group number and member ID handy?"},
  {"role":"assistant","content":"Thank you! Just remember to bring your insurance card to the appointment. Any special needs we should note for Emma?"},
  {"role":"assistant","content":"Thank you. And can you spell out your email address for me?"},
  {"role":"assistant","content":"Thank you! I have your email as sarah@email.com. Do you prefer morning or afternoon appointments?"},
  {"role":"assistant","content":"You mentioned morning works best. The first available is Wednesday, January twenty-eighth at nine thirty AM. Does that work for you?"},
  {"role":"assistant","content":"That time just became unavailable. Let me check for another morning option for you. Would you like me to look at the next available morning appointment?"},
  {"role":"assistant","content":"I have Thursday, January twenty-ninth at ten thirty AM available. Does that work for you?"},
  {"role":"assistant","content":"Let me verify that time for you.\n\nPAYLOAD:\n{\"appointmentGUID\": null}"},
];

// Booking confirmation patterns from category-classifier.ts
const patterns = [
  { name: 'Pattern 1', regex: /\b(you('re| are)|we('ve| have))\s+(all\s+)?(set|confirmed|scheduled|booked)\b/i },
  { name: 'Pattern 2', regex: /\byour appointment is (now\s+)?(confirmed|scheduled|booked)\b/i },
  { name: 'Pattern 3', regex: /\byou('re| are)\s+(all\s+)?(set|booked|scheduled)\b/i },
  { name: 'Pattern 4', regex: /\bwe('ve| have)\s+(scheduled|booked)\s+(you|your)\b/i },
  { name: 'Pattern 5', regex: /\b(is|are)\s+scheduled\s+for\b/i },
];

console.log('Checking agent responses for booking confirmation patterns:');
console.log('='.repeat(70));

let anyMatches = false;
transcript.forEach((msg, i) => {
  const matchedPatterns = [];
  for (const p of patterns) {
    if (p.regex.test(msg.content)) {
      matchedPatterns.push(p.name);
    }
  }

  if (matchedPatterns.length > 0) {
    anyMatches = true;
    console.log(`\nTurn ${i+1} - MATCHES FOUND:`);
    console.log('Content:', msg.content.substring(0, 150) + (msg.content.length > 150 ? '...' : ''));
    console.log('Matched patterns:', matchedPatterns.join(', '));
  }
});

if (!anyMatches) {
  console.log('\nNO BOOKING CONFIRMATION PATTERNS MATCHED!');
  console.log('This means the false positive was triggered by LLM classification (Tier 2)');
}

console.log('\n' + '='.repeat(70));
console.log('Checking for partial "scheduling" mentions...');
transcript.forEach((msg, i) => {
  if (/schedul/i.test(msg.content)) {
    console.log(`\nTurn ${i+1}: ${msg.content.substring(0, 100)}...`);
  }
});

// Test address follow-up patterns
const msg = 'Your appointment is confirmed! Sophia Lee is scheduled for Tuesday, January thirteenth at seven thirty AM at C D H Ortho Alleghany. Would you like the address?';

const patterns = [
  /would you like the address\s*\??\s*$/i,
  /want the address\s*\??\s*$/i,
  /like the address\s*\??\s*$/i,
  /\bwould you like (the|an?)\s*address\b/i,
  /\baddress\s*\?\s*$/i,
];

console.log('Testing message:', msg);
console.log('');

let matched = false;
patterns.forEach((p, i) => {
  if (p.test(msg)) {
    matched = true;
    console.log('MATCHED pattern ' + (i+1) + ':', p.source);
  }
});

if (!matched) {
  console.log('NO PATTERNS MATCHED');
}

// Also test the booking_confirmed pattern
const bookingPatterns = [
  /\b(is|are)\s+scheduled\s+for\b/i,
  /\bappointment\s+is\s+confirmed\b/i,
];

console.log('\nBooking patterns:');
bookingPatterns.forEach((p, i) => {
  if (p.test(msg)) {
    console.log('MATCHED booking pattern:', p.source);
  }
});

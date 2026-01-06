/**
 * End-to-end booking test via Flowise
 * Simulates a full conversation to book an appointment
 */

const FLOWISE_URL = 'https://app.c1elly.ai/api/v1/prediction/5f1fa57c-e6fd-463c-ac6e-c73fd5fb578b';

// Generate unique session ID
const SESSION_ID = `test-e2e-${Date.now()}`;

// Conversation state
let turnCount = 0;
const maxTurns = 25;

// Test persona data
const PERSONA = {
  parentName: 'TestParent E2E' + Date.now().toString().slice(-4),
  parentPhone: '555' + Date.now().toString().slice(-7),
  parentEmail: `test${Date.now()}@example.com`,
  childName: 'TestChild',
  childLastName: 'E2ETest' + Date.now().toString().slice(-4),
  childDOB: '03/15/2014',
  preferredDate: 'next week',
};

// Response patterns for different agent questions
const RESPONSE_MAP = [
  { pattern: /new patient|first time|ortho/i, response: 'Yes, new patient consultation' },
  { pattern: /speaking with|your name|who am i/i, response: PERSONA.parentName },
  { pattern: /seen.*before|been.*office/i, response: 'No, this is their first visit' },
  { pattern: /child.*name|patient.*name/i, response: `${PERSONA.childName} ${PERSONA.childLastName}` },
  { pattern: /date of birth|birthday|dob|how old/i, response: PERSONA.childDOB },
  { pattern: /phone|number|reach you|contact/i, response: PERSONA.parentPhone },
  { pattern: /email/i, response: PERSONA.parentEmail },
  { pattern: /when.*like|preferred.*date|what day|available/i, response: PERSONA.preferredDate },
  { pattern: /morning|afternoon|time preference/i, response: 'morning works best' },
  { pattern: /work.*for you|sound.*good|confirm|book.*that/i, response: 'Yes, that works perfectly' },
  { pattern: /anything else|other questions/i, response: 'No, that is all, thank you' },
  { pattern: /legal guardian|parent.*attend/i, response: 'Yes, I understand' },
  { pattern: /address|directions/i, response: 'No thanks, I have it' },
  { pattern: /insurance/i, response: 'We have dental insurance through Delta' },
  { pattern: /how many|children|kids/i, response: 'Just one child' },
  { pattern: /special needs|medical conditions/i, response: 'No special needs' },
];

function getResponse(agentMessage) {
  const lowerMessage = agentMessage.toLowerCase();

  for (const { pattern, response } of RESPONSE_MAP) {
    if (pattern.test(agentMessage)) {
      return response;
    }
  }

  // Default responses
  if (lowerMessage.includes('?')) {
    return 'Yes';
  }
  return 'Okay';
}

async function sendMessage(message) {
  turnCount++;
  console.log(`\n[Turn ${turnCount}] USER: ${message}`);

  const response = await fetch(FLOWISE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      question: message,
      overrideConfig: {
        sessionId: SESSION_ID,
      },
    }),
  });

  const data = await response.json();
  const agentResponse = data.text || data.answer || JSON.stringify(data);

  // Parse ANSWER from response
  const answerMatch = agentResponse.match(/ANSWER:\s*([\s\S]*?)(?:\n\nPAYLOAD:|$)/);
  const answer = answerMatch ? answerMatch[1].trim() : agentResponse;

  // Parse PAYLOAD
  const payloadMatch = agentResponse.match(/PAYLOAD:\s*(\{[\s\S]*\})/);
  let payload = null;
  if (payloadMatch) {
    try {
      payload = JSON.parse(payloadMatch[1]);
    } catch (e) {
      // Ignore parse errors
    }
  }

  console.log(`[Turn ${turnCount}] AGENT: ${answer}`);

  // Check for booking confirmation
  if (payload?.Call_Summary?.Child1_appointmentId ||
      answer.toLowerCase().includes('appointment is confirmed') ||
      answer.toLowerCase().includes('booked') ||
      answer.toLowerCase().includes('scheduled')) {
    console.log('\n✓ BOOKING DETECTED!');
    if (payload?.Call_Summary) {
      console.log('Call Summary:', JSON.stringify(payload.Call_Summary, null, 2));
    }
    return { answer, payload, bookingDetected: true };
  }

  // Check for transfer
  if (payload?.telephonyDisconnectCall ||
      answer.toLowerCase().includes('connecting you') ||
      answer.toLowerCase().includes('transfer')) {
    console.log('\n⚠️  TRANSFER TRIGGERED');
    if (payload?.Call_Summary) {
      console.log('Transfer Reason:', payload.Call_Summary.Escalation_Intent || 'Unknown');
    }
    return { answer, payload, transferred: true };
  }

  return { answer, payload };
}

async function runE2ETest() {
  console.log('═'.repeat(60));
  console.log('END-TO-END BOOKING TEST VIA FLOWISE');
  console.log('═'.repeat(60));
  console.log(`Session: ${SESSION_ID}`);
  console.log(`Persona: ${PERSONA.parentName} booking for ${PERSONA.childName}`);
  console.log('');

  // Initial message
  let result = await sendMessage('Hi I need to schedule an orthodontic appointment for my child');

  // Continue conversation
  while (turnCount < maxTurns) {
    if (result.bookingDetected) {
      console.log('\n' + '═'.repeat(60));
      console.log('✓ TEST PASSED - BOOKING COMPLETED');
      console.log('═'.repeat(60));
      return true;
    }

    if (result.transferred) {
      console.log('\n' + '═'.repeat(60));
      console.log('✗ TEST FAILED - TRANSFERRED BEFORE BOOKING');
      console.log('═'.repeat(60));
      return false;
    }

    // Generate response based on agent's question
    const userResponse = getResponse(result.answer);

    // Wait a bit to avoid rate limiting
    await new Promise(r => setTimeout(r, 1000));

    result = await sendMessage(userResponse);
  }

  console.log('\n' + '═'.repeat(60));
  console.log('✗ TEST FAILED - MAX TURNS REACHED');
  console.log('═'.repeat(60));
  return false;
}

runE2ETest().catch(console.error);

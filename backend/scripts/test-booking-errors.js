/**
 * Test enhanced error logging with failure scenarios
 */

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const AUTH = {
  username: 'workflowapi',
  password: 'e^@V95&6sAJReTsb5!iq39mIC4HYIV'
};

async function makeRequest(endpoint, body) {
  const authHeader = 'Basic ' + Buffer.from(`${AUTH.username}:${AUTH.password}`).toString('base64');
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify(body)
  });
  return response.json();
}

async function testErrorScenarios() {
  console.log('═'.repeat(60));
  console.log('ERROR SCENARIO TESTS - Enhanced Error Logging');
  console.log('═'.repeat(60));

  // Get a valid slot first
  const slotsResult = await makeRequest('/ortho/getApptSlots', {
    uui: 'ERROR-TEST',
    startDate: '01/13/2026',
    endDate: '02/28/2026'
  });
  const slot = slotsResult.slots?.[0];

  if (!slot) {
    console.log('No slots available for testing');
    return;
  }

  // Test 1: Invalid Patient GUID
  console.log('\n\n' + '─'.repeat(60));
  console.log('TEST 1: Invalid Patient GUID');
  console.log('─'.repeat(60));

  const result1 = await makeRequest('/ortho/createAppt', {
    uui: 'ERROR-TEST-1',
    patientGUID: 'INVALID-PATIENT-GUID-12345',
    startTime: slot.startTime,
    scheduleViewGUID: slot.scheduleViewGUID,
    scheduleColumnGUID: slot.scheduleColumnGUID,
    appointmentTypeGUID: slot.appointmentTypeGUID,
    minutes: slot.minutes
  });

  console.log('Success:', result1.success);
  console.log('Message:', result1.message);
  if (result1._debug) {
    console.log('\n_debug:');
    console.log('  error_type:', result1._debug.error_type);
    console.log('  cloud9_result:', result1._debug.cloud9_result);
  }
  if (result1.llm_guidance) {
    console.log('\nllm_guidance:');
    console.log('  action_required:', result1.llm_guidance.action_required);
    if (result1.llm_guidance.CRITICAL) {
      console.log('  CRITICAL:', result1.llm_guidance.CRITICAL);
    }
  }

  // Test 2: Missing patientGUID
  console.log('\n\n' + '─'.repeat(60));
  console.log('TEST 2: Missing Patient GUID');
  console.log('─'.repeat(60));

  const result2 = await makeRequest('/ortho/createAppt', {
    uui: 'ERROR-TEST-2',
    // patientGUID intentionally missing
    startTime: slot.startTime,
    scheduleViewGUID: slot.scheduleViewGUID,
    scheduleColumnGUID: slot.scheduleColumnGUID
  });

  console.log('Success:', result2.success);
  console.log('Message:', result2.message);
  if (result2._debug) {
    console.log('\n_debug:');
    console.log('  error_type:', result2._debug.error_type);
    console.log('  missing_fields:', result2._debug.missing_fields);
  }

  // Test 3: Missing slot data
  console.log('\n\n' + '─'.repeat(60));
  console.log('TEST 3: Missing Slot Data (scheduleViewGUID)');
  console.log('─'.repeat(60));

  const result3 = await makeRequest('/ortho/createAppt', {
    uui: 'ERROR-TEST-3',
    patientGUID: '91AAFEB4-AC9A-4D80-BE0D-F6FD463E17C0',
    startTime: slot.startTime,
    // scheduleViewGUID intentionally missing
    scheduleColumnGUID: slot.scheduleColumnGUID
  });

  console.log('Success:', result3.success);
  console.log('Message:', result3.message);
  if (result3._debug) {
    console.log('\n_debug:');
    console.log('  error_type:', result3._debug.error_type);
    console.log('  missing_fields:', result3._debug.missing_fields);
  }

  // Summary
  console.log('\n\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  console.log(`
Test 1 (Invalid Patient): error_type = ${result1._debug?.error_type || 'N/A'}
Test 2 (Missing Patient): error_type = ${result2._debug?.error_type || 'N/A'}
Test 3 (Missing Slot):    error_type = ${result3._debug?.error_type || 'N/A'}
`);

  if (result1._debug?.error_type === 'PATIENT_NOT_FOUND') {
    console.log('✓ PATIENT_NOT_FOUND detection is WORKING');
  } else {
    console.log('⚠️  PATIENT_NOT_FOUND detection needs verification');
  }
}

testErrorScenarios().catch(console.error);

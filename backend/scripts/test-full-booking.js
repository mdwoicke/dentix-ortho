/**
 * Full booking flow test - Create patient, get slots, book appointment
 * Tests the updated createAppt with enhanced error logging
 */

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const AUTH = {
  username: 'workflowapi',
  password: 'e^@V95&6sAJReTsb5!iq39mIC4HYIV'
};

const TEST_UUI = 'TEST-' + Date.now() + '|test-booking-flow';

async function makeRequest(endpoint, body) {
  const authHeader = 'Basic ' + Buffer.from(`${AUTH.username}:${AUTH.password}`).toString('base64');

  console.log(`\n→ POST ${endpoint}`);
  console.log('  Body:', JSON.stringify(body, null, 2).split('\n').map(l => '  ' + l).join('\n'));

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': authHeader
    },
    body: JSON.stringify(body)
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  console.log(`\n← Response (${response.status}):`);
  console.log(JSON.stringify(data, null, 2).split('\n').slice(0, 30).join('\n'));
  if (JSON.stringify(data, null, 2).split('\n').length > 30) {
    console.log('  ... (truncated)');
  }

  return { status: response.status, data };
}

async function testFullBookingFlow() {
  console.log('═'.repeat(70));
  console.log('FULL BOOKING FLOW TEST');
  console.log('Testing updated createAppt with enhanced error logging');
  console.log('═'.repeat(70));

  // Generate unique test data
  const testChild = {
    firstName: 'TestChild',
    lastName: 'BookingTest' + Date.now().toString().slice(-4),
    dateOfBirth: '01/15/2015'
  };

  const testCaller = {
    firstName: 'TestParent',
    lastName: testChild.lastName,
    phone: '5551234567',
    email: `test${Date.now()}@example.com`
  };

  // STEP 1: Create Patient
  console.log('\n\n' + '─'.repeat(70));
  console.log('STEP 1: CREATE PATIENT');
  console.log('─'.repeat(70));

  const createPatientResult = await makeRequest('/ortho/createPatient', {
    uui: TEST_UUI,
    patientFirstName: testChild.firstName,
    patientLastName: testChild.lastName,
    patientDateOfBirth: testChild.dateOfBirth,
    responsiblePartyFirstName: testCaller.firstName,
    responsiblePartyLastName: testCaller.lastName,
    phone: testCaller.phone,
    email: testCaller.email
  });

  const patientGUID = createPatientResult.data?.patientGUID;

  if (!patientGUID) {
    console.log('\n❌ FAILED: Could not create patient');
    console.log('Response:', JSON.stringify(createPatientResult.data, null, 2));
    return;
  }

  console.log(`\n✓ Patient created: ${patientGUID}`);

  // STEP 2: Get Available Slots
  console.log('\n\n' + '─'.repeat(70));
  console.log('STEP 2: GET AVAILABLE SLOTS');
  console.log('─'.repeat(70));

  const slotsResult = await makeRequest('/ortho/getApptSlots', {
    uui: TEST_UUI,
    startDate: '01/13/2026',
    endDate: '02/28/2026'
  });

  const slots = slotsResult.data?.slots || [];

  if (slots.length === 0) {
    console.log('\n❌ FAILED: No slots available');
    return;
  }

  console.log(`\n✓ Found ${slots.length} slots`);

  // Pick a slot
  const selectedSlot = slots[0];
  console.log('\nSelected slot:');
  console.log(`  Time: ${selectedSlot.startTime || selectedSlot.StartTime}`);
  console.log(`  Location: ${selectedSlot.ScheduleViewDescription}`);
  console.log(`  ScheduleViewGUID: ${selectedSlot.scheduleViewGUID || selectedSlot.ScheduleViewGUID}`);
  console.log(`  ScheduleColumnGUID: ${selectedSlot.scheduleColumnGUID || selectedSlot.ScheduleColumnGUID}`);

  // STEP 3: Book Appointment
  console.log('\n\n' + '─'.repeat(70));
  console.log('STEP 3: BOOK APPOINTMENT (testing enhanced error logging)');
  console.log('─'.repeat(70));

  const bookResult = await makeRequest('/ortho/createAppt', {
    uui: TEST_UUI,
    patientGUID: patientGUID,
    childName: `${testChild.firstName} ${testChild.lastName}`,
    startTime: selectedSlot.startTime || selectedSlot.StartTime,
    scheduleViewGUID: selectedSlot.scheduleViewGUID || selectedSlot.ScheduleViewGUID,
    scheduleColumnGUID: selectedSlot.scheduleColumnGUID || selectedSlot.ScheduleColumnGUID,
    appointmentTypeGUID: selectedSlot.appointmentTypeGUID || selectedSlot.AppointmentTypeGUID,
    minutes: selectedSlot.minutes || selectedSlot.Minutes || 45
  });

  // STEP 4: Analyze Results
  console.log('\n\n' + '═'.repeat(70));
  console.log('RESULTS');
  console.log('═'.repeat(70));

  const bookData = bookResult.data;

  console.log(`\nBooking Success: ${bookData.success ? '✓ YES' : '✗ NO'}`);
  console.log(`Message: ${bookData.message || '(empty)'}`);

  if (bookData.appointmentGUID) {
    console.log(`Appointment GUID: ${bookData.appointmentGUID}`);
  }

  // Check for enhanced debug info
  if (bookData._debug) {
    console.log('\n_debug object (NEW - enhanced error logging):');
    console.log(JSON.stringify(bookData._debug, null, 2));
  } else {
    console.log('\n⚠️  No _debug object in response - update may not be deployed yet');
  }

  if (bookData.llm_guidance) {
    console.log('\nLLM Guidance:');
    console.log(`  action_required: ${bookData.llm_guidance.action_required}`);
    if (bookData.llm_guidance.CRITICAL) {
      console.log(`  CRITICAL: ${bookData.llm_guidance.CRITICAL}`);
    }
    if (bookData.llm_guidance.recovery_steps) {
      console.log(`  recovery_steps: ${bookData.llm_guidance.recovery_steps.join(', ')}`);
    }
  }

  // Summary
  console.log('\n\n' + '─'.repeat(70));
  console.log('SUMMARY');
  console.log('─'.repeat(70));

  if (bookData.success) {
    console.log('\n✓ BOOKING SUCCESSFUL!');
    console.log(`  Patient: ${testChild.firstName} ${testChild.lastName}`);
    console.log(`  Time: ${selectedSlot.startTime || selectedSlot.StartTime}`);
    console.log(`  Appointment: ${bookData.appointmentGUID}`);
  } else {
    console.log('\n✗ BOOKING FAILED');
    if (bookData._debug?.error_type) {
      console.log(`  Error Type: ${bookData._debug.error_type}`);
      console.log(`  Cloud9 Result: ${bookData._debug.cloud9_result}`);
    }
  }

  // Verify _debug is present (confirms update deployed)
  if (bookData._debug) {
    console.log('\n✓ Enhanced error logging is WORKING (_debug present)');
  } else {
    console.log('\n⚠️  Enhanced error logging NOT detected');
    console.log('   The Node-RED update may not be deployed to production yet.');
    console.log('   Deploy the updated nodered_Cloud9_flows.json to production Node-RED.');
  }
}

testFullBookingFlow().catch(console.error);

/**
 * E2E Booking Flow Test Script
 *
 * Tests the complete appointment booking flow:
 * 1. Patient lookup by phone
 * 2. Patient creation (if not found)
 * 3. Get available slots
 * 4. Book appointment
 * 5. Verify appointment was created
 * 6. Cancel appointment (cleanup)
 *
 * Run with: node scripts/test-e2e-booking-flow.js
 */

const https = require('https');

// ============================================================================
// CONFIGURATION
// ============================================================================

// CORRECT Node-RED endpoints (with /ortho-prd/)
const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd';

const ENDPOINTS = {
  patientLookup: `${BASE_URL}/getPatientByFilter`,
  patientGet: `${BASE_URL}/getPatient`,
  patientCreate: `${BASE_URL}/createPatient`,
  patientAppts: `${BASE_URL}/getPatientAppts`,
  slots: `${BASE_URL}/getApptSlots`,
  groupedSlots: `${BASE_URL}/getGroupedApptSlots`,
  createAppt: `${BASE_URL}/createAppt`,
  cancelAppt: `${BASE_URL}/cancelAppt`,
  location: `${BASE_URL}/getLocation`,
  confirmAppt: `${BASE_URL}/confirmAppt`,
};

// Auth header
const AUTH_HEADER = 'Basic ' + Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

// Test UUI (used by Node-RED for context)
const TEST_UUI = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

// Default GUIDs (from Node-RED env)
const DEFAULT_LOCATION_GUID = '799d413a-5e1a-46a2-b169-e2108bf517d6';  // CDH - Allegheny 300M
const DEFAULT_PROVIDER_GUID = 'a79ec244-9503-44b2-87e4-5920b6e60392';  // Default Orthodontist
const DEFAULT_APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705'; // Default Appt Type

// Test data
const TEST_PATIENT = {
  firstName: 'E2ETest',
  lastName: `Patient${Date.now()}`,  // Unique name for each test run
  birthday: '01/15/2015',
  phone: '3035551234',
  email: 'e2etest@example.com',
  gender: 'M',
};

// ============================================================================
// HTTP HELPER
// ============================================================================

function makeRequest(url, body) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const postData = JSON.stringify(body);

    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
        'Authorization': AUTH_HEADER,
      },
      timeout: 60000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          parsed = data;
        }
        resolve({
          statusCode: res.statusCode,
          success: res.statusCode >= 200 && res.statusCode < 300,
          data: parsed,
          raw: data,
        });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.write(postData);
    req.end();
  });
}

function formatDate(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function log(step, message, data = null) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] [${step}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// ============================================================================
// TEST STEPS
// ============================================================================

async function step1_lookupPatient() {
  log('STEP 1', '📞 Looking up patient by name...');

  const result = await makeRequest(ENDPOINTS.patientLookup, {
    uui: TEST_UUI,
    filter: 'CLITest',  // Looking for existing test patients
    locationGUID: DEFAULT_LOCATION_GUID,
  });

  if (!result.success) {
    log('STEP 1', '❌ Lookup failed', { status: result.statusCode, body: result.data });
    return { success: false, patients: [] };
  }

  const patients = result.data.patients || [];
  log('STEP 1', `✅ Found ${patients.length} patients`);

  if (patients.length > 0) {
    log('STEP 1', 'First patient:', patients[0]);
  }

  return { success: true, patients };
}

async function step2_createPatient() {
  log('STEP 2', '➕ Creating new test patient...');

  const result = await makeRequest(ENDPOINTS.patientCreate, {
    uui: TEST_UUI,
    patientFirstName: TEST_PATIENT.firstName,
    patientLastName: TEST_PATIENT.lastName,
    birthdayDateTime: TEST_PATIENT.birthday,
    phoneNumber: TEST_PATIENT.phone,
    emailAddress: TEST_PATIENT.email,
    gender: TEST_PATIENT.gender,
    providerGUID: DEFAULT_PROVIDER_GUID,
    locationGUID: DEFAULT_LOCATION_GUID,
  });

  if (!result.success || !result.data.success) {
    log('STEP 2', '❌ Patient creation failed', result.data);
    return { success: false, patientGUID: null };
  }

  const patientGUID = result.data.patientGUID;
  log('STEP 2', `✅ Patient created: ${patientGUID}`);
  log('STEP 2', 'Full response:', result.data);

  return { success: true, patientGUID };
}

async function step3_getSlots() {
  log('STEP 3', '📅 Getting available appointment slots...');

  // Cloud9 sandbox requires dates >= Jan 13, 2026
  const SANDBOX_MIN_DATE = new Date(2026, 0, 13); // January 13, 2026
  const today = new Date();
  const minStart = today > SANDBOX_MIN_DATE ? today : SANDBOX_MIN_DATE;
  const startDate = formatDate(new Date(minStart.getTime() + 24 * 60 * 60 * 1000)); // Day after min
  const endDate = formatDate(new Date(minStart.getTime() + 28 * 24 * 60 * 60 * 1000)); // 28 days out

  const result = await makeRequest(ENDPOINTS.slots, {
    uui: TEST_UUI,
    startDate,
    endDate,
  });

  if (!result.success) {
    log('STEP 3', '❌ Get slots failed', { status: result.statusCode, body: result.data });
    return { success: false, slots: [] };
  }

  const slots = result.data.slots || [];
  log('STEP 3', `✅ Found ${slots.length} available slots`);

  if (slots.length > 0) {
    const firstSlot = slots[0];
    log('STEP 3', 'First available slot:', {
      startTime: firstSlot.StartTime || firstSlot.startTime,
      scheduleViewGUID: firstSlot.ScheduleViewGUID || firstSlot.scheduleViewGUID,
      scheduleColumnGUID: firstSlot.ScheduleColumnGUID || firstSlot.scheduleColumnGUID,
      minutes: firstSlot.Minutes || firstSlot.minutes,
      appointmentTypeGUID: firstSlot.AppointmentTypeGUID || firstSlot.appointmentTypeGUID,
    });
  }

  return { success: slots.length > 0, slots };
}

async function step4_bookAppointment(patientGUID, slot) {
  log('STEP 4', '📝 Booking appointment...');

  const bookingData = {
    uui: TEST_UUI,
    patientGUID: patientGUID,
    startTime: slot.StartTime || slot.startTime,
    scheduleViewGUID: slot.ScheduleViewGUID || slot.scheduleViewGUID,
    scheduleColumnGUID: slot.ScheduleColumnGUID || slot.scheduleColumnGUID,
    appointmentTypeGUID: slot.AppointmentTypeGUID || slot.appointmentTypeGUID || DEFAULT_APPT_TYPE_GUID,
    minutes: parseInt(slot.Minutes || slot.minutes || '45'),
    childName: `${TEST_PATIENT.firstName} ${TEST_PATIENT.lastName}`,
  };

  log('STEP 4', 'Booking request:', bookingData);

  const result = await makeRequest(ENDPOINTS.createAppt, bookingData);

  if (!result.success) {
    log('STEP 4', '❌ Booking HTTP request failed', { status: result.statusCode, body: result.data });
    return { success: false, appointmentGUID: null, debug: result.data };
  }

  if (!result.data.success) {
    log('STEP 4', '❌ Booking API returned failure', result.data);
    return { success: false, appointmentGUID: null, debug: result.data };
  }

  const appointmentGUID = result.data.appointmentGUID;
  log('STEP 4', `✅ Appointment booked: ${appointmentGUID}`);
  log('STEP 4', 'Full response:', result.data);

  return { success: true, appointmentGUID, debug: result.data };
}

async function step5_verifyAppointment(patientGUID) {
  log('STEP 5', '🔍 Verifying appointment was created...');

  const result = await makeRequest(ENDPOINTS.patientAppts, {
    uui: TEST_UUI,
    patientGUID: patientGUID,
  });

  if (!result.success) {
    log('STEP 5', '❌ Get appointments failed', { status: result.statusCode, body: result.data });
    return { success: false, appointments: [] };
  }

  const appointments = result.data.appointments || [];
  log('STEP 5', `✅ Found ${appointments.length} appointments for patient`);

  if (appointments.length > 0) {
    log('STEP 5', 'Most recent appointment:', appointments[0]);
  }

  return { success: appointments.length > 0, appointments };
}

async function step6_cancelAppointment(appointmentGUID) {
  log('STEP 6', '🗑️ Canceling appointment (cleanup)...');

  const result = await makeRequest(ENDPOINTS.cancelAppt, {
    uui: TEST_UUI,
    appointmentGUID: appointmentGUID,
  });

  if (!result.success) {
    log('STEP 6', '❌ Cancel request failed', { status: result.statusCode, body: result.data });
    return { success: false };
  }

  if (!result.data.success) {
    log('STEP 6', '⚠️ Cancel API returned failure (may already be canceled)', result.data);
    return { success: false };
  }

  log('STEP 6', '✅ Appointment canceled');
  return { success: true };
}

async function testGroupedSlots() {
  log('BONUS', '👨‍👩‍👧‍👦 Testing grouped slots for siblings...');

  // Cloud9 sandbox requires dates >= Jan 13, 2026
  const SANDBOX_MIN_DATE = new Date(2026, 0, 13);
  const today = new Date();
  const minStart = today > SANDBOX_MIN_DATE ? today : SANDBOX_MIN_DATE;
  const startDate = formatDate(new Date(minStart.getTime() + 24 * 60 * 60 * 1000));
  const endDate = formatDate(new Date(minStart.getTime() + 28 * 24 * 60 * 60 * 1000));

  const result = await makeRequest(ENDPOINTS.groupedSlots, {
    uui: TEST_UUI,
    startDate,
    endDate,
    numberOfPatients: 2,
    timeWindowMinutes: 30,
  });

  if (!result.success) {
    log('BONUS', '❌ Grouped slots request failed', { status: result.statusCode });
    return { success: false, groups: [] };
  }

  const groups = result.data.groups || [];
  log('BONUS', `✅ Found ${groups.length} grouped slot options for 2 siblings`);

  if (groups.length > 0) {
    log('BONUS', 'First group:', groups[0]);
  }

  return { success: true, groups };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║              E2E BOOKING FLOW TEST                                     ║');
  console.log('║                                                                        ║');
  console.log('║  Tests: Lookup → Create Patient → Get Slots → Book → Verify → Cancel  ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');
  console.log(`\nBase URL: ${BASE_URL}`);
  console.log(`Test Patient: ${TEST_PATIENT.firstName} ${TEST_PATIENT.lastName}`);
  console.log(`Default Location: ${DEFAULT_LOCATION_GUID}`);
  console.log(`Default Provider: ${DEFAULT_PROVIDER_GUID}`);
  console.log('\n');

  const results = {
    step1_lookup: false,
    step2_create: false,
    step3_slots: false,
    step4_book: false,
    step5_verify: false,
    step6_cancel: false,
    bonus_grouped: false,
  };

  let patientGUID = null;
  let appointmentGUID = null;

  try {
    // Step 1: Lookup existing patients
    const lookupResult = await step1_lookupPatient();
    results.step1_lookup = lookupResult.success;
    console.log('\n' + '-'.repeat(70) + '\n');

    // Step 2: Create a new test patient
    const createResult = await step2_createPatient();
    results.step2_create = createResult.success;
    patientGUID = createResult.patientGUID;
    console.log('\n' + '-'.repeat(70) + '\n');

    if (!patientGUID) {
      log('ERROR', '❌ Cannot continue without patient GUID');
      throw new Error('Patient creation failed');
    }

    // Step 3: Get available slots
    const slotsResult = await step3_getSlots();
    results.step3_slots = slotsResult.success;
    console.log('\n' + '-'.repeat(70) + '\n');

    if (!slotsResult.slots.length) {
      log('ERROR', '❌ No slots available - cannot test booking');
      throw new Error('No slots available');
    }

    // Step 4: Book an appointment
    const bookResult = await step4_bookAppointment(patientGUID, slotsResult.slots[0]);
    results.step4_book = bookResult.success;
    appointmentGUID = bookResult.appointmentGUID;
    console.log('\n' + '-'.repeat(70) + '\n');

    // Step 5: Verify the appointment exists
    const verifyResult = await step5_verifyAppointment(patientGUID);
    results.step5_verify = verifyResult.success;
    console.log('\n' + '-'.repeat(70) + '\n');

    // Step 6: Cancel the appointment (cleanup)
    if (appointmentGUID) {
      const cancelResult = await step6_cancelAppointment(appointmentGUID);
      results.step6_cancel = cancelResult.success;
    }
    console.log('\n' + '-'.repeat(70) + '\n');

    // Bonus: Test grouped slots
    const groupedResult = await testGroupedSlots();
    results.bonus_grouped = groupedResult.success;

  } catch (error) {
    log('ERROR', `Test aborted: ${error.message}`);
  }

  // Summary
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           TEST RESULTS                                 ║');
  console.log('╚════════════════════════════════════════════════════════════════════════╝');
  console.log('\n');

  const statusIcon = (success) => success ? '✅' : '❌';

  console.log(`  Step 1 - Patient Lookup:      ${statusIcon(results.step1_lookup)}`);
  console.log(`  Step 2 - Patient Creation:    ${statusIcon(results.step2_create)}`);
  console.log(`  Step 3 - Get Slots:           ${statusIcon(results.step3_slots)}`);
  console.log(`  Step 4 - Book Appointment:    ${statusIcon(results.step4_book)}`);
  console.log(`  Step 5 - Verify Appointment:  ${statusIcon(results.step5_verify)}`);
  console.log(`  Step 6 - Cancel Appointment:  ${statusIcon(results.step6_cancel)}`);
  console.log(`  Bonus  - Grouped Slots:       ${statusIcon(results.bonus_grouped)}`);

  const passCount = Object.values(results).filter(Boolean).length;
  const totalCount = Object.values(results).length;
  const passRate = Math.round((passCount / totalCount) * 100);

  console.log('\n');
  console.log(`  Overall: ${passCount}/${totalCount} tests passed (${passRate}%)`);
  console.log('\n');

  if (passCount === totalCount) {
    console.log('🎉 All tests passed! The E2E booking flow is working correctly.');
  } else {
    console.log('⚠️ Some tests failed. Review the logs above for details.');
  }

  console.log('\n');

  // Return results for programmatic use
  return results;
}

main().catch(console.error);

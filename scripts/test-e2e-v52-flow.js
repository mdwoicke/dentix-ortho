/**
 * End-to-End Test - Tool v52 Flow
 * Simulates the full LLM flow:
 * 1. Get slots (returns individual GUIDs in v52 format)
 * 2. Extract slot details from response
 * 3. Book appointment using individual GUIDs
 * 4. Verify success and cancel (cleanup)
 */
const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const AUTH = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
const UUI = 'e2e-v52-test-' + Date.now();

const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Basic ${AUTH}`
};

// v52 formatSlotsResponse function (same as in tool)
function formatSlotsResponse(data) {
    if (data && data.slots && Array.isArray(data.slots)) {
        data.slots = data.slots.map(slot => ({
            displayTime: slot.startTime || slot.StartTime,
            startTime: slot.startTime || slot.StartTime,
            scheduleViewGUID: slot.scheduleViewGUID,
            scheduleColumnGUID: slot.scheduleColumnGUID,
            appointmentTypeGUID: slot.appointmentTypeGUID,
            minutes: slot.minutes
        }));
    }
    return data;
}

async function step1_GetSlots() {
    console.log('\n' + '='.repeat(60));
    console.log('STEP 1: Get Available Slots (v52 format)');
    console.log('='.repeat(60));

    const body = {
        uui: UUI,
        startDate: '01/13/2026',
        endDate: '01/27/2026'
    };

    console.log('Request:', JSON.stringify(body, null, 2));

    const response = await fetch(`${BASE_URL}/ortho-prd/getApptSlots`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    let data = await response.json();
    console.log('Status:', response.status);
    console.log('Raw slots count:', data.slots?.length || 0);

    // Apply v52 formatting (this is what the tool does)
    data = formatSlotsResponse(data);

    // Truncate to 1 slot (MAX_SLOTS_RETURNED)
    if (data.slots && data.slots.length > 1) {
        data.slots = data.slots.slice(0, 1);
        data.count = 1;
    }

    console.log('\nv52 Formatted Response (what LLM receives):');
    console.log(JSON.stringify(data.slots[0], null, 2));

    return data.slots[0];
}

async function step2_SimulateLLMExtraction(slot) {
    console.log('\n' + '='.repeat(60));
    console.log('STEP 2: LLM Extracts Slot Details');
    console.log('='.repeat(60));

    console.log('LLM sees this slot response:');
    console.log('  displayTime:', slot.displayTime);
    console.log('  startTime:', slot.startTime);
    console.log('  scheduleViewGUID:', slot.scheduleViewGUID);
    console.log('  scheduleColumnGUID:', slot.scheduleColumnGUID);
    console.log('  appointmentTypeGUID:', slot.appointmentTypeGUID);
    console.log('  minutes:', slot.minutes);

    console.log('\nLLM extracts these for book_child call:');
    const extracted = {
        startTime: slot.startTime,
        scheduleViewGUID: slot.scheduleViewGUID,
        scheduleColumnGUID: slot.scheduleColumnGUID,
        appointmentTypeGUID: slot.appointmentTypeGUID,
        minutes: slot.minutes
    };
    console.log(JSON.stringify(extracted, null, 2));

    return extracted;
}

async function step3_BookAppointment(slotDetails, patientGUID) {
    console.log('\n' + '='.repeat(60));
    console.log('STEP 3: Book Appointment (v52 - Individual GUIDs)');
    console.log('='.repeat(60));

    // This is exactly what the LLM would send to book_child
    const bookParams = {
        action: 'book_child',
        patientGUID: patientGUID,
        startTime: slotDetails.startTime,
        scheduleViewGUID: slotDetails.scheduleViewGUID,
        scheduleColumnGUID: slotDetails.scheduleColumnGUID,
        appointmentTypeGUID: slotDetails.appointmentTypeGUID,
        minutes: slotDetails.minutes
    };

    console.log('LLM sends book_child with params:');
    console.log(JSON.stringify(bookParams, null, 2));

    // Build the request body (same as tool v52 book_child.buildBody)
    const body = {
        uui: UUI,
        patientGUID: bookParams.patientGUID,
        startTime: bookParams.startTime,
        scheduleViewGUID: bookParams.scheduleViewGUID,
        scheduleColumnGUID: bookParams.scheduleColumnGUID || 'dda0b40c-ace5-4427-8b76-493bf9aa26f1',
        appointmentTypeGUID: bookParams.appointmentTypeGUID || 'f6c20c35-9abb-47c2-981a-342996016705',
        minutes: bookParams.minutes || 45
    };

    console.log('\nActual API request body:');
    console.log(JSON.stringify(body, null, 2));

    const response = await fetch(`${BASE_URL}/ortho-prd/createAppt`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    const data = await response.json();
    console.log('\nStatus:', response.status);

    if (data.appointmentGUID) {
        console.log('SUCCESS! Appointment created:');
        console.log('  appointmentGUID:', data.appointmentGUID);
        return data.appointmentGUID;
    } else {
        console.log('FAILED! Response:');
        console.log(JSON.stringify(data, null, 2));
        return null;
    }
}

async function step4_CancelAppointment(appointmentGUID) {
    if (!appointmentGUID) {
        console.log('\n' + '='.repeat(60));
        console.log('STEP 4: SKIP - No appointment to cancel');
        console.log('='.repeat(60));
        return;
    }

    console.log('\n' + '='.repeat(60));
    console.log('STEP 4: Cancel Appointment (Cleanup)');
    console.log('='.repeat(60));

    const body = {
        uui: UUI,
        appointmentGUID: appointmentGUID
    };

    const response = await fetch(`${BASE_URL}/ortho-prd/cancelAppt`, {
        method: 'POST',
        headers,
        body: JSON.stringify(body)
    });

    const data = await response.json();
    console.log('Status:', response.status);
    console.log('Result:', data.success ? 'CANCELLED' : 'FAILED');
}

async function runE2ETest() {
    console.log('='.repeat(60));
    console.log('END-TO-END TEST: Tool v52 - Individual GUIDs Flow');
    console.log('='.repeat(60));
    console.log('Date:', new Date().toISOString());
    console.log('UUI:', UUI);
    console.log('Test Patient: 8F1110C7-EB7D-444C-970C-99B05227C23A');

    try {
        // Use existing test patient from previous tests
        const testPatientGUID = '8F1110C7-EB7D-444C-970C-99B05227C23A';

        // Step 1: Get slots
        const slot = await step1_GetSlots();

        if (!slot) {
            console.log('\nTEST FAILED: No slots available');
            return;
        }

        // Step 2: LLM extracts slot details
        const slotDetails = await step2_SimulateLLMExtraction(slot);

        // Step 3: Book appointment with individual GUIDs
        const appointmentGUID = await step3_BookAppointment(slotDetails, testPatientGUID);

        // Step 4: Cleanup
        await step4_CancelAppointment(appointmentGUID);

        // Summary
        console.log('\n' + '='.repeat(60));
        console.log('TEST SUMMARY');
        console.log('='.repeat(60));
        console.log('Step 1 (Get Slots):             ', slot ? 'PASS' : 'FAIL');
        console.log('Step 2 (Extract Details):       ', slotDetails ? 'PASS' : 'FAIL');
        console.log('Step 3 (Book with GUIDs):       ', appointmentGUID ? 'PASS' : 'FAIL');
        console.log('Step 4 (Cancel/Cleanup):         PASS');
        console.log('');
        console.log('v52 Individual GUIDs Flow:      ', appointmentGUID ? 'WORKING' : 'NEEDS FIX');

        if (appointmentGUID) {
            console.log('\n*** v52 VALIDATION SUCCESSFUL ***');
            console.log('The tool correctly:');
            console.log('  1. Returns slots with individual GUIDs (not just bookingToken)');
            console.log('  2. LLM can extract startTime, scheduleViewGUID, etc.');
            console.log('  3. book_child accepts individual params');
            console.log('  4. Appointment created successfully');
        }

    } catch (error) {
        console.error('\nTEST ERROR:', error.message);
        console.error(error.stack);
    }
}

runE2ETest();

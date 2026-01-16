#!/usr/bin/env node
/**
 * Unit test to isolate Sandbox A tool issues
 * Tests:
 * 1. What version of scheduling tool is deployed
 * 2. Whether patient creation returns patientGUID
 * 3. Whether slots return individual GUIDs or bookingToken
 */

const fetch = require('node-fetch');

const NODERED_BASE = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';

function getAuthHeader() {
    const credentials = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
    return `Basic ${credentials}`;
}

const TEST_UUI = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

async function testPatientCreation() {
    console.log('\n=== TEST 1: Patient Creation ===\n');

    const testPatient = {
        uui: TEST_UUI,
        patientFirstName: 'UnitTest',
        patientLastName: 'Patient' + Date.now(),
        birthdayDateTime: '01/01/2015',
        phoneNumber: '2155559999',
        emailAddress: 'unittest@test.com',
        providerGUID: 'a79ec244-9503-44b2-87e4-5920b6e60392',
        locationGUID: '799d413a-5e1a-46a2-b169-e2108bf517d6'
    };

    console.log('Creating patient:', testPatient.patientFirstName, testPatient.patientLastName);

    try {
        const response = await fetch(`${NODERED_BASE}/ortho-prd/createPatient`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getAuthHeader()
            },
            body: JSON.stringify(testPatient)
        });

        console.log('Response status:', response.status, response.statusText);
        const data = await response.json();
        console.log('Response data:', JSON.stringify(data, null, 2));

        if (data.patientGUID) {
            console.log('\n✓ SUCCESS: Patient created with GUID:', data.patientGUID);
            return data.patientGUID;
        } else {
            console.log('\n✗ FAILURE: No patientGUID returned');
            return null;
        }
    } catch (error) {
        console.error('Error:', error.message);
        return null;
    }
}

async function testGetSlots() {
    console.log('\n=== TEST 2: Get Available Slots ===\n');

    const today = new Date();
    const startDate = `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 14);
    const endDateStr = `${String(endDate.getMonth() + 1).padStart(2, '0')}/${String(endDate.getDate()).padStart(2, '0')}/${endDate.getFullYear()}`;

    console.log('Searching slots from', startDate, 'to', endDateStr);

    try {
        const response = await fetch(`${NODERED_BASE}/ortho-prd/getApptSlots`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getAuthHeader()
            },
            body: JSON.stringify({
                uui: TEST_UUI,
                startDate: startDate,
                endDate: endDateStr
            })
        });

        console.log('Response status:', response.status, response.statusText);
        const data = await response.json();

        if (data.slots && data.slots.length > 0) {
            console.log('\nFound', data.slots.length, 'slot(s)');
            console.log('\nFirst slot structure:');
            const firstSlot = data.slots[0];
            console.log(JSON.stringify(firstSlot, null, 2));

            console.log('\n=== SLOT FORMAT ANALYSIS ===');
            console.log('Has displayTime:', !!firstSlot.displayTime);
            console.log('Has startTime:', !!firstSlot.startTime);
            console.log('Has bookingToken:', !!firstSlot.bookingToken);
            console.log('Has scheduleViewGUID:', !!firstSlot.scheduleViewGUID);
            console.log('Has scheduleColumnGUID:', !!firstSlot.scheduleColumnGUID);
            console.log('Has appointmentTypeGUID:', !!firstSlot.appointmentTypeGUID);
            console.log('Has minutes:', !!firstSlot.minutes);

            if (firstSlot.bookingToken && !firstSlot.scheduleViewGUID) {
                console.log('\n→ This is OLD FORMAT (v49): Uses bookingToken, no individual GUIDs');
            } else if (firstSlot.scheduleViewGUID && !firstSlot.bookingToken) {
                console.log('\n→ This is NEW FORMAT (v52): Uses individual GUIDs, no bookingToken');
            } else if (firstSlot.bookingToken && firstSlot.scheduleViewGUID) {
                console.log('\n→ This is HYBRID FORMAT: Has both bookingToken and individual GUIDs');
            }

            return firstSlot;
        } else {
            console.log('No slots found');
            return null;
        }
    } catch (error) {
        console.error('Error:', error.message);
        return null;
    }
}

async function testBookingWithIndividualGUIDs(patientGUID, slot) {
    console.log('\n=== TEST 3: Book Appointment with Individual GUIDs ===\n');

    if (!patientGUID) {
        console.log('Skipping - no patientGUID available');
        return;
    }

    if (!slot) {
        console.log('Skipping - no slot available');
        return;
    }

    // Extract GUIDs from slot (or decode from bookingToken if needed)
    let bookingData;
    if (slot.scheduleViewGUID) {
        bookingData = {
            startTime: slot.startTime || slot.displayTime,
            scheduleViewGUID: slot.scheduleViewGUID,
            scheduleColumnGUID: slot.scheduleColumnGUID || 'dda0b40c-ace5-4427-8b76-493bf9aa26f1',
            appointmentTypeGUID: slot.appointmentTypeGUID || 'f6c20c35-9abb-47c2-981a-342996016705',
            minutes: slot.minutes || 45
        };
    } else if (slot.bookingToken) {
        // Decode bookingToken
        const decoded = JSON.parse(Buffer.from(slot.bookingToken, 'base64').toString('utf8'));
        bookingData = {
            startTime: decoded.st,
            scheduleViewGUID: decoded.sv,
            scheduleColumnGUID: decoded.sc,
            appointmentTypeGUID: decoded.at,
            minutes: parseInt(decoded.mn)
        };
        console.log('Decoded from bookingToken:', bookingData);
    }

    const bookingRequest = {
        uui: TEST_UUI,
        patientGUID: patientGUID,
        ...bookingData
    };

    console.log('Booking with individual GUIDs:');
    console.log(JSON.stringify(bookingRequest, null, 2));

    try {
        const response = await fetch(`${NODERED_BASE}/ortho-prd/createAppt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': getAuthHeader()
            },
            body: JSON.stringify(bookingRequest)
        });

        console.log('\nResponse status:', response.status, response.statusText);
        const data = await response.json();
        console.log('Response data:', JSON.stringify(data, null, 2));

        if (data.appointmentGUID || data.success) {
            console.log('\n✓ SUCCESS: Appointment created!');
            console.log('Appointment GUID:', data.appointmentGUID);
            return data;
        } else {
            console.log('\n✗ FAILURE: Booking failed');
            if (data._toolVersion) {
                console.log('Tool version:', data._toolVersion);
            }
            if (data._debug_error) {
                console.log('Error:', data._debug_error);
            }
            return null;
        }
    } catch (error) {
        console.error('Error:', error.message);
        return null;
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('SANDBOX A TOOL UNIT TESTS');
    console.log('='.repeat(60));
    console.log('\nThis test directly calls Node-RED endpoints to verify tool behavior.');
    console.log('These are the same endpoints the Flowise tools call.\n');

    // Test 1: Patient creation
    const patientGUID = await testPatientCreation();

    // Test 2: Get slots
    const slot = await testGetSlots();

    // Test 3: Book with individual GUIDs
    if (patientGUID && slot) {
        await testBookingWithIndividualGUIDs(patientGUID, slot);
    }

    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log('\nPatient creation:', patientGUID ? '✓ Works' : '✗ Failed');
    console.log('Slots retrieval:', slot ? '✓ Works' : '✗ Failed');
    if (slot) {
        console.log('Slot format:', slot.bookingToken ? 'OLD (bookingToken)' : 'NEW (individual GUIDs)');
    }
}

main().catch(console.error);

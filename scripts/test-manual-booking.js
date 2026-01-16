#!/usr/bin/env node
/**
 * Manual end-to-end booking test to isolate the issue
 */

const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const credentials = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + credentials
};
const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

async function main() {
    // Step 1: Get a fresh slot
    console.log('=== STEP 1: GET FRESH SLOT ===');
    const slotsResp = await fetch(BASE_URL + '/ortho-prd/getApptSlots', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            uui,
            startDate: '02/14/2026',
            endDate: '03/14/2026'
        })
    });
    const slotsData = await slotsResp.json();

    if (!slotsData.slots || slotsData.slots.length === 0) {
        console.log('No slots found!');
        return;
    }

    const slot = slotsData.slots[0];
    console.log('Found slot:');
    console.log('  startTime:', slot.startTime);
    console.log('  scheduleViewGUID:', slot.scheduleViewGUID);
    console.log('  scheduleColumnGUID:', slot.scheduleColumnGUID);
    console.log('  appointmentTypeGUID:', slot.appointmentTypeGUID);
    console.log('  minutes:', slot.minutes);

    // Step 2: Create patient
    console.log('\n=== STEP 2: CREATE PATIENT ===');
    const patientResp = await fetch(BASE_URL + '/ortho-prd/createPatient', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            uui,
            patientFirstName: 'TestChild',
            patientLastName: 'ManualTest' + Date.now().toString().slice(-4),
            birthdayDateTime: '03/15/2014',
            phoneNumber: '2155559999',
            locationGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b'
        })
    });
    const patientData = await patientResp.json();
    console.log('Patient created:', JSON.stringify(patientData, null, 2));

    if (!patientData.patientGUID) {
        console.log('Failed to create patient');
        return;
    }

    // Step 3: Book with ALL parameters from slot
    console.log('\n=== STEP 3: BOOK APPOINTMENT ===');
    console.log('Booking with:');
    console.log('  patientGUID:', patientData.patientGUID);
    console.log('  startTime:', slot.startTime);
    console.log('  scheduleViewGUID:', slot.scheduleViewGUID);
    console.log('  scheduleColumnGUID:', slot.scheduleColumnGUID);
    console.log('  appointmentTypeGUID:', slot.appointmentTypeGUID);
    console.log('  minutes:', slot.minutes);

    const bookResp = await fetch(BASE_URL + '/ortho-prd/createAppt', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            uui,
            patientGUID: patientData.patientGUID,
            startTime: slot.startTime,
            scheduleViewGUID: slot.scheduleViewGUID,
            scheduleColumnGUID: slot.scheduleColumnGUID,
            appointmentTypeGUID: slot.appointmentTypeGUID,
            minutes: parseInt(slot.minutes)
        })
    });
    const bookData = await bookResp.json();
    console.log('\nBooking result:', JSON.stringify(bookData, null, 2));

    if (bookData.success) {
        console.log('\n✓ SUCCESS! Appointment booked!');
    } else {
        console.log('\n✗ FAILED - Error:', bookData.message || bookData._debug_error || 'Unknown error');
    }
}

main().catch(e => console.error('Error:', e.message));

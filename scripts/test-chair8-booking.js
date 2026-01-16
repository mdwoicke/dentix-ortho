#!/usr/bin/env node
/**
 * Test booking on Chair 8 with Exams appointment (40 min) - gold standard test
 */

const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const credentials = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + credentials
};
const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

// Chair 8 configuration
const CHAIR_8_GUID = '07687884-7e37-49aa-8028-d43b751c9034';

async function main() {
    console.log('=== CHAIR 8 BOOKING TEST ===\n');

    // Step 1: Get a fresh Chair 8 Exams slot
    console.log('1. Getting fresh Chair 8 slot...');
    const slotsResponse = await fetch(BASE_URL + '/ortho-prd/getApptSlots', {
        method: 'POST',
        headers,
        body: JSON.stringify({ uui, startDate: '02/15/2026', endDate: '04/15/2026' })
    });
    const slotsData = await slotsResponse.json();

    // Filter for Chair 8 Exams slots
    const chair8Slots = slotsData.slots.filter(s =>
        s.scheduleColumnGUID === CHAIR_8_GUID &&
        s.AppointmentClassDescription === 'Exams'
    );

    if (chair8Slots.length === 0) {
        console.log('No Chair 8 Exams slots found!');
        return;
    }

    const slot = chair8Slots[0];
    console.log('Found Chair 8 Exams slot:');
    console.log(`  startTime: ${slot.startTime}`);
    console.log(`  minutes: ${slot.minutes}`);
    console.log(`  scheduleViewGUID: ${slot.scheduleViewGUID}`);
    console.log(`  scheduleColumnGUID: ${slot.scheduleColumnGUID}`);
    console.log(`  appointmentTypeGUID: ${slot.appointmentTypeGUID}`);
    console.log(`  AppointmentClassDescription: ${slot.AppointmentClassDescription}`);

    // Step 2: Create patient
    console.log('\n2. Creating patient...');
    const patientResponse = await fetch(BASE_URL + '/ortho-prd/createPatient', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            uui,
            patientFirstName: 'GoldStandard',
            patientLastName: 'Chair8Test' + Date.now().toString().slice(-4),
            birthdayDateTime: '03/15/2014',
            phoneNumber: '2155559999',
            locationGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b'
        })
    });
    const patientData = await patientResponse.json();

    if (!patientData.patientGUID) {
        console.log('Failed to create patient:', JSON.stringify(patientData, null, 2));
        return;
    }
    console.log(`Patient created: ${patientData.patientGUID}`);

    // Get patient info to verify
    const patInfoResp = await fetch(BASE_URL + '/ortho-prd/getPatient', {
        method: 'POST',
        headers,
        body: JSON.stringify({ uui, patientGUID: patientData.patientGUID })
    });
    const patInfo = await patInfoResp.json();
    console.log(`  Location: ${patInfo.patient?.Location}`);
    console.log(`  Orthodontist: ${patInfo.patient?.Orthodontist}`);

    // Step 3: Book appointment on Chair 8
    console.log('\n3. Booking appointment on Chair 8...');
    console.log('Booking parameters:');
    console.log(`  patientGUID: ${patientData.patientGUID}`);
    console.log(`  startTime: ${slot.startTime}`);
    console.log(`  scheduleViewGUID: ${slot.scheduleViewGUID}`);
    console.log(`  scheduleColumnGUID: ${slot.scheduleColumnGUID} (Chair 8)`);
    console.log(`  appointmentTypeGUID: ${slot.appointmentTypeGUID}`);
    console.log(`  minutes: ${slot.minutes}`);

    const bookResponse = await fetch(BASE_URL + '/ortho-prd/createAppt', {
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
    const bookData = await bookResponse.json();

    console.log('\n=== BOOKING RESULT ===');
    console.log(JSON.stringify(bookData, null, 2));

    if (bookData.success) {
        console.log('\n✓ SUCCESS! Chair 8 booking worked!');
        console.log(`Appointment GUID: ${bookData.appointmentGUID}`);

        // Get the patient's appointments to verify
        console.log('\n4. Verifying appointment...');
        const apptsResp = await fetch(BASE_URL + '/ortho-prd/getPatientAppts', {
            method: 'POST',
            headers,
            body: JSON.stringify({ uui, patientGUID: patientData.patientGUID })
        });
        const apptsData = await apptsResp.json();
        console.log('Patient appointments:', JSON.stringify(apptsData, null, 2));
    } else {
        console.log('\n✗ FAILED');
        console.log('Error:', bookData.message || bookData._debug_error);
        console.log('Debug:', JSON.stringify(bookData._debug, null, 2));
    }
}

main().catch(e => console.error('Error:', e.message));

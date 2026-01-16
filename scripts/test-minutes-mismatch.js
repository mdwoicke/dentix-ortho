const fetch = require('node-fetch');

// Test booking with minutes=20 (matching the slot) vs minutes=45 (the default)
async function testMinutesMismatch() {
    const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
    const credentials = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + credentials
    };
    const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

    // Get fresh slot
    console.log('=== GETTING FRESH SLOT ===');
    const slotsResp = await fetch(BASE_URL + '/ortho-prd/getApptSlots', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            uui,
            startDate: '02/10/2026',
            endDate: '02/28/2026'
        })
    });
    const slotsData = await slotsResp.json();

    if (!slotsData.slots || slotsData.slots.length === 0) {
        console.log('No slots found!');
        return;
    }

    const slot = slotsData.slots[0];
    console.log('Fresh slot:');
    console.log('  startTime:', slot.startTime);
    console.log('  minutes:', slot.minutes, '(type:', typeof slot.minutes + ')');
    console.log('  scheduleViewGUID:', slot.scheduleViewGUID);
    console.log('  scheduleColumnGUID:', slot.scheduleColumnGUID);
    console.log('  appointmentTypeGUID:', slot.appointmentTypeGUID);

    // Create a test patient first
    console.log('\n=== CREATING TEST PATIENT ===');
    const patientResp = await fetch(BASE_URL + '/ortho-prd/createPatient', {
        method: 'POST',
        headers,
        body: JSON.stringify({
            uui,
            patientFirstName: 'MinutesTest',
            patientLastName: 'User' + Date.now(),
            birthdayDateTime: '03/15/2014',
            phoneNumber: '2155559999',
            locationGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b'
        })
    });
    const patientData = await patientResp.json();
    console.log('Patient:', JSON.stringify(patientData, null, 2));

    if (!patientData.patientGUID) {
        console.log('Failed to create patient');
        return;
    }

    // Now try booking with CORRECT minutes (from slot)
    console.log('\n=== BOOKING WITH CORRECT MINUTES (20) ===');
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
            minutes: 20  // MATCH THE SLOT
        })
    });
    const bookData = await bookResp.json();
    console.log('Booking result:', JSON.stringify(bookData, null, 2));
}

testMinutesMismatch().catch(e => console.error('Error:', e.message));

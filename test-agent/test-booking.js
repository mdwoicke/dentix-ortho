const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const auth = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');

async function test() {
    // Get a fresh slot
    console.log('=== Getting fresh slots ===');
    const slotsResponse = await fetch(BASE_URL + '/ortho/getApptSlots', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + auth
        },
        body: JSON.stringify({
            startDate: '01/22/2026',
            endDate: '01/22/2026',
            uui: 'test-fresh-booking'
        })
    });

    const slotsData = await slotsResponse.json();
    console.log('Found', slotsData.slots ? slotsData.slots.length : 0, 'slots');

    if (!slotsData.slots || slotsData.slots.length === 0) {
        console.log('No slots available');
        return;
    }

    const slot = slotsData.slots[0];
    console.log('Using slot:', slot.StartTime, 'at', slot.ScheduleViewDescription);
    console.log('Slot appointmentTypeGUID:', slot.appointmentTypeGUID || slot.AppointmentTypeGUID);

    // Book with fresh patient
    console.log('\n=== Booking appointment ===');
    const bookResponse = await fetch(BASE_URL + '/ortho/createAppt', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Basic ' + auth
        },
        body: JSON.stringify({
            patientGUID: 'FAEF7FA8-8FE3-4E76-909E-E83DDB484767',
            startTime: slot.StartTime,
            scheduleViewGUID: slot.ScheduleViewGUID,
            scheduleColumnGUID: slot.ScheduleColumnGUID,
            appointmentTypeGUID: slot.appointmentTypeGUID || slot.AppointmentTypeGUID,
            minutes: parseInt(slot.Minutes) || 45,
            childName: 'ManualTest User',
            uui: 'test-fresh-booking'
        })
    });

    console.log('Book status:', bookResponse.status);
    const bookData = await bookResponse.json();
    console.log('Book response:', JSON.stringify(bookData, null, 2));
}

test().catch(e => console.error('Error:', e.message));

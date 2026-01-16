#!/usr/bin/env node
/**
 * Find Exam slots vs Adjustment slots - New patients need Exam appointments
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
    console.log('=== FINDING EXAM SLOTS FOR NEW PATIENTS ===\n');

    const response = await fetch(BASE_URL + '/ortho-prd/getApptSlots', {
        method: 'POST',
        headers,
        body: JSON.stringify({ uui, startDate: '02/15/2026', endDate: '04/15/2026' })
    });
    const data = await response.json();

    if (!data.slots || data.slots.length === 0) {
        console.log('No slots found!');
        return;
    }

    console.log('Total slots:', data.slots.length);

    // Categorize slots by AppointmentClassDescription
    const byClass = {};
    data.slots.forEach(s => {
        const cls = s.AppointmentClassDescription || 'Unknown';
        if (!byClass[cls]) byClass[cls] = [];
        byClass[cls].push(s);
    });

    console.log('\n=== SLOTS BY CLASS ===');
    for (const [cls, slots] of Object.entries(byClass)) {
        console.log(`\n${cls}: ${slots.length} slots`);
        console.log('First slot:');
        const first = slots[0];
        console.log(`  startTime: ${first.startTime}`);
        console.log(`  minutes: ${first.minutes}`);
        console.log(`  appointmentTypeGUID: ${first.appointmentTypeGUID}`);
        console.log(`  AppointmentTypeDescription: ${first.AppointmentTypeDescription || '(none)'}`);
        console.log(`  scheduleViewGUID: ${first.scheduleViewGUID}`);
        console.log(`  ScheduleViewDescription: ${first.ScheduleViewDescription}`);
    }

    // Check if "Exams" are for new patients
    const examSlots = byClass['Exams'] || [];
    if (examSlots.length > 0) {
        console.log('\n=== EXAM SLOTS (likely for new patients) ===');
        examSlots.slice(0, 5).forEach((s, i) => {
            console.log(`${i+1}. ${s.startTime}`);
            console.log(`   TypeGUID: ${s.appointmentTypeGUID}`);
            console.log(`   Minutes: ${s.minutes}`);
            console.log(`   ScheduleView: ${s.ScheduleViewDescription}`);
        });

        // Try booking with an Exam slot
        console.log('\n=== TESTING BOOKING WITH EXAM SLOT ===');
        const examSlot = examSlots[0];

        // First create a patient
        console.log('Creating patient...');
        const patResp = await fetch(BASE_URL + '/ortho-prd/createPatient', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                uui,
                patientFirstName: 'ExamTest',
                patientLastName: 'Patient' + Date.now().toString().slice(-4),
                birthdayDateTime: '03/15/2014',
                phoneNumber: '2155559999',
                locationGUID: '1fef9297-7c8b-426b-b0d1-f2275136e48b'
            })
        });
        const patData = await patResp.json();
        console.log('Patient created:', patData.patientGUID);

        if (!patData.patientGUID) {
            console.log('Failed to create patient');
            return;
        }

        // Now book with the exam slot
        console.log('\nBooking with EXAM slot...');
        console.log('  startTime:', examSlot.startTime);
        console.log('  appointmentTypeGUID:', examSlot.appointmentTypeGUID);
        console.log('  minutes:', examSlot.minutes);

        const bookResp = await fetch(BASE_URL + '/ortho-prd/createAppt', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                uui,
                patientGUID: patData.patientGUID,
                startTime: examSlot.startTime,
                scheduleViewGUID: examSlot.scheduleViewGUID,
                scheduleColumnGUID: examSlot.scheduleColumnGUID,
                appointmentTypeGUID: examSlot.appointmentTypeGUID,
                minutes: parseInt(examSlot.minutes)
            })
        });
        const bookData = await bookResp.json();
        console.log('\nBooking result:', JSON.stringify(bookData, null, 2));

        if (bookData.success) {
            console.log('\n✓ SUCCESS! EXAM slot booking worked!');
        } else {
            console.log('\n✗ FAILED - Error:', bookData.message || bookData._debug_error);
        }
    } else {
        console.log('\nNo Exam slots found.');
    }
}

main().catch(e => console.error('Error:', e.message));

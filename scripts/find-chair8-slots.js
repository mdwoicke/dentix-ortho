#!/usr/bin/env node
/**
 * Find Chair 8 slots - the user wants to use Chair 8 specifically
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
    console.log('=== FINDING CHAIR 8 AND CHECKING COLUMNS ===\n');

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

    // Group by ScheduleColumnDescription (chair)
    const byColumn = {};
    data.slots.forEach(s => {
        const col = s.ScheduleColumnDescription || 'Unknown';
        if (!byColumn[col]) byColumn[col] = [];
        byColumn[col].push(s);
    });

    console.log('=== AVAILABLE CHAIRS/COLUMNS ===');
    for (const [col, slots] of Object.entries(byColumn)) {
        console.log(`${col}: ${slots.length} slots`);
        console.log(`  ColumnGUID: ${slots[0].scheduleColumnGUID}`);
        console.log(`  First slot: ${slots[0].startTime}`);
    }

    // Find Chair 8 specifically
    console.log('\n=== CHAIR 8 SLOTS ===');
    const chair8Slots = byColumn['Chair 8'] || [];
    if (chair8Slots.length > 0) {
        console.log(`Found ${chair8Slots.length} Chair 8 slots`);
        console.log(`Chair 8 GUID: ${chair8Slots[0].scheduleColumnGUID}`);
        console.log('\nFirst 5 Chair 8 slots:');
        chair8Slots.slice(0, 5).forEach((s, i) => {
            console.log(`${i+1}. ${s.startTime} - ${s.AppointmentClassDescription} (${s.minutes} min)`);
            console.log(`   TypeGUID: ${s.appointmentTypeGUID}`);
            console.log(`   ViewGUID: ${s.scheduleViewGUID}`);
        });
    } else {
        console.log('No Chair 8 slots found');
        console.log('Available chairs:', Object.keys(byColumn).join(', '));
    }
}

main().catch(e => console.error('Error:', e.message));

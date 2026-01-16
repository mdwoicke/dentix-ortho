#!/usr/bin/env node
/**
 * Check appointment types and see if there's a type mismatch
 */

const fetch = require('node-fetch');

const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const credentials = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + credentials
};
const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

// Cloud9 Production direct
const CLOUD9 = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

function buildXmlRequest(procedure, params = {}) {
    const paramElements = Object.entries(params)
        .filter(([_, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `<${k}>${v}</${k}>`)
        .join('');
    return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9.namespace}"><ClientID>${CLOUD9.clientId}</ClientID><UserName>${CLOUD9.userName}</UserName><Password>${CLOUD9.password}</Password><Procedure>${procedure}</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;
}

async function callCloud9(procedure, params) {
    const xml = buildXmlRequest(procedure, params);
    const response = await fetch(CLOUD9.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xml
    });
    return response.text();
}

async function main() {
    console.log('=== CHECKING APPOINTMENT TYPES ===\n');

    // From our slot response:
    console.log('Slot data from earlier:');
    console.log('  AppointmentTypeGUID: f6c20c35-9abb-47c2-981a-342996016705');
    console.log('  AppointmentTypeDescription: (empty)');
    console.log('  AppointmentClassDescription: Adjustments');
    console.log('  AppointmentClassGUID: 7a65519e-08fb-4aa0-bdc7-c02f73fdf84c');
    console.log('  Minutes: 20');

    // 1. Try GetApptTypes
    console.log('\n1. Trying GetApptTypes...');
    try {
        const resp = await callCloud9('GetApptTypes', {});
        if (resp.includes('<ErrorMessage>')) {
            const errMatch = resp.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
            console.log('   Error:', errMatch ? errMatch[1] : 'Unknown');
        } else if (resp.includes('<Record>')) {
            const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
            let match;
            let count = 0;
            console.log('   Appointment types found:');
            while ((match = recordRegex.exec(resp)) !== null) {
                const guidMatch = match[0].match(/<AppointmentTypeGUID>([^<]+)<\/AppointmentTypeGUID>/);
                const descMatch = match[0].match(/<AppointmentTypeDescription>([^<]*)<\/AppointmentTypeDescription>/);
                const minMatch = match[0].match(/<DefaultDuration>([^<]+)<\/DefaultDuration>/);
                if (guidMatch) {
                    console.log(`   - ${guidMatch[1]}: ${descMatch ? descMatch[1] : '(no desc)'} (${minMatch ? minMatch[1] + ' min' : 'no duration'})`);
                    if (guidMatch[1] === 'f6c20c35-9abb-47c2-981a-342996016705') {
                        console.log('     ^^^ THIS IS OUR TARGET APPT TYPE ^^^');
                    }
                }
                count++;
            }
            console.log(`   Total: ${count} types`);
        } else {
            console.log('   No records found');
        }
    } catch (e) {
        console.log('   Error:', e.message);
    }

    // 2. Check if this is a "new patient" vs "adjustment" type issue
    console.log('\n2. Key question: Are we using the right appointment type?');
    console.log('   The slot shows:');
    console.log('   - AppointmentClassDescription: "Adjustments"');
    console.log('   - This might be for EXISTING patients, not NEW patients!');
    console.log('   - New patients might need a different appointment type/class');

    // 3. Try to get more slot detail
    console.log('\n3. Getting fresh slots to check all types...');
    try {
        const response = await fetch(BASE_URL + '/ortho-prd/getApptSlots', {
            method: 'POST',
            headers,
            body: JSON.stringify({ uui, startDate: '02/15/2026', endDate: '03/15/2026' })
        });
        const data = await response.json();

        if (data.slots) {
            // Check unique appointment classes
            const classes = new Set();
            data.slots.forEach(s => {
                if (s.AppointmentClassDescription) classes.add(s.AppointmentClassDescription);
            });
            console.log('   Unique appointment classes in slots:', [...classes].join(', '));

            // Show first few slots with class info
            console.log('   First 5 slots:');
            data.slots.slice(0, 5).forEach((s, i) => {
                console.log(`   ${i+1}. ${s.startTime} - Class: ${s.AppointmentClassDescription}, Type: ${s.appointmentTypeGUID}`);
            });
        }
    } catch (e) {
        console.log('   Error:', e.message);
    }
}

main().catch(e => console.error('Error:', e.message));

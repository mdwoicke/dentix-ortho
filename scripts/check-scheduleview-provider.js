#!/usr/bin/env node
/**
 * Check if we can get provider info from schedule view
 * Try multiple Cloud9 procedures to find schedule view -> provider mapping
 */

const fetch = require('node-fetch');

// Using Node Red credentials that work
const BASE_URL = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord';
const credentials = Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'Basic ' + credentials
};
const uui = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

// Cloud9 Production direct (for procedures not in Node Red)
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
    console.log('=== INVESTIGATING SCHEDULE VIEW -> PROVIDER MAPPING ===\n');

    // 1. Try GetScheduleViews
    console.log('1. Trying GetScheduleViews...');
    try {
        const resp = await callCloud9('GetScheduleViews', {});
        if (resp.includes('Error')) {
            console.log('   Error in response');
            console.log('   Response:', resp.substring(0, 500));
        } else {
            const recordMatch = resp.match(/<Record>([\s\S]*?)<\/Record>/);
            if (recordMatch) {
                console.log('   First record:', recordMatch[0]);
            } else {
                console.log('   No records found');
            }
        }
    } catch (e) {
        console.log('   Error:', e.message);
    }

    // 2. Try GetDoctors to see available orthodontists
    console.log('\n2. Trying GetDoctors...');
    try {
        const resp = await callCloud9('GetDoctors', {});
        if (resp.includes('<ErrorMessage>')) {
            const errMatch = resp.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
            console.log('   Error:', errMatch ? errMatch[1] : 'Unknown');
        } else {
            const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
            let match;
            let count = 0;
            while ((match = recordRegex.exec(resp)) !== null && count < 5) {
                console.log('   Doctor record:', match[0]);
                count++;
            }
        }
    } catch (e) {
        console.log('   Error:', e.message);
    }

    // 3. Try GetProviders
    console.log('\n3. Trying GetProviders...');
    try {
        const resp = await callCloud9('GetProviders', {});
        if (resp.includes('<ErrorMessage>')) {
            const errMatch = resp.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
            console.log('   Error:', errMatch ? errMatch[1] : 'Unknown');
        } else {
            const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
            let match;
            let count = 0;
            while ((match = recordRegex.exec(resp)) !== null && count < 5) {
                console.log('   Provider record:', match[0]);
                count++;
            }
        }
    } catch (e) {
        console.log('   Error:', e.message);
    }

    // 4. Check our specific schedule view's info from the slot
    console.log('\n4. Our target schedule view:');
    console.log('   ScheduleViewGUID: 4c9e9333-4951-4eb0-8d97-e1ad83ef422d');
    console.log('   ScheduleViewDescription: CDH Allegheny 202');
    console.log('   LocationGUID: 1fef9297-7c8b-426b-b0d1-f2275136e48b');

    // 5. Check patient info via Node Red to see assigned orthodontist
    console.log('\n5. Checking recently created patient provider assignment...');
    try {
        const response = await fetch(BASE_URL + '/ortho-prd/getPatient', {
            method: 'POST',
            headers,
            body: JSON.stringify({ uui, patientGUID: '45168345-3D5A-4423-B13C-334DAB4B8D18' })
        });
        const data = await response.json();
        if (data.patient) {
            console.log('   Location:', data.patient.Location);
            console.log('   Orthodontist:', data.patient.Orthodontist);
        }
    } catch (e) {
        console.log('   Error:', e.message);
    }
}

main().catch(e => console.error('Error:', e.message));

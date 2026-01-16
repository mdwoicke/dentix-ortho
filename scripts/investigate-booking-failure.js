const fetch = require('node-fetch');

// Investigate why booking is failing by checking Cloud9 directly
async function investigate() {
    // Cloud9 sandbox
    const CLOUD9_URL = 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx';
    const clientId = 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56';
    const userName = 'ChordAPIUser';
    const password = 'FDx@4kLQ6tYb!Wz^';
    const namespace = 'http://schemas.practica.ws/cloud9/partners/';

    function buildXml(procedure, params = {}) {
        const paramElements = Object.entries(params)
            .filter(([_, v]) => v !== null && v !== undefined)
            .map(([k, v]) => `<${k}>${v}</${k}>`)
            .join('');
        return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${namespace}"><ClientID>${clientId}</ClientID><UserName>${userName}</UserName><Password>${password}</Password><Procedure>${procedure}</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;
    }

    async function callCloud9(procedure, params = {}) {
        const xml = buildXml(procedure, params);
        const resp = await fetch(CLOUD9_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/xml' },
            body: xml
        });
        return resp.text();
    }

    // 1. Check schedule views and their providers
    console.log('=== GET SCHEDULE VIEWS ===');
    const schedViews = await callCloud9('GetScheduleViews');

    // Parse the XML to find our target schedule view
    const targetView = '4c9e9333-4951-4eb0-8d97-e1ad83ef422d';
    const viewMatch = schedViews.match(new RegExp('<Record>[\s\S]*?<ScheduleViewGUID>' + targetView + '</ScheduleViewGUID>[\s\S]*?</Record>'));

    if (viewMatch) {
        console.log('Found target schedule view:');
        console.log(viewMatch[0].substring(0, 800));

        // Extract provider GUID from the schedule view
        const providerMatch = viewMatch[0].match(/<ProviderGUID>([^<]+)<\/ProviderGUID>/);
        if (providerMatch) {
            console.log('\nSchedule View Provider:', providerMatch[1]);
        }
    } else {
        console.log('Target schedule view not found');
        console.log('Response excerpt:', schedViews.substring(0, 500));
    }

    // 2. Check the patient's assigned provider
    const testPatientGUID = '89022DD1-9D54-40B6-98FB-E673B93A7A41';
    console.log('\n=== GET PATIENT INFO ===');
    const patientInfo = await callCloud9('GetPatientInformation', { patGUID: testPatientGUID });
    console.log('Patient Info Response:');
    console.log(patientInfo.substring(0, 1500));

    // Extract orthodontist from patient info
    const orthoMatch = patientInfo.match(/<OrthodontistGUID>([^<]+)<\/OrthodontistGUID>/);
    if (orthoMatch) {
        console.log('\nPatient Orthodontist:', orthoMatch[1]);
    }

    // 3. Check online reservations
    console.log('\n=== GET ONLINE RESERVATIONS ===');
    const reservations = await callCloud9('GetOnlineReservations', {
        startDate: '02/10/2026',
        endDate: '02/15/2026',
        schdvwGUIDs: targetView
    });
    console.log('Reservations (first 1500 chars):');
    console.log(reservations.substring(0, 1500));
}

investigate().catch(e => console.error('Error:', e.message));

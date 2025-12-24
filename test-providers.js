const fetch = require('node-fetch');

const CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    namespace: 'http://schemas.practica.ws/cloud9/partners/',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#'
};

function buildXml(procedure) {
    return `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9.namespace}"><ClientID>${CLOUD9.clientId}</ClientID><UserName>${CLOUD9.userName}</UserName><Password>${CLOUD9.password}</Password><Procedure>${procedure}</Procedure><Parameters></Parameters></GetDataRequest>`;
}

async function test() {
    console.log('=== Getting Locations ===\n');

    const locRes = await fetch(CLOUD9.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: buildXml('GetLocations')
    });
    const locText = await locRes.text();

    // Extract first location
    const locMatch = locText.match(/<Record>([\s\S]*?)<\/Record>/);
    if (locMatch) {
        console.log('First Location:');
        const fields = locMatch[1].match(/<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g);
        if (fields) {
            fields.forEach(f => {
                const m = f.match(/<([^>]+)>([^<]*)/);
                if (m) console.log('  ' + m[1] + ': ' + m[2]);
            });
        }
    }

    console.log('\n=== Getting Providers ===\n');

    const provRes = await fetch(CLOUD9.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: buildXml('GetProviders')
    });
    const provText = await provRes.text();

    // Count providers
    const provCount = (provText.match(/<Record>/g) || []).length;
    console.log('Total Providers:', provCount);

    // Extract first 3 providers
    const provRegex = /<Record>([\s\S]*?)<\/Record>/g;
    let match;
    let count = 0;
    while ((match = provRegex.exec(provText)) !== null && count < 3) {
        console.log(`\nProvider ${count + 1}:`);
        const fields = match[1].match(/<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g);
        if (fields) {
            fields.forEach(f => {
                const m = f.match(/<([^>]+)>([^<]*)/);
                if (m) console.log('  ' + m[1] + ': ' + m[2]);
            });
        }
        count++;
    }

    console.log('\n=== Getting Doctors (Orthodontists) ===\n');

    const docRes = await fetch(CLOUD9.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: buildXml('GetDoctors')
    });
    const docText = await docRes.text();

    // Count doctors
    const docCount = (docText.match(/<Record>/g) || []).length;
    console.log('Total Doctors:', docCount);

    // Extract first 3 doctors
    const docRegex = /<Record>([\s\S]*?)<\/Record>/g;
    count = 0;
    while ((match = docRegex.exec(docText)) !== null && count < 3) {
        console.log(`\nDoctor ${count + 1}:`);
        const fields = match[1].match(/<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g);
        if (fields) {
            fields.forEach(f => {
                const m = f.match(/<([^>]+)>([^<]*)/);
                if (m) console.log('  ' + m[1] + ': ' + m[2]);
            });
        }
        count++;
    }
}

test().catch(console.error);

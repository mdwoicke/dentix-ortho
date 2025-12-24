const fetch = require('node-fetch');

const CLOUD9 = {
    endpoint: 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx',
    clientId: 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56',
    userName: 'IntelepeerTest',
    password: '#!InteleP33rTest!#',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

const xmlRequest = `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9.namespace}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><ClientID>${CLOUD9.clientId}</ClientID><UserName>${CLOUD9.userName}</UserName><Password>${CLOUD9.password}</Password><Procedure>GetOnlineReservations</Procedure><Parameters><startDate>01/01/2026 7:00:00 AM</startDate><endDate>01/02/2026 5:00:00 PM</endDate><morning>True</morning><afternoon>True</afternoon><appttypGUIDs>8fc9d063-ae46-4975-a5ae-734c6efe341a</appttypGUIDs></Parameters></GetDataRequest>`;

async function test() {
    console.log('Testing GetOnlineReservations with Jan 2026 dates...\n');

    const response = await fetch(CLOUD9.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xmlRequest
    });

    const text = await response.text();
    const recordCount = (text.match(/<Record>/g) || []).length;

    console.log('HTTP Status:', response.status);
    console.log('Records found:', recordCount);

    if (recordCount > 0) {
        // Parse first few records
        const recordRegex = /<Record>([\s\S]*?)<\/Record>/g;
        let match;
        let count = 0;
        while ((match = recordRegex.exec(text)) !== null && count < 3) {
            const record = {};
            const fieldRegex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
            let fieldMatch;
            while ((fieldMatch = fieldRegex.exec(match[1])) !== null) {
                record[fieldMatch[1]] = fieldMatch[2];
            }
            console.log(`\nSlot ${count + 1}:`, JSON.stringify(record, null, 2));
            count++;
        }
    }
}

test().catch(console.error);

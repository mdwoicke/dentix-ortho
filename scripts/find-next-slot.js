const https = require('https');
const { parseStringPromise } = require('xml2js');

// Cloud9 Production API
const ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CREDENTIALS = {
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$'
};

// User-provided GUIDs
const SCHEDULE_VIEW_GUID = 'b1946f40-3b0b-4e01-87a9-c5060b88443e';
const APPT_TYPE_GUID = 'f6c20c35-9abb-47c2-981a-342996016705';

function buildXmlRequest(startDate, endDate) {
    return `<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>${CREDENTIALS.clientId}</ClientID>
    <UserName>${CREDENTIALS.userName}</UserName>
    <Password>${CREDENTIALS.password}</Password>
    <Procedure>GetOnlineReservations</Procedure>
    <Parameters>
        <startDate>${startDate} 7:00:00 AM</startDate>
        <endDate>${endDate} 5:00:00 PM</endDate>
        <schdvwGUIDs>${SCHEDULE_VIEW_GUID}</schdvwGUIDs>
        <appttypGUIDs>${APPT_TYPE_GUID}</appttypGUIDs>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>`;
}

async function parseXmlResponse(xmlData) {
    return await parseStringPromise(xmlData, { explicitArray: false });
}

function makeRequest(xmlBody) {
    return new Promise((resolve, reject) => {
        const url = new URL(ENDPOINT);
        const options = {
            hostname: url.hostname,
            path: url.pathname,
            method: 'GET',
            headers: {
                'Content-Type': 'application/xml',
                'Content-Length': Buffer.byteLength(xmlBody)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.write(xmlBody);
        req.end();
    });
}

async function findNextSlot() {
    const today = new Date();
    let startDate = new Date(today);
    let endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 28);

    const formatDate = (d) => {
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const year = d.getFullYear();
        return `${month}/${day}/${year}`;
    };

    let attempt = 1;
    const maxAttempts = 5;

    while (attempt <= maxAttempts) {
        console.log(`\n=== Attempt ${attempt}: Searching ${formatDate(startDate)} to ${formatDate(endDate)} ===\n`);

        const xmlBody = buildXmlRequest(formatDate(startDate), formatDate(endDate));

        try {
            const responseData = await makeRequest(xmlBody);
            const parsed = await parseXmlResponse(responseData);
            const resp = parsed.GetDataResponse;

            if (resp.ResponseStatus === 'Success') {
                let records = resp.Records?.Record;
                if (!records) {
                    console.log('No slots found in this range');
                } else {
                    if (!Array.isArray(records)) records = [records];

                    // Sort by date/time
                    records.sort((a, b) => {
                        const dateA = new Date(a.StartDate || a.startDate);
                        const dateB = new Date(b.StartDate || b.startDate);
                        return dateA - dateB;
                    });

                    console.log(`Found ${records.length} slots!`);
                    console.log('\n=== NEXT AVAILABLE SLOT ===\n');
                    console.log(JSON.stringify(records[0], null, 2));

                    // Show next 5 slots
                    if (records.length > 1) {
                        console.log('\n=== NEXT 5 AVAILABLE SLOTS ===\n');
                        records.slice(0, 5).forEach((slot, i) => {
                            const date = slot.StartDate || slot.Date;
                            console.log(`${i + 1}. ${date}`);
                        });
                    }

                    return records[0];
                }
            } else {
                console.log('API Error:', resp.ErrorMessage || resp.ResponseStatus);
            }

        } catch (error) {
            console.log('Error:', error.message);
        }

        // Move to next date range
        startDate = new Date(endDate);
        endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 28);
        attempt++;
    }

    console.log('\nNo slots found after searching multiple date ranges');
}

findNextSlot();

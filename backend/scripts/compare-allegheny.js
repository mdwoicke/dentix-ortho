const https = require('https');
const { parseStringPromise } = require('xml2js');

const ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CREDENTIALS = {
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$'
};

// Two Allegheny locations
const ALLEGHENY_300M = '799d413a-5e1a-46a2-b169-e2108bf517d6';  // User's location
const ALLEGHENY_202 = '1fef9297-7c8b-426b-b0d1-f2275136e48b';   // Has slots

function buildRequest(startDate, endDate) {
    return `<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>${CREDENTIALS.clientId}</ClientID>
    <UserName>${CREDENTIALS.userName}</UserName>
    <Password>${CREDENTIALS.password}</Password>
    <Procedure>GetOnlineReservations</Procedure>
    <Parameters>
        <startDate>${startDate} 7:00:00 AM</startDate>
        <endDate>${endDate} 5:00:00 PM</endDate>
        <morning>True</morning>
        <afternoon>True</afternoon>
    </Parameters>
</GetDataRequest>`;
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

async function compare() {
    console.log('========================================');
    console.log('COMPARING ALLEGHENY LOCATIONS');
    console.log('========================================\n');

    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 28);

    const formatDate = (d) => {
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${month}/${day}/${d.getFullYear()}`;
    };

    console.log(`Date range: ${formatDate(today)} to ${formatDate(endDate)}\n`);

    try {
        const xml = buildRequest(formatDate(today), formatDate(endDate));
        const resp = await makeRequest(xml);
        const parsed = await parseStringPromise(resp, { explicitArray: false });
        const data = parsed.GetDataResponse;

        if (data.ResponseStatus === 'Success') {
            let records = data.Records?.Record;
            if (!Array.isArray(records)) records = records ? [records] : [];

            console.log(`Total slots returned: ${records.length}\n`);

            // Check for CDH - Allegheny 300M
            const slots300m = records.filter(r => r.LocationGUID === ALLEGHENY_300M);
            console.log('=== CDH - Allegheny 300M (Your location) ===');
            console.log(`LocationGUID: ${ALLEGHENY_300M}`);
            console.log(`Slots available: ${slots300m.length}`);
            if (slots300m.length > 0) {
                console.log('Sample slot:', JSON.stringify(slots300m[0], null, 2));
            } else {
                console.log('STATUS: NO SLOTS - Not configured for online reservations');
            }

            console.log('\n=== CDH - Allegheny 202 ===');
            const slots202 = records.filter(r => r.LocationGUID === ALLEGHENY_202);
            console.log(`LocationGUID: ${ALLEGHENY_202}`);
            console.log(`Slots available: ${slots202.length}`);
            if (slots202.length > 0) {
                console.log('\nFirst available slot:');
                const first = slots202.sort((a, b) => new Date(a.StartTime) - new Date(b.StartTime))[0];
                console.log(JSON.stringify(first, null, 2));

                console.log('\nNext 5 slots:');
                slots202.slice(0, 5).forEach((s, i) => {
                    console.log(`  ${i + 1}. ${s.StartTime} - ${s.ScheduleColumnDescription}`);
                });
            }

            console.log('\n========================================');
            console.log('CONCLUSION');
            console.log('========================================');
            console.log(`\nCDH - Allegheny 300M (${ALLEGHENY_300M}):`);
            console.log(`  -> ${slots300m.length === 0 ? 'NOT configured for online scheduling' : slots300m.length + ' slots available'}`);
            console.log(`\nCDH - Allegheny 202 (${ALLEGHENY_202}):`);
            console.log(`  -> ${slots202.length > 0 ? slots202.length + ' slots available' : 'No slots'}`);

        } else {
            console.log('API Error:', data.ErrorMessage);
        }
    } catch (e) {
        console.log('Error:', e.message);
    }
}

compare();

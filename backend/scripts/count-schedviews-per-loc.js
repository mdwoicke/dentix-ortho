const https = require('https');
const { parseStringPromise } = require('xml2js');

const ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CREDENTIALS = {
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$'
};

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

async function count() {
    const today = new Date();
    const endDate = new Date(today);
    endDate.setDate(endDate.getDate() + 28);

    const formatDate = (d) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

    try {
        const xml = buildRequest(formatDate(today), formatDate(endDate));
        const resp = await makeRequest(xml);
        const parsed = await parseStringPromise(resp, { explicitArray: false });
        const data = parsed.GetDataResponse;

        if (data.ResponseStatus === 'Success') {
            let records = data.Records?.Record;
            if (!Array.isArray(records)) records = records ? [records] : [];

            // Group by location, then by schedule view
            const locMap = new Map();
            records.forEach(r => {
                if (!locMap.has(r.LocationGUID)) {
                    locMap.set(r.LocationGUID, {
                        name: r.ScheduleViewDescription?.split(' - ')[0] || 'Unknown',
                        schedViews: new Map()
                    });
                }
                const loc = locMap.get(r.LocationGUID);
                if (!loc.schedViews.has(r.ScheduleViewGUID)) {
                    loc.schedViews.set(r.ScheduleViewGUID, {
                        name: r.ScheduleViewDescription,
                        slots: 0
                    });
                }
                loc.schedViews.get(r.ScheduleViewGUID).slots++;
            });

            console.log('Schedule Views per Location:\n');
            console.log('| Location | # Schedule Views | Total Slots |');
            console.log('|----------|------------------|-------------|');

            for (const [locGuid, loc] of locMap) {
                const totalSlots = [...loc.schedViews.values()].reduce((sum, sv) => sum + sv.slots, 0);
                console.log(`| ${loc.schedViews.values().next().value.name} | ${loc.schedViews.size} | ${totalSlots} |`);

                if (loc.schedViews.size > 1) {
                    for (const [svGuid, sv] of loc.schedViews) {
                        console.log(`|   └── ${sv.name} | | ${sv.slots} |`);
                    }
                }
            }

            // Summary
            const multipleViews = [...locMap.values()].filter(l => l.schedViews.size > 1).length;
            console.log(`\n${locMap.size} locations total`);
            console.log(`${multipleViews} locations have multiple schedule views`);
        } else {
            console.log('API Error:', data.ErrorMessage);
        }
    } catch (e) {
        console.log('Error:', e.message);
    }
}

count();

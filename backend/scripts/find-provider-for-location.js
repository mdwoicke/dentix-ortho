const https = require('https');
const { parseStringPromise } = require('xml2js');

const ENDPOINT = 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx';
const CREDENTIALS = {
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$'
};

const LOCATION_GUID = '799d413a-5e1a-46a2-b169-e2108bf517d6';

function buildRequest(procedure, params = {}) {
    let paramXml = '';
    for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
            paramXml += `        <${key}>${value}</${key}>\n`;
        }
    }
    return `<?xml version="1.0" encoding="utf-8" ?>
<GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/">
    <ClientID>${CREDENTIALS.clientId}</ClientID>
    <UserName>${CREDENTIALS.userName}</UserName>
    <Password>${CREDENTIALS.password}</Password>
    <Procedure>${procedure}</Procedure>
    <Parameters>
${paramXml}    </Parameters>
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

async function findProvider() {
    console.log('Finding provider/orthodontist for location...\n');

    // Try GetDoctors
    console.log('--- Trying GetDoctors ---');
    try {
        const xml1 = buildRequest('GetDoctors', {});
        const resp1 = await makeRequest(xml1);
        const parsed1 = await parseStringPromise(resp1, { explicitArray: false });
        const data1 = parsed1.GetDataResponse;

        if (data1.ResponseStatus === 'Success') {
            let doctors = data1.Records?.Record;
            if (!Array.isArray(doctors)) doctors = doctors ? [doctors] : [];
            console.log(`Found ${doctors.length} doctors`);
            console.log('Sample doctor fields:', Object.keys(doctors[0] || {}).join(', '));
            doctors.slice(0, 5).forEach(d => {
                console.log(`  - ${JSON.stringify(d)}`);
            });
        } else {
            console.log('Error:', data1.ErrorMessage);
        }
    } catch (e) {
        console.log('Error:', e.message);
    }

    await new Promise(r => setTimeout(r, 2000));

    // Try to find existing patients at this location to see what provider they have
    console.log('\n--- Checking existing patients for provider info ---');
    try {
        const xml2 = buildRequest('GetPortalPatientLookup', {
            filter: 'Test',
            lookupByPatient: '1',
            showInactive: '1'
        });
        const resp2 = await makeRequest(xml2);
        const parsed2 = await parseStringPromise(resp2, { explicitArray: false });
        const data2 = parsed2.GetDataResponse;

        if (data2.ResponseStatus === 'Success') {
            let patients = data2.Records?.Record;
            if (!Array.isArray(patients)) patients = patients ? [patients] : [];
            console.log(`Found ${patients.length} patients matching "Test"`);
            if (patients.length > 0) {
                console.log('Sample patient fields:', Object.keys(patients[0]).join(', '));
                patients.slice(0, 3).forEach(p => {
                    console.log(`  - ${p.PatientName}: ${p.PatientGUID || p.patGUID}`);
                });

                // Get detailed info for first patient
                if (patients[0]) {
                    const patGuid = patients[0].PatientGUID || patients[0].patGUID;
                    if (patGuid) {
                        await new Promise(r => setTimeout(r, 2000));
                        console.log(`\nGetting details for patient ${patGuid}...`);
                        const xml3 = buildRequest('GetPatientInformation', { patguid: patGuid });
                        const resp3 = await makeRequest(xml3);
                        const parsed3 = await parseStringPromise(resp3, { explicitArray: false });
                        const data3 = parsed3.GetDataResponse;

                        if (data3.ResponseStatus === 'Success') {
                            let info = data3.Records?.Record;
                            if (info) {
                                console.log('Patient Info:', JSON.stringify(info, null, 2));
                            }
                        }
                    }
                }
            }
        } else {
            console.log('Error:', data2.ErrorMessage);
        }
    } catch (e) {
        console.log('Error:', e.message);
    }

    await new Promise(r => setTimeout(r, 2000));

    // Get location info
    console.log('\n--- Getting Location Info ---');
    try {
        const xml4 = buildRequest('GetLocationInfo', { locGUID: LOCATION_GUID });
        const resp4 = await makeRequest(xml4);
        const parsed4 = await parseStringPromise(resp4, { explicitArray: false });
        const data4 = parsed4.GetDataResponse;

        console.log('GetLocationInfo Response:', JSON.stringify(data4, null, 2));
    } catch (e) {
        console.log('Error:', e.message);
    }
}

findProvider();

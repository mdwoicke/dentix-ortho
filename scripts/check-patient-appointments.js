/**
 * Check all appointments for the patient from the failed test
 */

const https = require('https');

const NODE_RED_BASE = 'https://c1-aicoe-nodered-lb.prod.c1conversations.io/FabricWorkflow/api/chord/ortho-prd';
const AUTH_HEADER = 'Basic ' + Buffer.from('workflowapi:e^@V95&6sAJReTsb5!iq39mIC4HYIV').toString('base64');
const TEST_UUI = '765381306-000000000001030525-SR-000-000000000000DAL130-026DE427|333725|421458314VO|2d411063-3769-4618-86d1-925d3578c112|FSV';

function makeRequest(endpoint, body) {
    return new Promise((resolve, reject) => {
        const url = `${NODE_RED_BASE}${endpoint}`;
        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            port: 443,
            path: urlObj.pathname,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': AUTH_HEADER },
            timeout: 30000,
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
                catch (e) { resolve({ status: res.statusCode, data: data }); }
            });
        });
        req.on('error', reject);
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function main() {
    const patientGUID = 'E4DC31A2-6657-4505-A824-B49A7299E6AE';

    console.log('Checking appointments for patient:', patientGUID);
    console.log('');

    const result = await makeRequest('/getAppointmentsByPatient', {
        uui: TEST_UUI,
        patientGUID: patientGUID
    });

    if (result.data.appointments && result.data.appointments.length > 0) {
        console.log(`Found ${result.data.appointments.length} appointments:\n`);
        result.data.appointments.forEach((a, i) => {
            console.log(`[${i+1}] ${a.AppointmentDateTime || a.StartTime}`);
            console.log(`    Status: ${a.AppointmentStatusDescription || a.Status}`);
            console.log(`    Location: ${a.LocationName}`);
            console.log(`    Type: ${a.AppointmentTypeDescription}`);
            console.log(`    GUID: ${a.AppointmentGUID}`);
            console.log('');
        });

        // Find conflicts with 1/13/2026 7:00 AM
        const conflicting = result.data.appointments.filter(a => {
            const time = a.AppointmentDateTime || a.StartTime;
            return time && time.includes('1/13/2026');
        });

        if (conflicting.length > 0) {
            console.log('⚠️  CONFLICTS with 1/13/2026:');
            conflicting.forEach(a => {
                console.log(`   - ${a.AppointmentDateTime} at ${a.LocationName}`);
            });
        }
    } else {
        console.log('No appointments found for this patient.');
    }
}

main().catch(console.error);

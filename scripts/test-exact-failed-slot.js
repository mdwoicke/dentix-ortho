/**
 * Test booking the EXACT failed slot from the screenshot
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
            headers: {
                'Content-Type': 'application/json',
                'Authorization': AUTH_HEADER,
            },
            timeout: 30000,
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data: data });
                }
            });
        });

        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function main() {
    console.log('Testing EXACT failed slot from screenshot...\n');

    // The EXACT data from the failed booking screenshot
    const bookingData = {
        uui: TEST_UUI,
        patientGUID: 'E4DC31A2-6657-4505-A824-B49A7299E6AE',
        startTime: '1/13/2026 7:00:00 AM',
        scheduleViewGUID: 'ed92750a-fdf8-4a09-8219-a1a130c0b822',
        scheduleColumnGUID: '5273a655-b606-4902-bcc7-04ee42a04ee8',
        appointmentTypeGUID: 'f6c20c35-9abb-47c2-981a-342996016705',
        minutes: 40
    };

    console.log('Booking request:');
    console.log(JSON.stringify(bookingData, null, 2));

    const result = await makeRequest('/createAppt', bookingData);

    console.log('\nBooking result:');
    console.log(JSON.stringify(result.data, null, 2));

    if (result.data.success) {
        console.log('\n✅ BOOKING SUCCEEDED!');
        console.log('   appointmentGUID:', result.data.appointmentGUID);

        // Cancel
        console.log('\n   Canceling test appointment...');
        await makeRequest('/cancelAppt', { uui: TEST_UUI, appointmentGUID: result.data.appointmentGUID });
        console.log('   Canceled.');
    } else {
        console.log('\n❌ BOOKING FAILED!');
        console.log('   Error:', result.data.message || result.data.error);

        // Check if patient already has appointment
        console.log('\n   Checking patient appointments...');
        const appts = await makeRequest('/getAppointmentsByPatient', {
            uui: TEST_UUI,
            patientGUID: 'E4DC31A2-6657-4505-A824-B49A7299E6AE'
        });

        if (appts.data.appointments && appts.data.appointments.length > 0) {
            console.log(`   Patient has ${appts.data.appointments.length} existing appointments:`);
            appts.data.appointments.forEach((a, i) => {
                console.log(`   [${i+1}] ${a.StartTime || a.AppointmentDateTime} - ${a.Status || a.AppointmentStatusDescription}`);
            });
        } else {
            console.log('   Patient has no existing appointments.');
        }

        // Check if slot is still available
        console.log('\n   Re-checking slot availability...');
        const slots = await makeRequest('/getApptSlots', {
            uui: TEST_UUI,
            startDate: '01/13/2026',
            endDate: '01/13/2026'
        });

        const matchingSlot = slots.data.slots?.find(s =>
            s.startTime === '1/13/2026 7:00:00 AM' &&
            s.scheduleViewGUID === 'ed92750a-fdf8-4a09-8219-a1a130c0b822'
        );

        if (matchingSlot) {
            console.log('   Slot IS still available in the system.');
            console.log('   Slot details:', JSON.stringify(matchingSlot, null, 2));
        } else {
            console.log('   Slot is NO LONGER available (may have been booked).');
        }
    }
}

main().catch(console.error);

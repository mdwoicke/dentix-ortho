/**
 * Test Cloud9 with schdvwGUIDs filter only
 */
const fetch = require('node-fetch');

const CLOUD9 = {
    endpoint: 'https://us-ea1-partner.cloud9ortho.com/GetData.ashx',
    clientId: 'b42c51be-2529-4d31-92cb-50fd1a58c084',
    userName: 'Intelepeer',
    password: '$#1Nt-p33R-AwS#$',
    namespace: 'http://schemas.practica.ws/cloud9/partners/'
};

const TARGET_SV = '4c9e9333-4951-4eb0-8d97-e1ad83ef422d';
const TARGET_APPT_TYPE = 'f6c20c35-9abb-47c2-981a-342996016705';

function escapeXml(str) {
    if (!str) return '';
    return String(str).replace(/[<>&'"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;',"'":'&apos;','"':'&quot;'}[c]));
}

async function testFilter() {
    console.log('=== Testing Cloud9 with schdvwGUIDs filter ===');
    console.log('Target ScheduleViewGUID:', TARGET_SV);
    console.log('');

    const params = {
        startDate: '01/14/2026 7:00:00 AM',
        endDate: '03/15/2026 5:00:00 PM',
        morning: 'True',
        afternoon: 'True',
        appttypGUIDs: TARGET_APPT_TYPE,
        schdvwGUIDs: TARGET_SV
    };

    console.log('Parameters:');
    Object.entries(params).forEach(([k, v]) => console.log('  ' + k + ':', v));
    console.log('');

    const paramElements = Object.entries(params).map(([k, v]) => `<${k}>${escapeXml(v)}</${k}>`).join('');
    const xml = `<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="${CLOUD9.namespace}"><ClientID>${CLOUD9.clientId}</ClientID><UserName>${CLOUD9.userName}</UserName><Password>${escapeXml(CLOUD9.password)}</Password><Procedure>GetOnlineReservations</Procedure><Parameters>${paramElements}</Parameters></GetDataRequest>`;

    const response = await fetch(CLOUD9.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/xml' },
        body: xml
    });

    const text = await response.text();
    const statusMatch = text.match(/<ResponseStatus>([^<]+)<\/ResponseStatus>/);
    const errorMatch = text.match(/<ErrorCode>([^<]+)<\/ErrorCode>/);
    const recordCount = (text.match(/<Record>/g) || []).length;

    console.log('HTTP Status:', response.status);
    console.log('Response Status:', statusMatch ? statusMatch[1] : 'unknown');

    if (errorMatch) {
        const errorMsg = text.match(/<ErrorMessage>([^<]+)<\/ErrorMessage>/);
        console.log('Error Code:', errorMatch[1]);
        console.log('Error Message:', errorMsg ? errorMsg[1] : 'unknown');
    } else {
        console.log('Records returned:', recordCount);

        if (recordCount > 0) {
            // Parse first record
            const recordMatch = text.match(/<Record>([\s\S]*?)<\/Record>/);
            if (recordMatch) {
                console.log('\nFirst slot:');
                const fields = ['ScheduleViewGUID', 'LocationGUID', 'ScheduleColumnGUID', 'StartTime', 'Minutes'];
                fields.forEach(field => {
                    const match = recordMatch[1].match(new RegExp(`<${field}>([^<]*)</${field}>`));
                    if (match) console.log('  ' + field + ':', match[1]);
                });
            }
        } else {
            console.log('\n*** NO SLOTS RETURNED WITH FILTER ***');
            console.log('This confirms the schdvwGUIDs filter is not working as expected.');
        }
    }
}

testFilter().catch(e => console.error('Error:', e.message));

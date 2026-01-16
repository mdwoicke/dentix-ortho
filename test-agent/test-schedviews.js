const axios = require('axios');

const CLOUD9_ENDPOINT = 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx';
const CLIENT_ID = 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56';
const USER_NAME = 'IntelepeerTest';
const PASSWORD = '#!InteleP33rTest!#';

function buildXmlRequest(procedure, params) {
  const paramElements = Object.entries(params)
    .filter(([_, v]) => v !== null && v !== undefined)
    .map(([k, v]) => '<' + k + '>' + v + '</' + k + '>')
    .join('');
  return '<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"><ClientID>' + CLIENT_ID + '</ClientID><UserName>' + USER_NAME + '</UserName><Password>' + PASSWORD + '</Password><Procedure>' + procedure + '</Procedure><Parameters>' + paramElements + '</Parameters></GetDataRequest>';
}

async function main() {
  // First get all schedule views
  console.log('=== Getting Schedule Views ===');
  const schedViewXml = buildXmlRequest('GetScheduleViews', {});
  const schedViewResp = await axios.post(CLOUD9_ENDPOINT, schedViewXml, {
    headers: { 'Content-Type': 'application/xml' },
    timeout: 30000
  });

  console.log('Response length:', schedViewResp.data.length);
  console.log('Schedule Views Response:');
  console.log(schedViewResp.data.substring(0, 4000));

  // Extract schedule view GUIDs
  const guidMatches = schedViewResp.data.match(/ScheduleViewGUID>([^<]+)</g) || [];
  console.log('\nFound', guidMatches.length, 'schedule views');

  // Try getting slots with all schedule views
  if (guidMatches.length > 0) {
    const guids = guidMatches.map(m => m.replace('ScheduleViewGUID>', '').replace('<', ''));
    console.log('\nGUIDs:', guids.slice(0, 10).join(', '));

    // Try slots with all guids
    console.log('\n=== Testing slots with all found GUIDs ===');
    const allGuids = guids.join(',');

    const slotsXml = buildXmlRequest('GetOnlineReservations', {
      startDate: '01/14/2026',
      endDate: '02/14/2026', // 1 month range
      schdvwGUIDs: allGuids
    });

    const slotsResp = await axios.post(CLOUD9_ENDPOINT, slotsXml, {
      headers: { 'Content-Type': 'application/xml' },
      timeout: 30000
    });

    const recordMatches = slotsResp.data.match(/<Record>/g);
    console.log('Record count:', recordMatches ? recordMatches.length : 0);
    console.log('Response:', slotsResp.data.substring(0, 2000));
  }
}

main().catch(e => console.error('Error:', e.message));

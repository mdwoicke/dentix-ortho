const axios = require('axios');

// Cloud9 Sandbox credentials and endpoint
const CLOUD9_ENDPOINT = 'https://us-ea1-partnertest.cloud9ortho.com/GetData.ashx';
const CLIENT_ID = 'c15aa02a-adc1-40ae-a2b5-d2e39173ae56';
const USER_NAME = 'IntelepeerTest';
const PASSWORD = '#!InteleP33rTest!#';

// Build XML request
function buildXmlRequest(procedure, params) {
  const paramElements = Object.entries(params)
    .filter(([_, v]) => v !== null && v !== undefined)
    .map(([k, v]) => '<' + k + '>' + v + '</' + k + '>')
    .join('');

  return '<?xml version="1.0" encoding="utf-8"?><GetDataRequest xmlns="http://schemas.practica.ws/cloud9/partners/"><ClientID>' + CLIENT_ID + '</ClientID><UserName>' + USER_NAME + '</UserName><Password>' + PASSWORD + '</Password><Procedure>' + procedure + '</Procedure><Parameters>' + paramElements + '</Parameters></GetDataRequest>';
}

async function testSlots() {
  // Test GetOnlineReservations with date range
  const startDate = '01/14/2026';
  const endDate = '01/21/2026';

  console.log('Testing GetOnlineReservations...');
  console.log('Date range:', startDate, 'to', endDate);

  const xml = buildXmlRequest('GetOnlineReservations', {
    startDate: startDate,
    endDate: endDate
  });

  console.log('\nRequest XML length:', xml.length);

  try {
    const response = await axios.post(CLOUD9_ENDPOINT, xml, {
      headers: { 'Content-Type': 'application/xml' },
      timeout: 30000
    });

    console.log('\nResponse status:', response.status);
    console.log('Response length:', response.data.length);

    // Count records
    const recordMatches = response.data.match(/<Record>/g);
    console.log('Record count:', recordMatches ? recordMatches.length : 0);

    // Show first 3000 chars
    console.log('\nResponse (first 3000 chars):');
    console.log(response.data.substring(0, 3000));
  } catch (err) {
    console.error('Error:', err.message);
  }
}

testSlots();

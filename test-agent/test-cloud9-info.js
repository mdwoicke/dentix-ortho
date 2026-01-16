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

async function test(procedure, params = {}) {
  console.log(`\n=== ${procedure} ===`);
  const xml = buildXmlRequest(procedure, params);
  const resp = await axios.post(CLOUD9_ENDPOINT, xml, {
    headers: { 'Content-Type': 'application/xml' },
    timeout: 30000
  });
  const recordMatches = resp.data.match(/<Record>/g);
  console.log('Records:', recordMatches ? recordMatches.length : 0);
  console.log('Response (2500 chars):', resp.data.substring(0, 2500));
  return resp.data;
}

async function main() {
  // Test GetLocations
  await test('GetLocations');

  // Test GetProviders
  await test('GetProviders');

  // Test GetApptTypes
  await test('GetApptTypes');

  // Test GetDoctors
  await test('GetDoctors');

  // Test GetOnlineReservations with different date ranges
  console.log('\n=== SLOT TESTS ===');

  // Test 1: No scheduleViewGUID
  await test('GetOnlineReservations', {
    startDate: '01/14/2026',
    endDate: '03/14/2026'
  });

  // Test 2: March-May range (maybe slots are further out?)
  await test('GetOnlineReservations', {
    startDate: '03/01/2026',
    endDate: '05/01/2026'
  });
}

main().catch(e => console.error('Error:', e.message));
